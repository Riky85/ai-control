import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { computeSavingsCached, monthlyOf, type Saving } from "@/lib/savings";
import { dismissSavingAction, restoreSavingsAction } from "@/lib/spend-actions";
import { acceptSavingAction, updateSavingActionAction } from "@/lib/savings-actions";
import { savedSoFar, LEDGER_KIND_LABEL, VERIFY_AFTER_DAYS, type LedgerKind, type SavedSoFar } from "@/lib/savings-ledger";
import { contractRows, NOTICE_ALERT_DAYS } from "@/lib/contracts";
import { VendorBadge } from "@/components/VendorIcon";
import ExportMenu from "@/components/ExportMenu";
import { Notice, PageHeader, StatCard, Table, Tabs, td } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import { PRICES_AS_OF, MANAGE_URL } from "@/lib/pricing/catalog";
import { upcomingRenewals } from "@/lib/renewals";
import { fmtDate } from "@/lib/format";
import { db } from "@/lib/db";
import { GUARANTEE, planById } from "@/lib/plans";
import FilterBar from "@/components/FilterBar";

export const dynamic = "force-dynamic";

const DAY = 86400000;

const CONF: Record<string, { label: string; cls: string }> = {
  HIGH: { label: "Sure", cls: "text-steady bg-steady/10" },
  MEDIUM: { label: "Likely", cls: "text-signal bg-signal/10" },
  LOW: { label: "Worth checking", cls: "text-ink-400 bg-ink-400/10" },
};

// Le leve di risparmio, in ordine di quanto sono "sicure".
const KIND_LABEL: Record<string, string> = {
  seats: "Unused seats",
  annual: "Yearly billing",
  idle: "Nobody uses it",
  duplicate: "Duplicate tools",
  premium: "Premium → standard",
  model: "Cheaper model",
  alternative: "Cheaper provider",
};
const KIND_ORDER = ["seats", "annual", "idle", "duplicate", "premium", "model", "alternative"];
type View = "suggestions" | "progress" | "contracts";

// Risparmi calcolati da soli (Suggestions), quelli realizzati (In progress) e i contratti.
export default async function SavingsPage({ searchParams }: { searchParams: { confidence?: string; kind?: string; view?: string; error?: string } }) {
  const orgId = currentOrgId();
  const view: View = searchParams.view === "progress" || searchParams.view === "contracts" ? searchParams.view : "suggestions";
  const [{ items: all, totalMonthly, assets }, saved, contracts, org] = await Promise.all([
    computeSavingsCached(orgId),
    savedSoFar(orgId),
    contractRows(orgId),
    db.organization.findUnique({ where: { id: orgId }, select: { plan: true, createdAt: true } }),
  ]);
  const spend = assets.reduce((s, a) => s + (monthlyOf(a)?.eur ?? 0), 0);
  const inProgress = saved.counts.accepted + saved.counts.done;
  const soonDeadlines = contracts.filter((c) => c.daysLeft != null && c.daysLeft >= 0 && c.daysLeft <= NOTICE_ALERT_DAYS).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Savings"
        subtitle="Where you can cut your AI bill."
        action={
          <>
            <Link href="/providers" className="btn btn-ghost btn-sm">Providers</Link>
            <Link href="/advisor" className="btn btn-ghost btn-sm">Advisor</Link>
            <ExportMenu dataset="savings" />
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="You could save" value={`${fmtEur(totalMonthly)}/mo`} hint={spend ? `${Math.round((totalMonthly / spend) * 100)}% of ${fmtEur(spend)}/mo AI spend` : `${fmtEur(totalMonthly * 12)} a year`} tone="accent" href="/savings" />
        <StatCard
          label="Saved so far"
          value={`${fmtEur(saved.savedMonthly)}/mo`}
          hint={saved.verifiedMonthly >= 1 ? `${fmtEur(saved.verifiedMonthly)}/mo confirmed on your bills` : saved.savedMonthly >= 1 ? `${fmtEur(saved.savedMonthly * 12)} a year` : "Accept a suggestion to track it"}
          href="/savings?view=progress"
        />
      </div>

      <Tabs
        active={view}
        items={[
          { key: "suggestions", label: "Suggestions", href: "/savings", count: all.length || undefined },
          { key: "progress", label: "In progress", href: "/savings?view=progress", count: inProgress || undefined },
          { key: "contracts", label: "Contracts", href: "/savings?view=contracts", count: soonDeadlines || undefined },
        ]}
      />

      {searchParams.error && <Notice tone="error">{searchParams.error}</Notice>}

      {view === "suggestions" && <Suggestions all={all} spend={spend} searchParams={searchParams} orgId={orgId} />}
      {view === "progress" && <Progress saved={saved} canSave={totalMonthly} org={org} />}
      {view === "contracts" && <Contracts rows={contracts} />}
    </div>
  );
}

// ── Suggerimenti ───────────────────────────────────────────────────────────
async function Suggestions({
  all,
  spend,
  searchParams,
  orgId,
}: {
  all: Saving[];
  spend: number;
  searchParams: { confidence?: string; kind?: string };
  orgId: string;
}) {
  const items = all.filter((i) => (!searchParams.confidence || i.confidence === searchParams.confidence) && (!searchParams.kind || i.kind === searchParams.kind));
  const [dismissed, renewals] = await Promise.all([db.savingDismissal.count({ where: { organizationId: orgId } }), upcomingRenewals(orgId, 60)]);
  const soon = renewals.filter((r) => r.annual || r.date.getTime() - Date.now() < 7 * DAY);

  return (
    <>
      {all.length > 0 && (
        <FilterBar
          filters={[
            {
              param: "kind",
              label: "Type",
              options: KIND_ORDER.filter((k) => all.some((i) => i.kind === k)).map((k) => ({ value: k, label: KIND_LABEL[k] })),
            },
          ]}
          right={`${items.length} of ${all.length} suggestion${all.length === 1 ? "" : "s"}`}
        />
      )}

      {items.length === 0 && all.length > 0 ? (
        <p className="text-sm text-ink-400">No suggestions match these filters.</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center">
          <h2 className="text-lg font-semibold text-ink-100">{spend ? "Nothing to save right now" : "angar needs to see what you pay"}</h2>
          <p className="text-sm text-ink-400 mt-1 max-w-lg mx-auto">
            {spend
              ? "Your AI spend looks tidy."
              : "Upload a bank statement or invoices to find savings."}
          </p>
          {!spend && <Link href="/sources" className="btn btn-primary mt-5">Add a bank statement</Link>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((s) => (
            <SavingRow key={s.key} s={s} />
          ))}
        </div>
      )}

      {soon.length > 0 && (
        <details className="rounded-xl border border-line bg-panel group">
          <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium text-ink-100 flex items-center justify-between select-none">
            Coming renewals · {soon.length}
            <span className="text-ink-400 transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="divide-y divide-line border-t border-line">
            {soon.map((r) => (
              <Link key={r.assetId + r.date.toISOString()} href={`/assets/${r.assetId}`} className="flex items-center gap-4 px-5 py-3 hover:bg-ink-100/[0.02] transition-colors">
                <span className="w-24 text-sm text-ink-400 tabular">{fmtDate(r.date)}</span>
                <span className="flex-1 text-sm text-ink-100">{r.name} <span className="text-ink-400">· {r.annual ? "yearly" : "monthly"}</span></span>
                <span className="text-sm tabular text-ink-100">{fmtEur(r.amountEur)}</span>
              </Link>
            ))}
          </div>
        </details>
      )}

      <div className="flex items-center justify-between text-xs text-ink-400">
        <span>Estimates, list prices as of {PRICES_AS_OF}.</span>
        {dismissed > 0 && (
          <form action={restoreSavingsAction}>
            <button className="underline hover:text-ink-100">Show {dismissed} hidden suggestion{dismissed === 1 ? "" : "s"}</button>
          </form>
        )}
      </div>
    </>
  );
}

function manageUrl(s: Saving) {
  const a = s.kind === "duplicate" ? s.assets[1] : s.assets[0];
  return a?.serviceId ? MANAGE_URL[a.serviceId] ?? null : null;
}

function SavingRow({ s }: { s: Saving }) {
  const c = CONF[s.confidence];
  return (
    <div className="rounded-xl border border-line bg-panel p-4 flex flex-wrap md:flex-nowrap items-center gap-4 animate-rise">
      <div className="flex -space-x-2 shrink-0">
        {s.assets.slice(0, 3).map((a) => (
          <span key={a.id} className="rounded-lg ring-2 ring-panel">
            <VendorBadge vendor={a.vendor ?? ""} name={a.name} size={36} />
          </span>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link href={s.href} className="text-[15px] font-semibold text-ink-100 hover:underline">{s.title}</Link>
          <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${c.cls}`}>{c.label}</span>
        </div>
        <p className="text-sm text-ink-400 mt-0.5">{s.detail}</p>
      </div>
      <div className="text-right shrink-0">
        <div className="font-display text-xl font-semibold text-ink-100 tabular">{fmtEur(s.monthlyEur)}<span className="text-sm text-ink-400 font-normal">/mo</span></div>
        <div className="text-xs text-ink-400 tabular">{fmtEur(s.monthlyEur * 12)} a year</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {manageUrl(s) && (
          <a href={manageUrl(s)!} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" title="Open the provider's billing page">
            Billing ↗
          </a>
        )}
        <form action={acceptSavingAction}>
          <input type="hidden" name="key" value={s.key} />
          <button className="btn btn-primary btn-sm" title="We'll do it — track it under In progress">Accept</button>
        </form>
        <form action={acceptSavingAction}>
          <input type="hidden" name="key" value={s.key} />
          <input type="hidden" name="done" value="1" />
          <button className="btn btn-secondary btn-sm" title="Already done — angar checks the next bills to confirm it">Mark done</button>
        </form>
        <form action={dismissSavingAction}>
          <input type="hidden" name="key" value={s.key} />
          <button className="btn btn-ghost btn-sm btn-icon w-8" aria-label="Not for us" title="Not for us — hide">
            ✕
          </button>
        </form>
      </div>
    </div>
  );
}

// ── In corso / realizzati ──────────────────────────────────────────────────
const STATUS_ORDER: Record<string, number> = { accepted: 0, done: 1, verified: 2, failed: 3 };

function statusOf(r: SavedSoFar["rows"][number], notConfirmed: Set<string>) {
  if (r.status === "accepted") return { label: "To do", cls: "text-ink-100 bg-ink-100/10" };
  if (r.status === "done") return notConfirmed.has(r.id) ? { label: "Not confirmed yet", cls: "text-signal bg-signal/10" } : { label: "Done · checking bills", cls: "text-accent bg-accent/10" };
  if (r.status === "verified") return { label: "Confirmed", cls: "text-steady bg-steady/10" };
  return { label: "Didn't work", cls: "text-alarm bg-alarm/10" };
}

function Progress({ saved, canSave, org }: { saved: SavedSoFar; canSave: number; org: { plan: Parameters<typeof planById>[0]; createdAt: Date } | null }) {
  const rows = [...saved.rows].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.acceptedAt.getTime() - a.acceptedAt.getTime());
  const price = org ? planById(org.plan)?.price ?? null : null;
  const day = org ? Math.max(1, Math.ceil((Date.now() - org.createdAt.getTime()) / DAY)) : 0;
  const pct = price ? Math.min(100, Math.round((saved.savedMonthly / price) * 100)) : 0;

  return (
    <>
      {price ? (
        <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-semibold text-ink-100">90-day guarantee</h2>
            <span className="text-xs text-ink-400">{day <= 90 ? `Day ${day} of 90` : "First 90 days completed"}</span>
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink-100/[0.06]">
            <span className={`h-full ${pct >= 100 ? "bg-steady" : "bg-accent"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm text-ink-400">
            Saved <span className="text-ink-100 font-medium">{fmtEur(saved.savedMonthly)}/mo</span> of your {fmtEur(price)}/mo subscription
            {pct >= 100 ? " — angar has paid for itself." : "."}
            <span className="block text-xs mt-1">{GUARANTEE}</span>
          </p>
        </section>
      ) : null}

      <Table
        columns={["Change", "Type", "Status", { label: "Expected", className: "text-right" }, { label: "Confirmed", className: "text-right" }, "Since", ""]}
        empty={rows.length === 0 ? "Nothing in progress yet. Accept a suggestion to track it here." : false}
      >
        {rows.map((r) => {
          const st = statusOf(r, saved.notConfirmedIds);
          return (
            <tr key={r.id}>
              <td className={`${td} text-ink-100`}>
                {r.assetId ? <Link href={`/assets/${r.assetId}`} className="hover:underline">{r.title}</Link> : r.title}
                <span className="block text-xs text-ink-400">by {r.createdBy}</span>
              </td>
              <td className={`${td} text-ink-400`}>{LEDGER_KIND_LABEL[r.kind as LedgerKind] ?? r.kind}</td>
              <td className={td}>
                <span className={`text-xs font-medium rounded-full px-2 py-0.5 whitespace-nowrap ${st.cls}`} title={st.label === "Not confirmed yet" ? `No lower charge ${VERIFY_AFTER_DAYS} days after it was done — check the provider's billing.` : undefined}>
                  {st.label}
                </span>
              </td>
              <td className={`${td} text-right tabular text-ink-100`}>{fmtEur(r.expectedMonthlyEur)}/mo</td>
              <td className={`${td} text-right tabular ${r.verifiedMonthlyEur != null ? "text-steady" : "text-ink-400"}`}>{r.verifiedMonthlyEur != null ? `${fmtEur(r.verifiedMonthlyEur)}/mo` : "—"}</td>
              <td className={`${td} text-ink-400 tabular whitespace-nowrap`}>{fmtDate(r.verifiedAt ?? r.doneAt ?? r.acceptedAt)}</td>
              <td className={`${td} text-right whitespace-nowrap`}>
                {r.status === "accepted" && (
                  <>
                    <ActionButton id={r.id} to="done" label="Mark done" primary />
                    <ActionButton id={r.id} to="undo" label="Undo" />
                  </>
                )}
                {r.status === "done" && <ActionButton id={r.id} to="failed" label="Didn't work" />}
              </td>
            </tr>
          );
        })}
      </Table>
      <p className="text-xs text-ink-400">angar confirms each saving on the next bills (within {VERIFY_AFTER_DAYS} days).</p>
    </>
  );
}

function ActionButton({ id, to, label, primary }: { id: string; to: "done" | "failed" | "undo"; label: string; primary?: boolean }) {
  return (
    <form action={updateSavingActionAction} className="inline-block ml-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      <button className={`btn btn-sm ${primary ? "btn-primary" : "btn-secondary"}`}>{label}</button>
    </form>
  );
}

// ── Contratti ──────────────────────────────────────────────────────────────
function Contracts({ rows }: { rows: Awaited<ReturnType<typeof contractRows>> }) {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-ink-400">By notice deadline — alert {NOTICE_ALERT_DAYS} days before.</p>
        {rows.length > 0 && (
          <a href="/savings/contracts.csv" className="btn btn-secondary btn-sm shrink-0">Export CSV</a>
        )}
      </div>
      <Table
        columns={["AI", "Cost centre", "Owner", "Auto-renew", "Term ends", "Notice deadline", { label: "Cost", className: "text-right" }]}
        empty={rows.length === 0 ? "No contracts yet — add one from an AI's page." : false}
      >
        {rows.map((r) => (
          <tr key={r.assetId}>
            <td className={td}>
              <Link href={`/assets/${r.assetId}`} className="flex items-center gap-2 text-ink-100 hover:underline">
                <VendorBadge vendor={r.vendor ?? ""} name={r.name} size={24} />
                {r.name}
              </Link>
              {r.poNumber && <span className="block text-xs text-ink-400">PO {r.poNumber}</span>}
            </td>
            <td className={`${td} text-ink-400`}>{r.costCenter ?? "—"}</td>
            <td className={`${td} text-ink-400`}>{r.owner ?? "—"}</td>
            <td className={`${td} text-ink-400`}>{r.autoRenew == null ? "—" : r.autoRenew ? "Yes" : "No"}</td>
            <td className={`${td} text-ink-400 tabular whitespace-nowrap`}>{r.termEnd ? fmtDate(r.termEnd) : "—"}</td>
            <td className={`${td} tabular whitespace-nowrap`}>
              {r.deadline ? (
                <span className={r.daysLeft! < 0 ? "text-ink-400" : r.daysLeft! <= NOTICE_ALERT_DAYS ? "text-signal font-medium" : "text-ink-100"}>
                  {fmtDate(r.deadline)}
                  <span className="text-xs text-ink-400"> · {r.daysLeft! < 0 ? "passed" : r.daysLeft === 0 ? "today" : `${r.daysLeft} days`}</span>
                </span>
              ) : (
                <span className="text-ink-400">—</span>
              )}
            </td>
            <td className={`${td} text-right tabular text-ink-100`}>{r.monthlyEur != null ? `${fmtEur(r.monthlyEur)}/mo` : "—"}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

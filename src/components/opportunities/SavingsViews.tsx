import Link from "next/link";
import { updateSavingActionAction } from "@/lib/savings-actions";
import { LEDGER_KIND_LABEL, VERIFY_AFTER_DAYS, type LedgerKind, type SavedSoFar } from "@/lib/savings-ledger";
import { contractRows, NOTICE_ALERT_DAYS } from "@/lib/contracts";
import { VendorBadge } from "@/components/VendorIcon";
import { Table, td } from "@/components/ui";
import { fmtEur, fmtDate } from "@/lib/format";
import { GUARANTEE, planById } from "@/lib/plans";
import type { SubscriptionRow } from "@/lib/pricing/subscriptions";
import { fmtMoney } from "@/lib/pricing/service";

/**
 * Viste del vecchio /savings, spostate dentro Opportunities (stesse schede): In progress (registro
 * dei risparmi), Contracts e Subscriptions. Subscriptions compare anche in Spend.
 */

const DAY = 86400000;

// ── In corso / realizzati ──────────────────────────────────────────────────
const STATUS_ORDER: Record<string, number> = { accepted: 0, done: 1, verified: 2, failed: 3 };

function statusOf(r: SavedSoFar["rows"][number], notConfirmed: Set<string>) {
  if (r.status === "accepted") return { label: "To do", cls: "text-ink-100 bg-ink-100/10" };
  if (r.status === "done") return notConfirmed.has(r.id) ? { label: "Not confirmed yet", cls: "text-signal bg-signal/10" } : { label: "Checking bills", cls: "text-ink-400 bg-ink-100/[0.06]" };
  if (r.status === "verified") return { label: "Confirmed", cls: "text-steady bg-steady/10" };
  return { label: "Didn't work", cls: "text-alarm bg-alarm/10" };
}

export function Progress({ saved, org, extra }: { saved: SavedSoFar; canSave?: number; extra?: React.ReactNode; org: { plan: Parameters<typeof planById>[0]; createdAt: Date } | null }) {
  const rows = [...saved.rows].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.acceptedAt.getTime() - a.acceptedAt.getTime());
  const price = org ? planById(org.plan)?.price ?? null : null;
  const day = org ? Math.max(1, Math.ceil((Date.now() - org.createdAt.getTime()) / DAY)) : 0;
  const pct = price ? Math.min(100, Math.round((saved.savedMonthly / price) * 100)) : 0;

  return (
    <>
      {price ? (
        <section className="rounded-xl border border-line bg-panel flex flex-col animate-rise">
          <div className="flex items-baseline justify-between gap-4 bg-ink border-b border-line rounded-t-xl px-5 py-3 bar-head">
            <h2 className="text-sm font-bold text-ink-100">90-day guarantee</h2>
            <span className="text-xs text-ink-400">{day <= 90 ? `Day ${day} of 90` : "Done"}</span>
          </div>
          <div className="p-5 flex flex-col gap-3">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink-100/[0.06]">
            <span className={`h-full ${pct >= 100 ? "bg-steady" : "bg-ink-100/40"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm text-ink-400 tabular" title={GUARANTEE}>
            <span className="text-ink-100 font-medium">{fmtEur(saved.savedMonthly)}/mo</span> of {fmtEur(price)}/mo
            {pct >= 100 ? " · paid for itself" : ""}
          </p>
          </div>
        </section>
      ) : null}

      <Table
        columns={["Change", "Status", { label: "Expected", className: "text-right" }, { label: "Confirmed", className: "text-right" }, "Since", ""]}
        empty={rows.length === 0 ? "Nothing in progress." : false}
      >
        {rows.map((r) => {
          const st = statusOf(r, saved.notConfirmedIds);
          return (
            <tr key={r.id}>
              <td className={`${td} text-ink-100`}>
                {r.assetId ? <Link href={`/assets/${r.assetId}`} className="hover:underline">{r.title}</Link> : r.title}
                <span className="block text-xs text-ink-400">{LEDGER_KIND_LABEL[r.kind as LedgerKind] ?? r.kind} · {r.createdBy}</span>
              </td>
              <td className={td}>
                <span className={`text-[10px] rounded-[2px] px-1.5 py-0.5 font-mono uppercase tracking-[0.05em] whitespace-nowrap ${st.cls}`} title={st.label === "Not confirmed yet" ? `No lower charge ${VERIFY_AFTER_DAYS} days after it was done — check the provider's billing.` : undefined}>
                  {st.label}
                </span>
              </td>
              <td className={`${td} text-right tabular text-ink-100`}>{fmtEur(r.expectedMonthlyEur)}/mo</td>
              <td className={`${td} text-right tabular ${r.verifiedMonthlyEur != null ? "text-steady" : "text-ink-400"}`}>{r.verifiedMonthlyEur != null ? `${fmtEur(r.verifiedMonthlyEur)}/mo` : "—"}</td>
              <td className={`${td} text-ink-400 tabular whitespace-nowrap`}>{fmtDate(r.verifiedAt ?? r.doneAt ?? r.acceptedAt)}</td>
              <td className={`${td} text-right whitespace-nowrap`}>
                {r.status === "accepted" && (
                  <>
                    <ActionButton id={r.id} to="done" label="Mark done" />
                    <ActionButton id={r.id} to="undo" label="Undo" />
                  </>
                )}
                {r.status === "done" && <ActionButton id={r.id} to="failed" label="Didn't work" />}
              </td>
            </tr>
          );
        })}
      </Table>
      {extra}
    </>
  );
}

function ActionButton({ id, to, label }: { id: string; to: "done" | "failed" | "undo"; label: string }) {
  return (
    <form action={updateSavingActionAction} className="inline-block ml-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      <button className="btn btn-sm btn-secondary">{label}</button>
    </form>
  );
}

// ── Contratti ──────────────────────────────────────────────────────────────
export function Contracts({ rows }: { rows: Awaited<ReturnType<typeof contractRows>> }) {
  return (
    <>
      <Table
        title="Contracts"
        action={rows.length > 0 ? <a href="/savings/contracts.csv" className="btn btn-secondary btn-sm shrink-0">Export CSV</a> : undefined}
        columns={["AI", "Owner", "Auto-renew", { label: "Notice by", className: "" }, { label: "Cost", className: "text-right" }, ""]}
        empty={rows.length === 0 ? "No contracts yet." : false}
      >
        {rows.map((r) => (
          <tr key={r.assetId}>
            <td className={td}>
              <Link href={`/assets/${r.assetId}`} className="flex items-center gap-2 text-ink-100 hover:underline">
                <VendorBadge vendor={r.vendor ?? ""} name={r.name} size={24} />
                {r.name}
              </Link>
              {(r.poNumber || r.costCenter) && <span className="block text-xs text-ink-400">{[r.poNumber && `PO ${r.poNumber}`, r.costCenter].filter(Boolean).join(" · ")}</span>}
            </td>
            <td className={`${td} text-ink-400`}>{r.owner ?? "—"}</td>
            <td className={`${td} text-ink-400`}>{r.autoRenew == null ? "—" : r.autoRenew ? "Yes" : "No"}</td>
            <td className={`${td} tabular whitespace-nowrap`} title={r.termEnd ? `Term ends ${fmtDate(r.termEnd)}` : undefined}>
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
            <td className={`${td} text-right whitespace-nowrap`}>
              <Link href={`/negotiate/${r.assetId}`} className="btn btn-secondary btn-sm">Negotiate</Link>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

// ── Abbonamenti ────────────────────────────────────────────────────────────
// Uno per AI (quello inserito a mano vince), dal rinnovo più vicino.
const BASIS_LABEL: Record<string, string> = { billed: "Billed", contract: "Contract price", list: "List price" };
export function Subscriptions({ rows }: { rows: SubscriptionRow[] }) {
  return (
    <>
      <Table
        columns={["AI", "Plan", "Seats", "Billing", "Renewal", { label: "Cost", className: "text-right" }]}
        empty={rows.length === 0 ? "No subscriptions yet." : false}
      >
        {rows.map((r) => (
          <tr key={r.assetId}>
            <td className={td}>
              <Link href={`/assets/${r.assetId}`} className="flex items-center gap-2 text-ink-100 hover:underline" title={r.source}>
                <VendorBadge vendor={r.vendor ?? ""} name={r.name} size={24} />
                {r.name}
              </Link>
            </td>
            <td className={`${td} text-ink-400`}>{r.plan}</td>
            <td className={`${td} text-ink-400 tabular`}>{r.seats}</td>
            <td className={`${td} text-ink-400`}>{r.cycle === "annual" ? "Yearly" : r.cycle === "monthly" ? "Monthly" : r.cycle === "usage" ? "On usage" : "—"}</td>
            <td className={`${td} text-ink-400 tabular whitespace-nowrap`}>{r.renewalDate ? fmtDate(r.renewalDate) : "—"}</td>
            <td className={`${td} text-right tabular whitespace-nowrap`}>
              {r.monthly ? (
                <>
                  <span className="text-ink-100">{fmtMoney(Math.round(r.monthly.amount * 100) / 100, r.monthly.currency)} a month</span>
                  <span className="block text-xs text-ink-400">{BASIS_LABEL[r.monthly.basis]}</span>
                </>
              ) : (
                <span className="text-ink-400">UNKNOWN</span>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

// ── Rinnovi in arrivo (prima sotto i suggerimenti di /savings) ─────────────
export function ComingRenewals({ rows }: { rows: { assetId: string; name: string; date: Date; amountEur: number; annual: boolean }[] }) {
  // Annuali sempre (vanno decisi prima), mensili solo se entro una settimana.
  const soon = rows.filter((r) => r.annual || r.date.getTime() - Date.now() < 7 * DAY);
  if (!soon.length) return null;
  return (
    <details className="rounded-xl border border-line bg-panel overflow-hidden group" open>
      <summary className="cursor-pointer list-none bg-ink px-5 py-3 text-sm font-semibold text-ink-100 flex items-center justify-between select-none group-open:border-b group-open:border-line bar-head">
        Coming renewals · {soon.length}
        <span className="text-ink-400 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="divide-y divide-line">
        {soon.map((r) => (
          <Link key={r.assetId + r.date.toISOString()} href={`/assets/${r.assetId}`} className="flex items-center gap-4 px-5 py-3 hover:bg-ink-100/[0.02] transition-colors">
            <span className="w-24 text-sm text-ink-400 tabular">{fmtDate(r.date)}</span>
            <span className="flex-1 text-sm text-ink-100">{r.name} <span className="text-ink-400">· {r.annual ? "yearly" : "monthly"}</span></span>
            <span className="text-sm tabular text-ink-100">{fmtEur(r.amountEur)}</span>
          </Link>
        ))}
      </div>
    </details>
  );
}

import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { computeSavings, monthlyOf, type Saving } from "@/lib/savings";
import { dismissSavingAction, restoreSavingsAction } from "@/lib/spend-actions";
import { VendorBadge } from "@/components/VendorIcon";
import ExportMenu from "@/components/ExportMenu";
import { PageHeader, StatCard } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import { PRICES_AS_OF, MANAGE_URL } from "@/lib/pricing/catalog";
import { upcomingRenewals } from "@/lib/renewals";
import { fmtDate } from "@/lib/format";
import { db } from "@/lib/db";
import FilterBar from "@/components/FilterBar";

export const dynamic = "force-dynamic";

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
// Arancione angar in testa, poi toni neutri: la barra resta leggibile su tema scuro e chiaro.
const BAR = ["#FF7323", "#E0B44C", "#6BA368", "#5B8DB8", "#9B7DB8", "#B8737A", "#8A8884"];

// Risparmi calcolati da soli: nessun dato da inserire.
export default async function SavingsPage({ searchParams }: { searchParams: { confidence?: string; kind?: string } }) {
  const orgId = currentOrgId();
  const { items: all, totalMonthly, assets, byKind } = await computeSavings(orgId);
  const breakdown = KIND_ORDER.map((k) => ({ kind: k, ...(byKind.get(k as Saving["kind"]) ?? { monthly: 0, count: 0 }) })).filter((b) => b.monthly >= 1).sort((a, b) => b.monthly - a.monthly);
  const items = all.filter((i) => (!searchParams.confidence || i.confidence === searchParams.confidence) && (!searchParams.kind || i.kind === searchParams.kind));
  const [dismissed, renewals] = await Promise.all([db.savingDismissal.count({ where: { organizationId: orgId } }), upcomingRenewals(orgId, 60)]);
  const soon = renewals.filter((r) => r.annual || r.date.getTime() - Date.now() < 7 * 86400000);
  const spend = assets.reduce((s, a) => s + (monthlyOf(a)?.eur ?? 0), 0);
  const sure = all.filter((i) => i.confidence === "HIGH").reduce((s, i) => s + i.monthlyEur, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Savings" subtitle="angar compares what you pay with how the AI is used and today's prices — no data to enter." action={<ExportMenu dataset="savings" />} />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="You could save" value={`${fmtEur(totalMonthly)}/mo`} hint={`${fmtEur(totalMonthly * 12)} a year`} tone="accent" href="/savings" />
        <StatCard label="Of which certain" value={`${fmtEur(sure)}/mo`} hint="Based on your own bills and usage" href="/savings?confidence=HIGH" />
        <StatCard href="/?paid=yes#your-ai" label="AI spend today" value={`${fmtEur(spend)}/mo`} hint={spend ? `${Math.round((totalMonthly / spend) * 100)}% could be saved` : "Add a bank statement to see it"} />
      </div>

      {breakdown.length > 0 && (
        <section className="rounded-xl border border-line bg-panel p-5">
          <h2 className="text-sm font-semibold text-ink-100">Where the money is</h2>
          <p className="text-sm text-ink-400 mt-0.5 mb-4">The {fmtEur(totalMonthly)}/mo split by type. Click one to see only those.</p>
          {/* Barra proporzionale: quanto pesa ogni leva sul totale. */}
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink-100/[0.06] mb-4">
            {breakdown.map((b, i) => (
              <span key={b.kind} className="h-full" style={{ width: `${(b.monthly / totalMonthly) * 100}%`, backgroundColor: BAR[i % BAR.length] }} title={`${KIND_LABEL[b.kind]}: ${fmtEur(b.monthly)}/mo`} />
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {breakdown.map((b, i) => {
              const activeKind = searchParams.kind === b.kind;
              return (
                <Link
                  key={b.kind}
                  href={activeKind ? "/savings" : `/savings?kind=${b.kind}`}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors ${activeKind ? "border-accent/60 bg-accent/[0.06]" : "border-line hover:bg-ink-100/[0.03]"}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: BAR[i % BAR.length] }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-ink-100 truncate">{KIND_LABEL[b.kind]}</span>
                    <span className="block text-xs text-ink-400">{b.count} {b.count === 1 ? "item" : "items"}</span>
                  </span>
                  <span className="text-sm font-semibold text-ink-100 tabular shrink-0">{fmtEur(b.monthly)}<span className="text-xs text-ink-400 font-normal">/mo</span></span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {all.length > 0 && (
        <FilterBar
          filters={[
            { param: "confidence", label: "Confidence", options: [{ value: "HIGH", label: "Sure" }, { value: "MEDIUM", label: "Likely" }, { value: "LOW", label: "Worth checking" }] },
            {
              param: "kind",
              label: "Type",
              options: [
                { value: "annual", label: "Yearly billing" },
                { value: "seats", label: "Unused seats" },
                { value: "premium", label: "Premium seats" },
                { value: "duplicate", label: "Duplicate tools" },
                { value: "model", label: "Cheaper model" },
                { value: "idle", label: "Not used" },
              ].filter((o) => all.some((i) => i.kind === o.value)),
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
              ? "Your AI spend looks tidy. angar keeps checking every time new data arrives."
              : "Upload a bank statement or your e-invoices: angar finds the AI subscriptions, the seats and the plans, and tells you where to save."}
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
        <section className="rounded-xl border border-line bg-panel">
          <div className="px-5 pt-4 pb-3">
            <h2 className="text-base font-semibold text-ink-100">Coming renewals</h2>
            <p className="text-sm text-ink-400">Decide before they renew — yearly plans can't be cut until the next term.</p>
          </div>
          <div className="divide-y divide-line border-t border-line">
            {soon.map((r) => (
              <Link key={r.assetId + r.date.toISOString()} href={`/assets/${r.assetId}`} className="flex items-center gap-4 px-5 py-3 hover:bg-ink-100/[0.02] transition-colors">
                <span className="w-24 text-sm text-ink-400 tabular">{fmtDate(r.date)}</span>
                <span className="flex-1 text-sm text-ink-100">{r.name} <span className="text-ink-400">· {r.annual ? "yearly" : "monthly"}</span></span>
                <span className="text-sm tabular text-ink-100">{fmtEur(r.amountEur)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center justify-between text-xs text-ink-400">
        <span>List prices as of {PRICES_AS_OF}. Estimates — check before changing a plan.</span>
        {dismissed > 0 && (
          <form action={restoreSavingsAction}>
            <button className="underline hover:text-ink-100">Show {dismissed} hidden suggestion{dismissed === 1 ? "" : "s"}</button>
          </form>
        )}
      </div>
    </div>
  );
}

function manageUrl(s: Saving) {
  const a = s.kind === "duplicate" ? s.assets[1] : s.assets[0];
  return a?.serviceId ? MANAGE_URL[a.serviceId] ?? null : null;
}

function SavingRow({ s }: { s: Saving }) {
  const c = CONF[s.confidence];
  return (
    <div className="rounded-xl border border-line bg-panel p-5 flex items-center gap-5 animate-rise">
      <div className="flex -space-x-2 shrink-0">
        {s.assets.slice(0, 3).map((a) => (
          <span key={a.id} className="rounded-lg ring-2 ring-panel">
            <VendorBadge vendor={a.vendor ?? ""} name={a.name} size={36} />
          </span>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold text-ink-100">{s.title}</h3>
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
          <a href={manageUrl(s)!} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" title="Open the provider's billing page">
            Billing ↗
          </a>
        )}
        <Link href={s.href} className="btn btn-secondary btn-sm">Open</Link>
        <form action={dismissSavingAction}>
          <input type="hidden" name="key" value={s.key} />
          <button className="btn btn-secondary btn-sm btn-icon w-8" aria-label="Not for us" title="Not for us — hide">
            ✕
          </button>
        </form>
      </div>
    </div>
  );
}

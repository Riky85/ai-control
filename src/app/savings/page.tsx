import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { computeSavings, monthlyOf, type Saving } from "@/lib/savings";
import { dismissSavingAction, restoreSavingsAction } from "@/lib/spend-actions";
import { VendorBadge } from "@/components/VendorIcon";
import ExportMenu from "@/components/ExportMenu";
import { PageHeader, StatCard } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import { PRICES_AS_OF } from "@/lib/pricing/catalog";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const CONF: Record<string, { label: string; cls: string }> = {
  HIGH: { label: "Sure", cls: "text-steady bg-steady/10" },
  MEDIUM: { label: "Likely", cls: "text-signal bg-signal/10" },
  LOW: { label: "Worth checking", cls: "text-ink-400 bg-ink-400/10" },
};

// Risparmi calcolati da soli: nessun dato da inserire.
export default async function SavingsPage() {
  const orgId = currentOrgId();
  const { items, totalMonthly, assets } = await computeSavings(orgId);
  const dismissed = await db.savingDismissal.count({ where: { organizationId: orgId } });
  const spend = assets.reduce((s, a) => s + (monthlyOf(a)?.eur ?? 0), 0);
  const sure = items.filter((i) => i.confidence === "HIGH").reduce((s, i) => s + i.monthlyEur, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Savings" subtitle="angar compares what you pay with how the AI is used and today's prices — no data to enter." action={<ExportMenu dataset="savings" />} />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="You could save" value={`${fmtEur(totalMonthly)}/mo`} hint={`${fmtEur(totalMonthly * 12)} a year`} tone="accent" />
        <StatCard label="Of which certain" value={`${fmtEur(sure)}/mo`} hint="Based on your own bills and usage" />
        <StatCard label="AI spend today" value={`${fmtEur(spend)}/mo`} hint={spend ? `${Math.round((totalMonthly / spend) * 100)}% could be saved` : "Add a bank statement to see it"} />
      </div>

      {items.length === 0 ? (
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

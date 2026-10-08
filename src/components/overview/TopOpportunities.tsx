import Link from "next/link";
import { Panel, StatCard } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import type { Opportunity } from "@/lib/opportunities/types";
import { CategoryPill } from "@/components/opportunities/parts";

/** Overview (spec §15) — le 6 metriche dell'estate. */
export interface OverviewMetrics {
  systems: number;
  toReview: number;
  spend: number;
  estimatedEur: number;
  savingsMonthly: number;
  opportunities: number;
  concentration: { label: string; share: number } | null;
  unowned: number;
  highDependencies: number;
}

export function OverviewMetricsRow({ m }: { m: OverviewMetrics }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-6">
      <StatCard label="AI systems" value={String(m.systems)} hint={m.toReview ? `${m.toReview} to review` : "See all AI"} href={m.toReview ? "/review" : "/estate"} />
      <StatCard label="Monthly AI spend" value={m.spend ? fmtEur(m.spend) : "—"} hint={m.spend ? (m.estimatedEur >= 1 ? `${fmtEur(m.estimatedEur)} estimated` : `${fmtEur(m.spend * 12)} a year`) : "Add a bank statement"} href={m.spend ? "/spend" : "/sources"} />
      <StatCard label="Potential savings" value={m.savingsMonthly >= 1 ? `${fmtEur(m.savingsMonthly)}/mo` : "—"} hint={m.opportunities ? `${m.opportunities} opportunit${m.opportunities === 1 ? "y" : "ies"}` : undefined} href="/opportunities" />
      <StatCard label="Provider concentration" value={m.concentration ? `${Math.round(m.concentration.share * 100)}%` : "—"} hint={m.concentration?.label} tone={m.concentration && m.concentration.share >= 0.6 ? "signal" : undefined} href="/providers" />
      <StatCard label="Unowned AI systems" value={String(m.unowned)} hint={m.unowned ? "No owner assigned" : undefined} tone={m.unowned ? "signal" : undefined} href={m.unowned ? "/governance" : undefined} />
      <StatCard label="High dependencies" value={String(m.highDependencies)} hint={m.highDependencies ? "Not ready to exit" : undefined} tone={m.highDependencies ? "signal" : undefined} href={m.highDependencies ? "/estate/graph" : undefined} />
    </div>
  );
}

/** "Top opportunities": 3–5 righe dal motore decisionale, ognuna apre il dettaglio in /opportunities. */
export function TopOpportunities({ list, max = 5 }: { list: Opportunity[]; max?: number }) {
  const top = list.filter((o) => o.status === "new").slice(0, max);
  if (!top.length) return null;
  return (
    <Panel title="Top opportunities" flush action={<Link href="/opportunities" className="eyebrow hover:!text-ink-100 transition-colors">See all [→]</Link>}>
      <div className="divide-y divide-line">
        {top.map((o) => (
          <Link key={o.key} href={`/opportunities?open=${encodeURIComponent(o.key)}`} className="flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm hover:bg-ink/60 transition-colors">
            <span className="w-32 shrink-0 hidden sm:block">
              <CategoryPill category={o.category} />
            </span>
            <span className="text-ink-100 min-w-0 flex-1 truncate">{o.title}</span>
            <span className="eyebrow whitespace-nowrap hidden md:block">
              {o.effort} effort · {o.confidence === "HIGH" ? "High" : o.confidence === "MEDIUM" ? "Medium" : "Low"} confidence
            </span>
            <span className="w-28 text-right tabular whitespace-nowrap text-ink-100">
              {o.savings ? (
                <>
                  {o.savings.kind === "estimated" ? "≈ " : ""}
                  {fmtEur(o.savings.eur)}
                  <span className="text-xs text-ink-400 ml-0.5">/mo</span>
                </>
              ) : (
                <span className="text-ink-400">—</span>
              )}
            </span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

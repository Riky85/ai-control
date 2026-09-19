import { db } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

export default async function SavingsPage() {
  const assets = await db.aiAsset.findMany({
    where: { organizationId: ORG_ID, deletedAt: null },
    include: { cost: true, alternatives: true },
    orderBy: { name: "asc" },
  });

  const withCost = assets.filter((a) => a.cost?.monthlyCostEstimate != null);
  const withOpportunity = withCost
    .map((a) => {
      const best = a.alternatives.sort((x, y) => (x.estimatedMonthlyCost ?? Infinity) - (y.estimatedMonthlyCost ?? Infinity))[0];
      if (!best || best.estimatedMonthlyCost == null || a.cost!.monthlyCostEstimate! <= best.estimatedMonthlyCost) return null;
      const monthlySavings = a.cost!.monthlyCostEstimate! - best.estimatedMonthlyCost;
      return { asset: a, best, monthlySavings, annualSavings: monthlySavings * 12 };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.annualSavings - a.annualSavings);

  const totalMonthlySpend = withCost.reduce((sum, a) => sum + (a.cost!.monthlyCostEstimate ?? 0), 0);
  const totalAnnualOpportunity = withOpportunity.reduce((sum, x) => sum + x.annualSavings, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Savings</h1>
        <p className="text-sm text-ink-400 mt-1.5 max-w-lg">
          Arithmetic on the numbers you've entered — current cost minus the cheapest alternative
          you've recorded. Nothing here is a model recommendation; add costs and alternatives on
          each Passport to populate this.
        </p>
      </div>

      <div className="rounded-lg border border-line bg-panel shadow-card grid grid-cols-3 divide-x divide-line">
        <div className="px-5 py-4">
          <div className="text-xs text-ink-400 mb-1">Tracked monthly spend</div>
          <div className="font-display text-2xl font-semibold text-ink-100">€{totalMonthlySpend.toLocaleString()}</div>
        </div>
        <div className="px-5 py-4">
          <div className="text-xs text-ink-400 mb-1">Systems with cost on record</div>
          <div className="font-display text-2xl font-semibold text-ink-100">{withCost.length} / {assets.length}</div>
        </div>
        <div className="px-5 py-4">
          <div className="text-xs text-ink-400 mb-1">Estimated annual opportunity</div>
          <div className={`font-display text-2xl font-semibold ${totalAnnualOpportunity > 0 ? "text-steady" : "text-ink-100"}`}>
            €{totalAnnualOpportunity.toLocaleString()}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-ink-400 mb-3">Opportunities, largest first</h2>
        <div className="flex flex-col gap-3">
          {withOpportunity.map(({ asset, best, monthlySavings, annualSavings }) => (
            <div key={asset.id} className="rounded-md border border-line bg-panel shadow-card p-5">
              <div className="flex items-center justify-between mb-2">
                <Link href={`/assets/${asset.id}`} className="font-medium text-sm text-ink-100 hover:underline">
                  {asset.name}
                </Link>
                <span className="text-sm font-medium text-steady">+€{annualSavings.toLocaleString()}/yr</span>
              </div>
              <p className="text-xs text-ink-400">
                Currently €{asset.cost!.monthlyCostEstimate!.toLocaleString()}/mo on {asset.vendor}. Recorded
                alternative <span className="text-ink-100">{best.provider} · {best.model}</span> at
                €{best.estimatedMonthlyCost!.toLocaleString()}/mo — €{monthlySavings.toLocaleString()}/mo less.
                {best.migrationEffortDays && ` Estimated migration: ${best.migrationEffortDays} days.`}
              </p>
              {best.reasoning && <p className="text-xs text-ink-400 mt-1 italic">{best.reasoning}</p>}
              <p className="text-[11px] text-ink-400 mt-2">
                Quality confidence: {best.qualityConfidence ?? "not set"} — validate with real testing before migrating anything.
              </p>
            </div>
          ))}
          {withOpportunity.length === 0 && (
            <div className="rounded-md border border-line bg-panel shadow-card p-5 text-sm text-ink-400">
              No opportunities yet. Add a monthly cost and at least one alternative on a Passport to see it here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

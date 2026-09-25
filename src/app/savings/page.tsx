import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/Badge";
import ExportMenu from "@/components/ExportMenu";
import VendorIcon, { VendorBadge } from "@/components/VendorIcon";
import { Tabs, PageHeader, StatCard, Table, td } from "@/components/ui";

export const dynamic = "force-dynamic";


export default async function SavingsPage() {
  const assets = await db.aiAsset.findMany({
    where: { organizationId: currentOrgId(), deletedAt: null },
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
      <PageHeader
        title="Costs"
        subtitle="Where you could spend less: current cost vs. the cheapest alternative on each passport. Estimates, not recommendations."
        action={<ExportMenu dataset="savings" />}
      />

      <Tabs active="savings" items={[{ key: "providers", label: "By provider", href: "/providers" }, { key: "savings", label: "Savings", href: "/savings" }]} />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Estimated annual opportunity" value={`€${totalAnnualOpportunity.toLocaleString()}`} hint={`${withOpportunity.length} system${withOpportunity.length === 1 ? "" : "s"} with a cheaper alternative`} />
        <StatCard label="Tracked monthly spend" value={`€${totalMonthlySpend.toLocaleString()}`} hint="Manually entered on Passports" />
        <StatCard label="Systems with cost on record" value={`${withCost.length} / ${assets.length}`} />
      </div>

      <Table
        columns={["System", "Current", "Best alternative", "Alternative", "Saving / month", "Saving / year", "Migration", "Quality"]}
        empty={withOpportunity.length === 0 && "No opportunities yet — add a monthly cost and at least one alternative on a Passport."}
      >
        {withOpportunity.map(({ asset, best, monthlySavings, annualSavings }) => (
          <tr key={asset.id}>
            <td className={td}>
              <Link href={`/assets/${asset.id}?tab=alternatives`} className="flex items-center gap-3 group">
                <VendorBadge vendor={asset.vendor ?? ""} name={asset.name} size={32} />
                <span>
                  <span className="block font-medium text-ink-100 group-hover:underline">{asset.name}</span>
                  <span className="block text-xs text-ink-400">{asset.vendor ?? "Vendor unknown"}</span>
                </span>
              </Link>
            </td>
            <td className={`${td} tabular text-ink-100`}>€{asset.cost!.monthlyCostEstimate!.toLocaleString()}</td>
            <td className={td}>
              <span className="flex items-center gap-2 text-ink-100">
                <VendorIcon vendor={best.provider} name={best.model} size={16} />
                {best.provider} · {best.model}
              </span>
            </td>
            <td className={`${td} tabular text-ink-100`}>€{best.estimatedMonthlyCost!.toLocaleString()}</td>
            <td className={`${td} tabular font-semibold text-ink-100`}>€{monthlySavings.toLocaleString()}</td>
            <td className={`${td} tabular font-semibold text-ink-100`}>€{annualSavings.toLocaleString()}</td>
            <td className={`${td} text-ink-400`}>{best.migrationEffortDays ? `${best.migrationEffortDays} days` : "—"}</td>
            <td className={td}>{best.qualityConfidence ? <Badge>{best.qualityConfidence}</Badge> : <span className="text-ink-400">—</span>}</td>
          </tr>
        ))}
      </Table>
      <p className="text-xs text-ink-400">Validate quality with real tests before migrating anything.</p>
    </div>
  );
}

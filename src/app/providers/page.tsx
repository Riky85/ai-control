import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import {PageHeader, StatCard, Panel } from "@/components/ui";
import ExportMenu from "@/components/ExportMenu";
import Link from "next/link";
import VendorIcon, { VendorBadge } from "@/components/VendorIcon";
import BarChart from "@/components/BarChart";

export const dynamic = "force-dynamic";


export default async function ProvidersPage() {
  const assets = await db.aiAsset.findMany({
    where: { organizationId: currentOrgId(), deletedAt: null },
    include: {
      connectedSystems: true,
      riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
      cost: true,
    },
  });

  const byVendor = new Map<string, typeof assets>();
  for (const a of assets) {
    const key = a.vendor ?? "Unknown vendor";
    if (!byVendor.has(key)) byVendor.set(key, []);
    byVendor.get(key)!.push(a);
  }

  const rows = Array.from(byVendor.entries())
    .map(([vendor, list]) => {
      const critical = list.filter((a) => ["HIGH", "CRITICAL"].includes(a.riskAssessments[0]?.level ?? ""));
      const production = list.filter((a) => a.connectedSystems.some((s) => s.detail?.match(/prod/i)));
      const withCost = list.filter((a) => a.cost?.monthlyCostEstimate != null);
      const monthlySpend = withCost.reduce((sum, a) => sum + (a.cost!.monthlyCostEstimate ?? 0), 0);
      return { vendor, list, critical, production, monthlySpend, hasCostData: withCost.length > 0, costedCount: withCost.length };
    })
    .sort((a, b) => b.list.length - a.list.length);

  const totalMonthlySpend = rows.reduce((sum, r) => sum + r.monthlySpend, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Providers"
        subtitle="Where your AI money goes, by provider."
        action={<ExportMenu dataset="providers" />}
      />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Providers" value={String(rows.length)} hint={rows.slice(0, 3).map((r) => r.vendor).join(", ")} />
        <StatCard label="Tracked monthly spend" value={`€${totalMonthlySpend.toLocaleString()}`} hint="Manually entered on Passports" />
        <Panel title="Spend by provider">
          {rows.some((r) => r.hasCostData) ? (
            <BarChart rows={rows.filter((r) => r.hasCostData).map((r) => ({ label: r.vendor, value: r.monthlySpend }))} formatValue={(v) => `€${v.toLocaleString()}`} />
          ) : (
            <p className="text-sm text-ink-400">No cost data yet — add it from each Passport.</p>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {rows.map(({ vendor, list, critical, production, monthlySpend, hasCostData, costedCount }) => (
          <div key={vendor} className="rounded-xl border border-line bg-panel p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <VendorBadge vendor={vendor} size={34} />
              <div className="min-w-0">
                <div className="font-medium text-sm text-ink-100 truncate">{vendor}</div>
                <div className="text-xs text-ink-400">{list.length} system{list.length === 1 ? "" : "s"}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className={`font-medium text-ink-100`}>{critical.length}</span>
                <span className="text-ink-400"> critical</span>
              </div>
              <div>
                <span className="font-medium text-ink-100">{production.length}</span>
                <span className="text-ink-400"> in prod</span>
              </div>
              <div className="col-span-2">
                {hasCostData ? (
                  <>
                    <span className="font-medium text-ink-100">€{monthlySpend.toLocaleString()}</span>
                    <span className="text-ink-400">/mo{costedCount < list.length ? ` (${costedCount}/${list.length} costed)` : ""}</span>
                  </>
                ) : (
                  <span className="text-ink-400">No cost data</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-3 border-t border-line">
              {list.map((a) => (
                <Link
                  key={a.id}
                  href={`/assets/${a.id}`}
                  className={`px-2 py-1 rounded border text-xs hover:border-ink-400 transition-colors ${
                    ["HIGH", "CRITICAL"].includes(a.riskAssessments[0]?.level ?? "") ? "border-alarm/40 text-alarm" : "border-line text-ink-400"
                  }`}
                >
                  {a.name}
                </Link>
              ))}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="rounded-xl border border-line bg-panel p-5 text-sm text-ink-400 col-span-3">
            No AI systems on record yet.
          </div>
        )}
      </div>
    </div>
  );
}

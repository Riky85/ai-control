import { db } from "@/lib/db";
import Link from "next/link";
import VendorIcon from "@/components/VendorIcon";
import BarChart from "@/components/BarChart";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

export default async function ProvidersPage() {
  const assets = await db.aiAsset.findMany({
    where: { organizationId: ORG_ID, deletedAt: null },
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Providers</h1>
        <p className="text-sm text-ink-400 mt-1.5 max-w-lg">
          What your AI estate actually depends on, grouped by vendor.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="rounded-xl bg-accent-soft p-6 flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-accent mb-1">Tracked monthly spend</div>
            <div className="font-display text-4xl font-bold text-accent">€{totalMonthlySpend.toLocaleString()}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-accent/80 mb-1">Providers</div>
            <div className="font-display text-xl font-semibold text-accent">{rows.length}</div>
          </div>
        </div>
        {rows.some((r) => r.hasCostData) ? (
          <div className="rounded-xl border border-line bg-panel shadow-card p-5">
            <h2 className="text-sm font-medium text-ink-400 mb-3">Monthly spend by provider</h2>
            <BarChart
              rows={rows.filter((r) => r.hasCostData).map((r) => ({ label: r.vendor, value: r.monthlySpend }))}
              formatValue={(v) => `€${v.toLocaleString()}`}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-panel shadow-card p-5 flex items-center">
            <span className="text-sm text-ink-400">No cost data entered yet — add it from each Passport.</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {rows.map(({ vendor, list, critical, production, monthlySpend, hasCostData, costedCount }) => (
          <div key={vendor} className="rounded-xl border border-line bg-panel shadow-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md border border-line bg-ink flex items-center justify-center text-ink-100 shrink-0">
                  <VendorIcon vendor={vendor} size={17} />
                </div>
                <span className="font-medium text-sm text-ink-100">{vendor}</span>
              </div>
              <span className="text-xs text-ink-400">
                {list.length} system{list.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-4 text-xs text-ink-400 mb-3">
              <span>
                <span className={`font-medium ${critical.length > 0 ? "text-alarm" : "text-ink-100"}`}>{critical.length}</span> critical
              </span>
              <span>
                <span className="font-medium text-ink-100">{production.length}</span> in production
              </span>
              <span>
                <span className="font-medium text-ink-100">{list.length}</span> total
              </span>
              <span>
                {hasCostData ? (
                  <>
                    <span className="font-medium text-ink-100">€{monthlySpend.toLocaleString()}</span>/mo
                    {costedCount < list.length && <span className="block text-[10px]">({costedCount}/{list.length} costed)</span>}
                  </>
                ) : (
                  <span className="text-ink-400">No cost data</span>
                )}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pt-3 border-t border-line">
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
          <div className="rounded-xl border border-line bg-panel shadow-card p-5 text-sm text-ink-400">
            No AI systems on record yet.
          </div>
        )}
      </div>
    </div>
  );
}

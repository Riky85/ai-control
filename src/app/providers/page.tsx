import { db } from "@/lib/db";
import Link from "next/link";
import VendorIcon from "@/components/VendorIcon";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

export default async function ProvidersPage() {
  const assets = await db.aiAsset.findMany({
    where: { organizationId: ORG_ID, deletedAt: null },
    include: {
      connectedSystems: true,
      riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
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
      return { vendor, list, critical, production };
    })
    .sort((a, b) => b.list.length - a.list.length);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Providers</h1>
        <p className="text-sm text-ink-400 mt-1.5 max-w-lg">
          What your AI estate actually depends on, grouped by vendor — so you can answer
          "how exposed are we to this provider?" at a glance.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map(({ vendor, list, critical, production }) => (
          <div key={vendor} className="rounded-md border border-line bg-panel shadow-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <VendorIcon vendor={vendor} />
                <span className="font-medium text-sm text-ink-100">{vendor}</span>
              </div>
              <span className="text-xs text-ink-400">
                {list.length} system{list.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-xs text-ink-400 mb-3">
              <span>
                <span className={`font-medium ${critical.length > 0 ? "text-alarm" : "text-ink-100"}`}>{critical.length}</span> critical
              </span>
              <span>
                <span className="font-medium text-ink-100">{production.length}</span> in production
              </span>
              <span>
                <span className="font-medium text-ink-100">{list.length}</span> total
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
          <div className="rounded-md border border-line bg-panel shadow-card p-5 text-sm text-ink-400">
            No AI systems on record yet.
          </div>
        )}
      </div>
    </div>
  );
}

import { db } from "@/lib/db";
import StatCard from "@/components/StatCard";
import Badge from "@/components/Badge";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

export default async function OverviewPage() {
  const [total, byType, needsAttention, recentAssets] = await Promise.all([
    db.aiAsset.count({ where: { organizationId: ORG_ID, deletedAt: null } }),
    db.aiAsset.groupBy({
      by: ["type"],
      where: { organizationId: ORG_ID, deletedAt: null },
      _count: { _all: true },
    }),
    Promise.all([
      db.aiAsset.count({ where: { organizationId: ORG_ID, status: "UNKNOWN", deletedAt: null } }),
      db.aiAsset.count({ where: { organizationId: ORG_ID, status: "UNAPPROVED", deletedAt: null } }),
      db.riskAssessment.groupBy({
        by: ["aiAssetId"],
        where: { aiAsset: { organizationId: ORG_ID }, level: { in: ["HIGH", "CRITICAL"] } },
        _max: { createdAt: true },
      }),
    ]),
    db.aiAsset.findMany({
      where: { organizationId: ORG_ID, deletedAt: null },
      orderBy: { firstSeenAt: "desc" },
      take: 8,
      include: {
        owner: true,
        riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
  ]);

  const [unknownCount, unapprovedCount, highRisk] = needsAttention;
  const typeLabel: Record<string, string> = {
    AI_APPLICATION: "AI Apps",
    AI_AGENT: "AI Agents",
    AI_API: "AI APIs",
    MCP_SERVER: "MCP Servers",
    AI_DEV_TOOL: "AI Dev Tools",
    AI_FEATURE: "AI Features",
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-muted mt-1">
          Discover every AI in your company. Understand what it can access. Control what it can do.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-panel px-6 py-5">
        <div className="text-3xl font-semibold mono">{total}</div>
        <div className="text-sm text-muted">AI assets found</div>
        <div className="flex gap-6 mt-4 text-sm">
          {byType.map((t) => (
            <div key={t.type}>
              <span className="mono font-medium">{t._count._all}</span>{" "}
              <span className="text-muted">{typeLabel[t.type] ?? t.type}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Unknown" value={unknownCount} tone="warning" />
        <StatCard label="Unapproved" value={unapprovedCount} tone="warning" />
        <StatCard label="High risk" value={highRisk.length} tone="danger" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted">Recently detected</h2>
          <Link href="/assets" className="text-xs text-accent hover:underline">
            View all
          </Link>
        </div>
        <div className="rounded-lg border border-border bg-panel divide-y divide-border">
          {recentAssets.length === 0 && (
            <div className="p-4 text-sm text-muted">
              Nessun asset ancora. Collega un connettore per iniziare la discovery.
            </div>
          )}
          {recentAssets.map((a) => {
            const risk = a.riskAssessments[0];
            return (
              <div key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <Link href={`/assets/${a.id}`} className="hover:underline font-medium">
                    {a.name}
                  </Link>
                  <span className="text-muted text-xs">{typeLabel[a.type] ?? a.type}</span>
                  <span className="text-muted text-xs">{a.owner?.name ?? "Unowned"}</span>
                </div>
                <div className="flex items-center gap-2">
                  {risk && <Badge>{risk.level}</Badge>}
                  <Badge>{a.status}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

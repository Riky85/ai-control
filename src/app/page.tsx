import { db } from "@/lib/db";
import SignalStrip from "@/components/SignalStrip";
import Badge from "@/components/Badge";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

const TYPE_LABEL: Record<string, string> = {
  AI_APPLICATION: "AI apps",
  AI_AGENT: "AI agents",
  AI_API: "AI APIs",
  MCP_SERVER: "MCP servers",
  AI_DEV_TOOL: "Dev tools",
  AI_FEATURE: "AI features",
};

export default async function OverviewPage() {
  const [total, byType, unknownCount, unapprovedCount, highRisk, activePolicies, pendingReviewCount, recentAssets] = await Promise.all([
    db.aiAsset.count({ where: { organizationId: ORG_ID, deletedAt: null } }),
    db.aiAsset.groupBy({
      by: ["type"],
      where: { organizationId: ORG_ID, deletedAt: null },
      _count: { _all: true },
    }),
    db.aiAsset.count({ where: { organizationId: ORG_ID, status: "UNKNOWN", deletedAt: null } }),
    db.aiAsset.count({ where: { organizationId: ORG_ID, status: "UNAPPROVED", deletedAt: null } }),
    db.riskAssessment.groupBy({
      by: ["aiAssetId"],
      where: { aiAsset: { organizationId: ORG_ID }, level: { in: ["HIGH", "CRITICAL"] } },
      _max: { createdAt: true },
    }),
    db.policy.count({ where: { organizationId: ORG_ID, enabled: true } }),
    db.aiAsset.count({
      where: { organizationId: ORG_ID, status: { in: ["UNKNOWN", "UNAPPROVED", "UNREVIEWED"] }, deletedAt: null },
    }),
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

  return (
    <div className="flex flex-col gap-9">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">
          What's running in your company right now
        </h1>
        <p className="text-sm text-ink-400 mt-1.5 max-w-lg">
          Every connector below reports into one inventory. This is what has
          actually been detected, not what IT has documented.
        </p>
      </div>

      <SignalStrip
        items={[
          { label: "AI assets found", value: total },
          { label: "Unknown", value: unknownCount, tone: unknownCount > 0 ? "signal" : "default" },
          { label: "Unapproved", value: unapprovedCount, tone: unapprovedCount > 0 ? "signal" : "default" },
          { label: "High or critical risk", value: highRisk.length, tone: highRisk.length > 0 ? "alarm" : "default" },
          { label: "Active policies", value: activePolicies },
        ]}
      />

      {pendingReviewCount > 0 && (
        <Link
          href="/approvals"
          className="text-sm text-ink-100 hover:underline -mt-4 w-fit"
        >
          {pendingReviewCount} asset{pendingReviewCount === 1 ? "" : "s"} waiting on review →
        </Link>
      )}

      {byType.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {byType.map((t) => (
            <div key={t.type} className="flex items-baseline gap-1.5">
              <span className="tabular font-display font-medium text-ink-100">{t._count._all}</span>
              <span className="text-ink-400">{TYPE_LABEL[t.type] ?? t.type}</span>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-ink-400">Recently detected</h2>
          <Link href="/assets" className="text-xs text-signal hover:underline">
            View all assets
          </Link>
        </div>
        <div className="rounded-md border border-line bg-panel divide-y divide-line">
          {recentAssets.length === 0 && (
            <div className="p-5 text-sm text-ink-400">
              No assets yet. Connect Microsoft 365 or GitHub to start discovery.
            </div>
          )}
          {recentAssets.map((a) => {
            const risk = a.riskAssessments[0];
            return (
              <div key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <Link href={`/assets/${a.id}`} className="hover:underline font-medium text-ink-100">
                    {a.name}
                  </Link>
                  <span className="text-ink-400 text-xs">{TYPE_LABEL[a.type] ?? a.type}</span>
                  <span className="text-ink-400 text-xs">{a.owner?.name ?? "No owner on record"}</span>
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

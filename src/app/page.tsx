import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import WorkflowStepper, { type Stage } from "@/components/WorkflowStepper";
import { setAssetStatusAction } from "@/lib/actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

const TYPE_LABEL: Record<string, string> = {
  AI_APPLICATION: "AI application",
  AI_AGENT: "AI agent",
  AI_API: "AI API",
  MCP_SERVER: "MCP server",
  AI_DEV_TOOL: "AI dev tool",
  AI_FEATURE: "AI feature",
};

export default async function OverviewPage() {
  const org = await db.organization.findUnique({ where: { id: ORG_ID } });
  const [total, byStatus, highRisk, pendingReviewCount, attention, candidates, recentActivity] = await Promise.all([
    db.aiAsset.count({ where: { organizationId: ORG_ID, deletedAt: null } }),
    db.aiAsset.groupBy({
      by: ["status"],
      where: { organizationId: ORG_ID, deletedAt: null },
      _count: { _all: true },
    }),
    db.riskAssessment.groupBy({
      by: ["aiAssetId"],
      where: { aiAsset: { organizationId: ORG_ID }, level: { in: ["HIGH", "CRITICAL"] } },
      _max: { createdAt: true },
    }),
    db.aiAsset.count({
      where: { organizationId: ORG_ID, status: { in: ["UNKNOWN", "UNAPPROVED", "UNREVIEWED"] }, deletedAt: null },
    }),
    db.aiAsset.findMany({
      where: { organizationId: ORG_ID, deletedAt: null, status: { not: "APPROVED" } },
      orderBy: { firstSeenAt: "desc" },
      take: 5,
      include: { owner: true, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    db.aiAsset.findMany({
      where: { organizationId: ORG_ID, deletedAt: null },
      orderBy: { firstSeenAt: "desc" },
      take: 30,
      include: {
        owner: true,
        connector: true,
        dataAccess: { include: { dataAsset: true } },
        riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    db.aiAssetActivity.findMany({
      where: { aiAsset: { organizationId: ORG_ID } },
      orderBy: { occurredAt: "desc" },
      take: 5,
      include: { aiAsset: true },
    }),
  ]);

  const statusCount: Record<string, number> = Object.fromEntries(
    byStatus.map((s) => [s.status, s._count._all])
  );

  // Spotlight: preferisci un asset ancora non approvato, quello a rischio più
  // alto tra questi (o tra tutti, se sono già tutti approvati).
  const pending = candidates.filter((a) => a.status !== "APPROVED");
  const pool = pending.length > 0 ? pending : candidates;
  const spotlight = pool
    .slice()
    .sort((a, b) => (b.riskAssessments[0]?.score ?? -1) - (a.riskAssessments[0]?.score ?? -1))[0];

  const risk = spotlight?.riskAssessments[0];
  const stages: Stage[] = spotlight
    ? [
        { label: "Discover", state: "done" },
        { label: "Risk assessment", state: risk ? "done" : "pending" },
        { label: "Review & approve", state: spotlight.status === "APPROVED" ? "done" : "active" },
        { label: "Monitor & enforce", state: spotlight.status === "APPROVED" ? "continuous" : "pending" },
      ]
    : [];

  return (
    <div className="flex flex-col gap-9">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">AI Control</h1>
        <p className="text-sm text-ink-400 mt-1.5">Your AI estate, under control.</p>
      </div>

      {!org?.onboardingCompletedAt && (
        <div className="rounded-lg border border-line bg-panel shadow-card px-5 py-3.5 flex items-center gap-3">
          <span className="text-xs font-medium text-white bg-accent rounded-full px-2.5 py-1 shrink-0">Setup</span>
          <p className="text-sm text-ink-100">
            Finish setting up AI Control — organization, a real connector, owners, and starting policies.{" "}
            <Link href="/onboarding" className="underline hover:text-ink-400">Run setup</Link>
          </p>
        </div>
      )}

      {/* AI posture — un unico numero, non cinque card separate */}
      <div>
        <div className="flex items-baseline gap-3">
          <span className="tabular font-display text-4xl font-semibold text-ink-100">{total}</span>
          <span className="text-sm text-ink-400">AI assets</span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm text-ink-400">
          <span><span className="text-ink-100 font-medium">{statusCount.APPROVED ?? 0}</span> approved</span>
          <span><span className="text-ink-100 font-medium">{(statusCount.UNREVIEWED ?? 0) + (statusCount.UNAPPROVED ?? 0)}</span> under review</span>
          <span><span className="text-ink-100 font-medium">{statusCount.UNKNOWN ?? 0}</span> unknown</span>
          <span className={highRisk.length > 0 ? "text-alarm" : ""}>
            <span className={`font-medium ${highRisk.length > 0 ? "text-alarm" : "text-ink-100"}`}>{highRisk.length}</span> high risk
          </span>
        </div>
      </div>

      {/* Attention — cosa richiede davvero uno sguardo, non tutto l'inventario */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-ink-400">
            {attention.length} asset{attention.length === 1 ? "" : "s"} need{attention.length === 1 ? "s" : ""} attention
          </h2>
          <Link href="/approvals" className="text-xs text-ink-100 hover:underline">View all</Link>
        </div>
        <div className="rounded-lg border border-line bg-panel shadow-card divide-y divide-line">
          {attention.length === 0 && (
            <div className="p-5 text-sm text-ink-400">Nothing needs attention right now.</div>
          )}
          {attention.map((a) => {
            const r = a.riskAssessments[0];
            return (
              <div key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <Link href={`/assets/${a.id}`} className="hover:underline font-medium text-ink-100">{a.name}</Link>
                  <span className="text-ink-400 text-xs">{a.owner?.name ?? "No owner"}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {r && <Badge>{r.level}</Badge>}
                  <Badge>{a.status}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {spotlight && (
        <div className="rounded-lg border border-line bg-panel shadow-card p-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-sm font-medium text-ink-400">{spotlight.name} — lifecycle</h2>
            <Link href={`/assets/${spotlight.id}`} className="text-xs text-ink-400 hover:text-ink-100 hover:underline shrink-0">
              Open asset →
            </Link>
          </div>

          <WorkflowStepper stages={stages} />

          <div className="grid grid-cols-4 gap-6 mt-5 text-xs">
            <div>
              <div className="text-ink-400 mb-1">{TYPE_LABEL[spotlight.type] ?? spotlight.type}</div>
              <div className="text-ink-100">{spotlight.department ?? "—"} · {spotlight.connector?.provider ?? "Manual"}</div>
            </div>
            <div>
              {risk ? (
                <>
                  <div className="text-ink-400 mb-1">Top risk factor</div>
                  <div className="text-ink-100">{(risk.reasons as string[])[0] ?? "—"}</div>
                </>
              ) : (
                <div className="text-ink-400">Not assessed yet.</div>
              )}
            </div>
            <div>
              <div className="text-ink-400 mb-1">Owner</div>
              <div className="text-ink-100 mb-2">{spotlight.owner?.name ?? "No owner on record"}</div>
              {spotlight.status !== "APPROVED" && (
                <div className="flex gap-2">
                  <form action={setAssetStatusAction}>
                    <input type="hidden" name="assetId" value={spotlight.id} />
                    <input type="hidden" name="status" value="APPROVED" />
                    <button type="submit" className="px-2.5 py-1 rounded bg-accent text-white hover:bg-accent-dark transition-colors">
                      Approve
                    </button>
                  </form>
                  <form action={setAssetStatusAction}>
                    <input type="hidden" name="assetId" value={spotlight.id} />
                    <input type="hidden" name="status" value="UNAPPROVED" />
                    <button type="submit" className="px-2.5 py-1 rounded border border-line text-ink-400 hover:text-alarm hover:border-alarm transition-colors">
                      Reject
                    </button>
                  </form>
                </div>
              )}
            </div>
            <div>
              <div className="text-ink-400 mb-1">Status</div>
              <Badge>{spotlight.status}</Badge>
            </div>
          </div>
        </div>
      )}

      {/* Recent activity — eventi veri, non asset */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-ink-400">Recent activity</h2>
          <Link href="/activity" className="text-xs text-ink-100 hover:underline">View all</Link>
        </div>
        <div className="rounded-lg border border-line bg-panel shadow-card divide-y divide-line">
          {recentActivity.length === 0 && (
            <div className="p-5 text-sm text-ink-400">No activity imported yet.</div>
          )}
          {recentActivity.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="tabular text-xs text-ink-400">{new Date(a.occurredAt).toLocaleTimeString()}</span>
                <Link href={`/assets/${a.aiAssetId}`} className="hover:underline font-medium text-ink-100">{a.aiAsset.name}</Link>
                <span className="text-ink-400 text-xs">{a.eventType}</span>
              </div>
              <span className="text-ink-400 text-xs">{a.source}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

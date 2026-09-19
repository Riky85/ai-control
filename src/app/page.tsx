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
        <h1 className="font-display text-2xl font-semibold text-ink-100">Angar</h1>
        <p className="text-sm text-ink-400 mt-1.5">Your AI estate, under control.</p>
      </div>

      {!org?.onboardingCompletedAt && (
        <div className="rounded-lg border border-line bg-panel shadow-card px-5 py-3.5 flex items-center gap-3">
          <span className="text-xs font-medium text-white bg-accent rounded-full px-2.5 py-1 shrink-0">Setup</span>
          <p className="text-sm text-ink-100">
            Finish setting up Angar — organization, a real connector, owners, and starting policies.{" "}
            <Link href="/onboarding" className="underline hover:text-ink-400">Run setup</Link>
          </p>
        </div>
      )}

      {/* AI posture — un'unica fascia di mini-widget, non testo semplice né
          cinque card sparse: numero, indicatore colorato, etichetta. */}
      <div className="rounded-lg border border-line bg-panel shadow-card grid grid-cols-4 divide-x divide-line">
        <PostureTile value={total} label="AI assets" dotClass="bg-ink-100" />
        <PostureTile value={statusCount.APPROVED ?? 0} label="Approved" dotClass="bg-steady" />
        <PostureTile
          value={(statusCount.UNREVIEWED ?? 0) + (statusCount.UNAPPROVED ?? 0) + (statusCount.UNKNOWN ?? 0)}
          label="Under review"
          dotClass="bg-signal"
        />
        <PostureTile value={highRisk.length} label="High risk" dotClass="bg-alarm" tone={highRisk.length > 0 ? "alarm" : undefined} />
      </div>

      {/* Attention — cosa richiede davvero uno sguardo, non tutto l'inventario */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-ink-400">
            {attention.length} asset{attention.length === 1 ? "" : "s"} need{attention.length === 1 ? "s" : ""} attention
          </h2>
          <Link href="/approvals" className="text-xs text-ink-100 hover:underline">View all</Link>
        </div>
        <div className="rounded-lg border border-line bg-panel shadow-card divide-y divide-line overflow-hidden">
          {attention.length === 0 && (
            <div className="p-5 text-sm text-ink-400">Nothing needs attention right now.</div>
          )}
          {attention.map((a) => {
            const r = a.riskAssessments[0];
            const edgeClass = r?.level === "HIGH" || r?.level === "CRITICAL" ? "border-l-alarm" : "border-l-signal";
            return (
              <Link
                href={`/assets/${a.id}`}
                key={a.id}
                className={`flex items-center justify-between px-4 py-3 text-sm border-l-2 ${edgeClass} hover:bg-white/[0.025] transition-colors`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-ink-100">{a.name}</span>
                  <span className="text-ink-400 text-xs">{a.owner?.name ?? "No owner"}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {r && <Badge>{r.level}</Badge>}
                  <Badge>{a.status}</Badge>
                </div>
              </Link>
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
            <Link
              href={`/assets/${a.aiAssetId}`}
              key={a.id}
              className="flex items-center justify-between px-4 py-3 text-sm hover:bg-white/[0.025] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-ink-400/50 shrink-0" />
                <span className="tabular text-xs text-ink-400">{new Date(a.occurredAt).toLocaleTimeString()}</span>
                <span className="font-medium text-ink-100">{a.aiAsset.name}</span>
                <span className="text-ink-400 text-xs">{a.eventType}</span>
              </div>
              <span className="text-ink-400 text-xs">{a.source}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function PostureTile({
  value,
  label,
  dotClass,
  tone,
}: {
  value: number;
  label: string;
  dotClass: string;
  tone?: "alarm";
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        <span className="text-xs text-ink-400">{label}</span>
      </div>
      <div className={`tabular font-display text-2xl font-semibold ${tone === "alarm" ? "text-alarm" : "text-ink-100"}`}>
        {value}
      </div>
    </div>
  );
}

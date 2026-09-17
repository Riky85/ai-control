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
  const [total, unknownCount, unapprovedCount, highRisk, activePolicies, pendingReviewCount, candidates, recentAssets] =
    await Promise.all([
      db.aiAsset.count({ where: { organizationId: ORG_ID, deletedAt: null } }),
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
        take: 30,
        include: {
          owner: true,
          connector: true,
          dataAccess: { include: { dataAsset: true } },
          riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
          activities: { orderBy: { occurredAt: "desc" }, take: 5 },
        },
      }),
      db.aiAsset.findMany({
        where: { organizationId: ORG_ID, deletedAt: null },
        orderBy: { firstSeenAt: "desc" },
        take: 8,
        include: { owner: true, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } },
      }),
    ]);

  // Spotlight: preferisci un asset ancora non approvato; tra questi (o tra
  // tutti, se non ce ne sono) scegli quello con lo score di rischio più alto.
  // Nessun dato inventato: se non c'è nessun asset, la sezione non appare.
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
        {
          label: "Review & approve",
          state: spotlight.status === "APPROVED" ? "done" : "active",
        },
        {
          label: "Monitor & enforce",
          state: spotlight.status === "APPROVED" ? "continuous" : "pending",
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Overview</h1>
        <p className="text-sm text-ink-400 mt-1.5 max-w-lg">
          What connectors have found, and where it stands in review.
        </p>
      </div>

      {!org?.onboardingCompletedAt && (
        <div className="rounded-lg border border-line bg-panel shadow-card px-5 py-3.5 flex items-center gap-3">
          <span className="text-xs font-medium text-white bg-accent rounded-full px-2.5 py-1 shrink-0">
            Setup
          </span>
          <p className="text-sm text-ink-100">
            Finish setting up AI Control — organization, a real connector, owners, and starting policies.{" "}
            <Link href="/onboarding" className="underline hover:text-ink-400">
              Run setup
            </Link>
          </p>
        </div>
      )}

      {pendingReviewCount > 0 && (
        <div className="rounded-lg border border-line bg-panel shadow-card px-5 py-3.5 flex items-center gap-3">
          <span className="text-xs font-medium text-white bg-signal rounded-full px-2.5 py-1 shrink-0">
            Needs review
          </span>
          <p className="text-sm text-ink-100">
            {pendingReviewCount} AI asset{pendingReviewCount === 1 ? "" : "s"} {pendingReviewCount === 1 ? "hasn't" : "haven't"} been
            formally reviewed yet.{" "}
            <Link href="/approvals" className="underline hover:text-ink-400">
              Review now
            </Link>
          </p>
        </div>
      )}

      {spotlight && (
        <div className="rounded-lg border border-line bg-panel shadow-card p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-ink-100">AI asset lifecycle</h2>
              <p className="text-xs text-ink-400 mt-0.5">
                Most urgent item right now — progression from discovery to monitoring
              </p>
            </div>
            <Link href={`/assets/${spotlight.id}`} className="text-xs text-ink-400 hover:text-ink-100 hover:underline shrink-0">
              Open asset →
            </Link>
          </div>

          <WorkflowStepper stages={stages} />

          <div className="grid grid-cols-4 gap-5 mt-5">
            {/* 1. Discover */}
            <div className="border border-line rounded-md p-4">
              <div className="text-xs text-ink-400 mb-2">{TYPE_LABEL[spotlight.type] ?? spotlight.type}</div>
              <div className="text-sm font-semibold text-ink-100 mb-3">{spotlight.name}</div>
              <div className="grid grid-cols-2 gap-y-2 text-xs">
                <div>
                  <div className="text-ink-400">Department</div>
                  <div className="text-ink-100">{spotlight.department ?? "—"}</div>
                </div>
                <div>
                  <div className="text-ink-400">Data accessed</div>
                  <div className="text-ink-100">
                    {spotlight.dataAccess[0]?.dataAsset.name ?? "None declared"}
                  </div>
                </div>
                <div>
                  <div className="text-ink-400">Source</div>
                  <div className="text-ink-100">{spotlight.connector?.provider ?? "Manual"}</div>
                </div>
                <div>
                  <div className="text-ink-400">Model</div>
                  <div className="text-ink-100">{spotlight.model ?? "—"}</div>
                </div>
              </div>
            </div>

            {/* 2. Risk assessment */}
            <div className="border border-line rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-ink-100">Risk assessment</div>
                <span className="text-[10px] font-medium text-ink-400 border border-line rounded-full px-1.5 py-0.5">
                  rule-based
                </span>
              </div>
              {risk ? (
                <>
                  <div className="text-xs text-ink-400">Overall</div>
                  <div className="mb-2"><Badge>{risk.level}</Badge></div>
                  <div className="text-xs text-ink-400 mb-1">Key factors</div>
                  <ul className="text-xs text-ink-100 flex flex-col gap-1">
                    {(risk.reasons as string[]).slice(0, 3).map((r, i) => (
                      <li key={i}>· {r}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-xs text-ink-400">Not assessed yet.</p>
              )}
            </div>

            {/* 3. Review & approve */}
            <div className="border border-line rounded-md p-4 flex flex-col">
              <div className="text-sm font-semibold text-ink-100 mb-2">Review & approve</div>
              <div className="text-xs text-ink-400">Owner</div>
              <div className="text-xs text-ink-100 mb-3">{spotlight.owner?.name ?? "No owner on record"}</div>
              <div className="text-xs text-ink-400 mb-1">Status</div>
              <div className="mb-3"><Badge>{spotlight.status}</Badge></div>
              {spotlight.status !== "APPROVED" && (
                <div className="flex gap-2 mt-auto">
                  <form action={setAssetStatusAction}>
                    <input type="hidden" name="assetId" value={spotlight.id} />
                    <input type="hidden" name="status" value="APPROVED" />
                    <button
                      type="submit"
                      className="text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:bg-accent-dark transition-colors"
                    >
                      Approve
                    </button>
                  </form>
                  <form action={setAssetStatusAction}>
                    <input type="hidden" name="assetId" value={spotlight.id} />
                    <input type="hidden" name="status" value="UNAPPROVED" />
                    <button
                      type="submit"
                      className="text-xs px-3 py-1.5 rounded-md border border-line text-ink-400 hover:text-alarm hover:border-alarm transition-colors"
                    >
                      Reject
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* 4. Monitor & enforce */}
            <div className="border border-line rounded-md p-4">
              <div className="text-sm font-semibold text-ink-100 mb-2">Monitor & insights</div>
              {spotlight.activities.length > 0 ? (
                <ul className="text-xs text-ink-400 flex flex-col gap-1.5">
                  {spotlight.activities.slice(0, 4).map((a) => (
                    <li key={a.id}>
                      <span className="text-ink-100">{a.eventType}</span> ·{" "}
                      {new Date(a.occurredAt).toLocaleDateString()}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-400">
                  No activity imported yet for this asset.
                </p>
              )}
              <Link href="/evidence" className="text-xs text-ink-100 hover:underline mt-3 inline-block">
                View evidence →
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-5 gap-4">
        <Stat label="AI assets found" value={total} />
        <Stat label="Unknown" value={unknownCount} tone={unknownCount > 0 ? "signal" : undefined} />
        <Stat label="Unapproved" value={unapprovedCount} tone={unapprovedCount > 0 ? "signal" : undefined} />
        <Stat label="High or critical risk" value={highRisk.length} tone={highRisk.length > 0 ? "alarm" : undefined} />
        <Stat label="Active policies" value={activePolicies} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-ink-400">Recently detected</h2>
          <Link href="/assets" className="text-xs text-ink-100 hover:underline">
            View all assets
          </Link>
        </div>
        <div className="rounded-lg border border-line bg-panel shadow-card divide-y divide-line">
          {recentAssets.length === 0 && (
            <div className="p-5 text-sm text-ink-400">
              No assets yet. Connect Microsoft 365 or GitHub to start discovery.
            </div>
          )}
          {recentAssets.map((a) => {
            const r = a.riskAssessments[0];
            return (
              <div key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <Link href={`/assets/${a.id}`} className="hover:underline font-medium text-ink-100">
                    {a.name}
                  </Link>
                  <span className="text-ink-400 text-xs">{TYPE_LABEL[a.type] ?? a.type}</span>
                  <span className="text-ink-400 text-xs">{a.owner?.name ?? "No owner on record"}</span>
                </div>
                <div className="flex items-center gap-3">
                  {r && <Badge>{r.level}</Badge>}
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

function Stat({ label, value, tone }: { label: string; value: number; tone?: "signal" | "alarm" }) {
  const toneClass = tone === "signal" ? "text-signal" : tone === "alarm" ? "text-alarm" : "text-ink-100";
  return (
    <div className="rounded-lg border border-line bg-panel shadow-card px-4 py-3.5">
      <div className={`tabular text-2xl font-display font-semibold ${toneClass}`}>{value}</div>
      <div className="text-xs text-ink-400 mt-0.5">{label}</div>
    </div>
  );
}

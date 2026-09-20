import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import WorkflowStepper, { type Stage } from "@/components/WorkflowStepper";
import { setAssetStatusAction } from "@/lib/actions";
import Link from "next/link";
import VendorIcon from "@/components/VendorIcon";
import DonutChart from "@/components/DonutChart";

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
  const RISK_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
  const riskCounts = new Map<string, number>();
  for (const a of candidates) {
    const level = a.riskAssessments[0]?.level;
    if (level) riskCounts.set(level, (riskCounts.get(level) ?? 0) + 1);
  }
  const riskByLevel = RISK_ORDER.filter((l) => riskCounts.has(l)).map((l) => ({
    label: l.charAt(0) + l.slice(1).toLowerCase(),
    value: riskCounts.get(l)!,
  }));

  const stages: Stage[] = spotlight
    ? [
        { label: "Discover", state: "done" },
        { label: "Risk assessment", state: risk ? "done" : "pending" },
        { label: "Review & approve", state: spotlight.status === "APPROVED" ? "done" : "active" },
        { label: "Monitor & enforce", state: spotlight.status === "APPROVED" ? "continuous" : "pending" },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Angar</h1>
        <p className="text-sm text-ink-400 mt-1.5">Your AI estate, under control.</p>
      </div>

      {!org?.onboardingCompletedAt && (
        <div className="rounded-xl border border-line bg-panel shadow-card px-5 py-3.5 flex items-center gap-3">
          <span className="text-xs font-medium text-white bg-accent rounded-full px-2.5 py-1 shrink-0">Setup</span>
          <p className="text-sm text-ink-100">
            Finish setting up Angar — organization, a real connector, owners, and starting policies.{" "}
            <Link href="/onboarding" className="underline hover:text-ink-400">Run setup</Link>
          </p>
        </div>
      )}

      {/* Fascia statistiche — un numero "hero" in evidenza (con tinta di
          brand) affiancato da tre metriche compatte, invece di quattro
          caselle identiche e anonime. */}
      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-2 rounded-xl bg-accent-soft p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-accent">AI systems in your estate</span>
            <div className="flex -space-x-1.5">
              {Array.from(new Set(candidates.map((a) => a.vendor).filter(Boolean) as string[])).slice(0, 5).map((v, i) => (
                <span key={i} className="h-6 w-6 rounded-full bg-white border-2 border-accent-soft flex items-center justify-center text-accent">
                  <VendorIcon vendor={v} size={13} />
                </span>
              ))}
            </div>
          </div>
          <div className="font-display text-5xl font-bold text-accent mt-4">{total}</div>
        </div>
        <PostureTile value={statusCount.APPROVED ?? 0} label="Approved" dotClass="bg-steady" />
        <PostureTile
          value={(statusCount.UNREVIEWED ?? 0) + (statusCount.UNAPPROVED ?? 0) + (statusCount.UNKNOWN ?? 0)}
          label="Under review"
          dotClass="bg-signal"
        />
      </div>
      {highRisk.length > 0 && (
        <div className="rounded-xl border border-alarm/30 bg-alarm/5 px-5 py-3 flex items-center justify-between">
          <span className="text-sm text-alarm font-medium">{highRisk.length} asset{highRisk.length === 1 ? "" : "s"} at high or critical risk</span>
          <Link href="/assets?risk=HIGH" className="text-xs font-medium text-alarm border border-alarm/30 rounded-md px-2.5 py-1 hover:bg-alarm/10 transition-colors">
            Review now
          </Link>
        </div>
      )}

      {/* Due colonne compatte invece di blocchi impilati a piena larghezza */}
      <div className="grid grid-cols-2 gap-5">
        {riskByLevel.length > 0 && (
          <div className="rounded-xl border border-line bg-panel shadow-card p-5">
            <h2 className="text-sm font-medium text-ink-400 mb-4">Risk distribution</h2>
            <DonutChart
              slices={riskByLevel.map((r) => ({
                label: r.label,
                value: r.value,
                color: r.label === "Low" ? "#1F9254" : r.label === "Medium" ? "#B7791F" : "#C4433B",
              }))}
              centerLabel={`${candidates.length} assessed`}
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-ink-400">
              {attention.length} need{attention.length === 1 ? "s" : ""} attention
            </h2>
            <Link href="/governance?tab=reviews" className="text-xs font-medium text-ink-100 border border-line rounded-md px-2.5 py-1 hover:border-ink-100 transition-colors">View all</Link>
          </div>
          <div className="rounded-xl border border-line bg-panel shadow-card divide-y divide-line overflow-hidden">
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
                  className={`flex items-center justify-between px-4 py-3 text-sm border-l-2 ${edgeClass} hover:bg-black/[0.02] transition-colors`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-ink-400 shrink-0"><VendorIcon vendor={a.vendor ?? ""} size={13} /></span>
                    <span className="font-medium text-ink-100 truncate">{a.name}</span>
                  </div>
                  {r && <Badge>{r.level}</Badge>}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {spotlight && (
        <div className="rounded-xl border border-line bg-panel shadow-card p-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-sm font-medium text-ink-400">{spotlight.name} — lifecycle</h2>
            <Link href={`/assets/${spotlight.id}`} className="text-xs font-medium text-ink-100 border border-line rounded-md px-2.5 py-1 hover:border-ink-100 transition-colors shrink-0">
              Open passport
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
          <Link href="/activity" className="text-xs font-medium text-ink-100 border border-line rounded-md px-2.5 py-1 hover:border-ink-100 transition-colors">View all</Link>
        </div>
        <div className="rounded-xl border border-line bg-panel shadow-card divide-y divide-line">
          {recentActivity.length === 0 && (
            <div className="p-5 text-sm text-ink-400">No activity imported yet.</div>
          )}
          {recentActivity.map((a) => (
            <Link
              href={`/assets/${a.aiAssetId}`}
              key={a.id}
              className="flex items-center justify-between px-4 py-3 text-sm hover:bg-black/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-ink-400/50 shrink-0" />
                <span className="tabular text-xs text-ink-400">{new Date(a.occurredAt).toLocaleTimeString()}</span>
                <span className="text-ink-400"><VendorIcon vendor={a.aiAsset.vendor ?? ""} size={13} /></span>
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
    <div className="rounded-xl border border-line bg-panel shadow-card p-5 flex flex-col justify-between">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        <span className="text-xs text-ink-400">{label}</span>
      </div>
      <div className={`tabular font-display text-3xl font-bold mt-3 ${tone === "alarm" ? "text-alarm" : "text-ink-100"}`}>
        {value}
      </div>
    </div>
  );
}

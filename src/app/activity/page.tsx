import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/Badge";
import StatusDot from "@/components/StatusDot";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

const SOURCE_LABEL: Record<string, string> = {
  MICROSOFT_365: "Microsoft 365",
  GITHUB: "GitHub",
  ANTHROPIC: "Claude",
  OPENAI: "ChatGPT",
  GOOGLE_WORKSPACE: "Google Workspace",
};

interface SnapshotPayload {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  highRiskCount: number;
}

interface CheckRow {
  key: string;
  label: string;
  status: "PASSED" | "WARNING" | "FAILED";
  detail: string;
}

const TABS = [
  { key: "events", label: "Events" },
  { key: "evidence", label: "Evidence" },
] as const;

export default async function ActivityPage({ searchParams }: { searchParams: { q?: string; tab?: string } }) {
  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "events";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Activity</h1>
        <p className="text-sm text-ink-400 mt-1.5">
          What every connector observed, and the evidence trail behind every control.
        </p>
      </div>

      <div className="inline-flex gap-1 bg-ink rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/activity?tab=${t.key}`}
            className={`text-sm px-3.5 py-1.5 rounded-md transition-colors ${
              tab === t.key ? "bg-panel text-ink-100 font-medium shadow-card" : "text-ink-400 hover:text-ink-100"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "events" ? <EventsTab q={searchParams.q} /> : <EvidenceTab />}
    </div>
  );
}

async function EventsTab({ q }: { q?: string }) {
  const query = q?.trim();
  const activities = await db.aiAssetActivity.findMany({
    where: {
      aiAsset: { organizationId: ORG_ID },
      ...(query
        ? {
            OR: [
              { eventType: { contains: query, mode: "insensitive" } },
              { actorRef: { contains: query, mode: "insensitive" } },
              { aiAsset: { name: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { aiAsset: { include: { riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    orderBy: { occurredAt: "desc" },
    take: 150,
  });

  return (
    <div className="flex flex-col gap-4">
      <form className="flex gap-2">
        <input type="hidden" name="tab" value="events" />
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search events, actors, assets…"
          className="bg-panel border border-line rounded-md px-3 py-1.5 text-sm text-ink-100 w-72"
        />
        <button type="submit" className="text-sm px-3 py-1.5 rounded-md border border-line text-ink-100 hover:border-ink-100 transition-colors">
          Search
        </button>
        {query && (
          <Link href="/activity" className="text-sm px-3 py-1.5 text-ink-400 hover:text-ink-100">
            Clear
          </Link>
        )}
      </form>

      <div className="rounded-xl border border-line bg-panel shadow-card divide-y divide-line">
        {activities.map((a) => {
          const risk = a.aiAsset.riskAssessments[0];
          return (
            <Link href={`/activity/${a.id}`} key={a.id} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-black/[0.02] transition-colors">
              <div className="flex items-center gap-3">
                <span className="tabular text-xs text-ink-400 w-36 shrink-0">{new Date(a.occurredAt).toLocaleString()}</span>
                <span className="font-medium text-ink-100">{a.aiAsset.name}</span>
                <span className="text-ink-400">{a.eventType}</span>
                {a.actorRef && <span className="text-ink-400 text-xs">{a.actorRef}</span>}
              </div>
              <div className="flex items-center gap-3">
                {risk && <Badge>{risk.level}</Badge>}
                <span className="text-xs text-ink-400">{SOURCE_LABEL[a.source] ?? a.source}</span>
              </div>
            </Link>
          );
        })}
        {activities.length === 0 && (
          <div className="px-4 py-6 text-sm text-ink-400">
            {query ? "No events match your search." : "No activity imported yet. Sync a connector to populate this."}
          </div>
        )}
      </div>
    </div>
  );
}

async function EvidenceTab() {
  const [assets, snapshots] = await Promise.all([
    db.aiAsset.findMany({
      where: { organizationId: ORG_ID, deletedAt: null },
      include: { assuranceReports: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { name: "asc" },
    }),
    db.evidence.findMany({
      where: { organizationId: ORG_ID, type: "inventory_snapshot" },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const withReport = assets.filter((a) => a.assuranceReports[0]);

  return (
    <div className="flex flex-col gap-8">
      <p className="text-xs text-ink-400 max-w-lg">
        Every control, its status, and where that status comes from — this is the record you'd hand to an auditor.
      </p>

      <div className="flex flex-col gap-5">
        {withReport.map((asset) => {
          const checks = asset.assuranceReports[0].checks as unknown as CheckRow[];
          return (
            <div key={asset.id} className="rounded-xl border border-line bg-panel shadow-card overflow-hidden">
              <div className="px-5 py-3 border-b border-line flex items-center justify-between">
                <Link href={`/assets/${asset.id}`} className="font-medium text-sm text-ink-100 hover:underline">
                  {asset.name}
                </Link>
                <span className="text-xs text-ink-400">{checks.length} controls</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-400 border-b border-line">
                    <th className="px-5 py-2 font-medium">Control</th>
                    <th className="px-5 py-2 font-medium w-20">Status</th>
                    <th className="px-5 py-2 font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {checks.map((c) => (
                    <tr key={c.key}>
                      <td className="px-5 py-2 text-ink-100">{c.label}</td>
                      <td className="px-5 py-2"><StatusDot status={c.status} /></td>
                      <td className="px-5 py-2 text-ink-400">{c.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        {withReport.length === 0 && (
          <div className="rounded-xl border border-line bg-panel shadow-card p-5 text-sm text-ink-400">
            No assurance reports yet — evidence appears automatically after the first connector sync.
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium text-ink-400 mb-3">Inventory history</h2>
        <div className="rounded-xl border border-line bg-panel shadow-card divide-y divide-line">
          {snapshots.length === 0 && (
            <div className="p-5 text-sm text-ink-400">No snapshots yet. One is recorded automatically the first time a connector syncs.</div>
          )}
          {snapshots.map((s) => {
            const p = s.payload as unknown as SnapshotPayload;
            return (
              <div key={s.id} className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink-100">{s.summary}</span>
                  <span className="tabular text-xs text-ink-400">{new Date(s.createdAt).toLocaleString()}</span>
                </div>
                {p?.highRiskCount > 0 && (
                  <div className="text-xs text-alarm mt-1">{p.highRiskCount} asset at high or critical risk at this point in time.</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

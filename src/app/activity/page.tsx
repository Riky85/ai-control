import { fmtDateTime } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/Badge";
import StatusDot from "@/components/StatusDot";
import ExportMenu from "@/components/ExportMenu";
import { Table, td, PageHeader, Tabs } from "@/components/ui";
import VendorIcon, { VendorBadge } from "@/components/VendorIcon";

export const dynamic = "force-dynamic";


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
      <PageHeader
        title="Activity"
        subtitle={"What every connector observed, and the evidence trail behind every control."}
        action={<ExportMenu dataset="activity" />}
      />

      <Tabs active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/activity?tab=${t.key}` }))} />

      {tab === "events" ? <EventsTab q={searchParams.q} /> : <EvidenceTab />}
    </div>
  );
}

async function EventsTab({ q }: { q?: string }) {
  const query = q?.trim();
  const activities = await db.aiAssetActivity.findMany({
    where: {
      aiAsset: { organizationId: currentOrgId() },
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
          className="border border-line rounded-lg px-3 py-2 text-sm text-ink-100 bg-panel w-72 placeholder:text-ink-400"
        />
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
        {query && (
          <Link href="/activity" className="text-sm px-3 py-1.5 text-ink-400 hover:text-ink-100">
            Clear
          </Link>
        )}
      </form>

      <Table
        columns={["System", "Event", "Actor", "Risk", "Source", "When"]}
        empty={activities.length === 0 && (query ? "No events match your search." : "No activity imported yet. Sync a connector to populate this.")}
      >
        {activities.map((a) => {
          const risk = a.aiAsset.riskAssessments[0];
          return (
            <tr key={a.id}>
              <td className={td}>
                <Link href={`/activity/${a.id}`} className="flex items-center gap-3 group">
                  <VendorBadge vendor={a.aiAsset.vendor ?? ""} name={a.aiAsset.name} size={32} />
                  <span className="font-medium text-ink-100 group-hover:underline">{a.aiAsset.name}</span>
                </Link>
              </td>
              <td className={`${td} text-ink-100`}>{a.eventType}</td>
              <td className={`${td} text-ink-400`}>{a.actorRef ?? "—"}</td>
              <td className={td}>{risk ? <Badge>{risk.level}</Badge> : <span className="text-ink-400">—</span>}</td>
              <td className={`${td} text-ink-400`}>{SOURCE_LABEL[a.source] ?? a.source}</td>
              <td className={`${td} text-ink-400 tabular`}>{fmtDateTime(a.occurredAt)}</td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}

async function EvidenceTab() {
  const [assets, snapshots] = await Promise.all([
    db.aiAsset.findMany({
      where: { organizationId: currentOrgId(), deletedAt: null },
      include: { assuranceReports: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { name: "asc" },
    }),
    db.evidence.findMany({
      where: { organizationId: currentOrgId(), type: "inventory_snapshot" },
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
            <div key={asset.id} className="rounded-xl border border-line bg-panel overflow-hidden">
              <div className="px-5 py-3 border-b border-line flex items-center justify-between">
                <Link href={`/assets/${asset.id}`} className="font-medium text-sm text-ink-100 hover:underline">
                  {asset.name}
                </Link>
                <span className="text-xs text-ink-400">{checks.length} controls</span>
              </div>
              <Table columns={["Control", { label: "Status", className: "w-20" }, "Evidence"]}>
                  {checks.map((c) => (
                    <tr key={c.key}>
                      <td className="px-5 py-3 text-ink-100">{c.label}</td>
                      <td className="px-5 py-3"><StatusDot status={c.status} /></td>
                      <td className="px-5 py-3 text-ink-400">{c.detail}</td>
                    </tr>
                  ))}
                </Table>
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
                  <span className="tabular text-xs text-ink-400">{fmtDateTime(s.createdAt)}</span>
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

import FilterBar from "@/components/FilterBar";
import ChangesTab from "./ChangesTab";
import { fmtAgo, fmtDateTime } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/Badge";
import StatusDot from "@/components/StatusDot";
import ExportMenu from "@/components/ExportMenu";
import { Table, td, PageHeader, Tabs, StatCard } from "@/components/ui";
import { EmptyState, Insight, TrendPanel, dailySeries, pctChange, trendWord } from "@/components/insight";
import { VendorBadge } from "@/components/VendorIcon";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";
import { displayableRef } from "@/lib/discovery/pseudonym";

export const dynamic = "force-dynamic";


const SOURCE_LABEL: Record<string, string> = {
  MICROSOFT_365: "Microsoft 365",
  GITHUB: "GitHub",
  ANTHROPIC: "Claude",
  OPENAI: "ChatGPT",
  GOOGLE_WORKSPACE: "Google Workspace",
  AZURE_OPENAI: "Azure Cost Management",
  AWS_BEDROCK: "AWS Cost Explorer",
  GOOGLE_VERTEX: "Google Cloud billing",
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

const DAY = 86400000;

/** Riepilogo in cima agli eventi: numeri, andamento di 30 giorni e una frase utile (niente attori). */
async function EventsSummary({ orgId }: { orgId: string }) {
  const now = Date.now();
  const [recent, assetCount, last] = await Promise.all([
    db.aiAssetActivity.findMany({
      where: { aiAsset: { organizationId: orgId }, occurredAt: { gte: new Date(now - 60 * DAY) } },
      select: { occurredAt: true, aiAssetId: true, source: true, aiAsset: { select: { name: true } } },
      take: 20000,
    }),
    db.aiAsset.count({ where: { organizationId: orgId, deletedAt: null } }),
    db.aiAssetActivity.findFirst({ where: { aiAsset: { organizationId: orgId } }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true } }),
  ]);
  if (!last) return null;
  const in30 = recent.filter((e) => e.occurredAt.getTime() >= now - 30 * DAY);
  const prev30 = recent.length - in30.length;
  const week = in30.filter((e) => e.occurredAt.getTime() >= now - 7 * DAY);
  const prevWeek = in30.filter((e) => e.occurredAt.getTime() < now - 7 * DAY && e.occurredAt.getTime() >= now - 14 * DAY).length;
  const change30 = pctChange(in30.length, prev30);
  const changeWeek = pctChange(week.length, prevWeek);
  const sources = [...new Set(in30.map((e) => SOURCE_LABEL[e.source] ?? e.source))];
  const aiActive = new Set(in30.map((e) => e.aiAssetId)).size;

  // L'AI più attiva degli ultimi 7 giorni (o 30 se la settimana è vuota).
  const pool = week.length ? week : in30;
  const byAi = new Map<string, { name: string; n: number }>();
  for (const e of pool) byAi.set(e.aiAssetId, { name: e.aiAsset.name, n: (byAi.get(e.aiAssetId)?.n ?? 0) + 1 });
  const top = [...byAi.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  const topShare = top && pool.length ? Math.round((top[1].n / pool.length) * 100) : 0;
  const { values, labels } = dailySeries(in30.map((e) => e.occurredAt));
  const stale = now - last.occurredAt.getTime() > 7 * DAY;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Events, 30 days" value={in30.length.toLocaleString("en-GB")} hint={change30 != null ? `${trendWord(change30)} vs the 30 days before` : "First month of data"} tone="accent" />
        <StatCard label="AI with activity" value={String(aiActive)} hint={`of ${assetCount} AI on record`} href="/#your-ai" />
        <StatCard label="Sources reporting" value={String(sources.length)} hint={sources.join(", ") || "None in 30 days"} href="/sources" />
        <StatCard label="Last event" value={fmtAgo(last.occurredAt)} hint={fmtDateTime(last.occurredAt)} tone={stale ? "signal" : undefined} />
      </div>
      <TrendPanel title="Events each day" note="Last 30 days" values={values} labels={labels} unit=" events" />
      {stale ? (
        <Insight tone="signal" href="/sources" cta="Check sources">
          No new events in {Math.floor((now - last.occurredAt.getTime()) / DAY)} days — a connector may have stopped syncing.
        </Insight>
      ) : top && (
        <Insight tone={changeWeek != null && changeWeek >= 40 ? "signal" : "accent"} href={`/assets/${top[0]}`} cta={`Open ${top[1].name}`}>
          {changeWeek != null ? `Activity is ${trendWord(changeWeek)} vs last week. ` : ""}
          <b className="font-medium">{top[1].name}</b> is the busiest AI — {topShare}% of events {week.length ? "this week" : "this month"}.
        </Insight>
      )}
    </>
  );
}

const TABS = [
  { key: "events", label: "Events" },
  { key: "changes", label: "Changes" },
  { key: "evidence", label: "Evidence" },
] as const;

export default async function ActivityPage({ searchParams }: { searchParams: { q?: string; tab?: string; field?: string } }) {
  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "events";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Activity"
        subtitle={"What every connector observed, what changed between syncs, and the evidence trail behind every control."}
        action={<ExportMenu dataset={tab === "changes" ? "changes" : "activity"} />}
      />

      <Tabs active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/activity?tab=${t.key}` }))} />

      {tab === "events" ? <EventsTab q={searchParams.q} /> : tab === "changes" ? <ChangesTab q={searchParams.q} field={searchParams.field} /> : <EvidenceTab />}
    </div>
  );
}

async function EventsTab({ q }: { q?: string }) {
  const query = q?.trim();
  // Privacy per reparto / solo totali: niente attori (email, username) né ricerca per persona.
  const people = showsPeople(await orgPrivacyMode(currentOrgId()));
  const activities = await db.aiAssetActivity.findMany({
    where: {
      aiAsset: { organizationId: currentOrgId() },
      ...(query
        ? {
            OR: [
              { eventType: { contains: query, mode: "insensitive" } },
              ...(people ? [{ actorRef: { contains: query, mode: "insensitive" as const } }] : []),
              { aiAsset: { name: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { aiAsset: { include: { riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    orderBy: { occurredAt: "desc" },
    take: 150,
  });

  if (!query && activities.length === 0)
    return <EmptyState title="No activity yet" text="Events appear here after the first sync of Microsoft 365, Google Workspace, GitHub or an AI provider key." href="/connect" cta="Connect a source" />;

  return (
    <div className="flex flex-col gap-4">
      <EventsSummary orgId={currentOrgId()} />
      <FilterBar search={{ placeholder: people ? "Search events, people, AI…" : "Search events, AI…" }} right={`${activities.length} events`} />

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
              <td className={`${td} text-ink-400`}>{!a.actorRef ? "—" : people ? displayableRef(a.actorRef) ?? "Anonymous" : <span title="Hidden by the employee privacy mode">Hidden</span>}</td>
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
  // Il controllo che non passa sul maggior numero di AI: è lì che conviene lavorare.
  const failing = new Map<string, { label: string; n: number; firstAsset: string }>();
  for (const a of withReport)
    for (const c of (a.assuranceReports[0].checks as unknown as CheckRow[]) ?? [])
      if (c.status === "FAILED") failing.set(c.key, { label: c.label, n: (failing.get(c.key)?.n ?? 0) + 1, firstAsset: failing.get(c.key)?.firstAsset ?? a.id });
  const worst = [...failing.values()].sort((x, y) => y.n - x.n)[0];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-ink-400 max-w-lg">
        Every control, its status, and where that status comes from — this is the record you'd hand to an auditor.
      </p>
      {worst ? (
        <Insight tone="alarm" href={`/assets/${worst.firstAsset}`} cta="Fix the first one">
          <b className="font-medium">{worst.label}</b> fails on {worst.n} AI — the control to fix first.
        </Insight>
      ) : withReport.length > 0 ? (
        <Insight tone="steady" href="/compliance/evidence" cta="Evidence pack">No control is failing on any AI.</Insight>
      ) : null}

      <div className="flex flex-col gap-4">
        {withReport.map((asset) => {
          const checks = (asset.assuranceReports[0].checks as unknown as CheckRow[] | null) ?? [];
          return (
            <div key={asset.id} className="flex flex-col gap-2">
              <div className="px-1 flex items-center justify-between">
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
          <div className="rounded-xl border border-line bg-panel p-5 text-sm text-ink-400">
            No assurance reports yet — evidence appears automatically after the first connector sync.
          </div>
        )}
      </div>

      <div>
        <div className="rounded-xl border border-line bg-panel divide-y divide-line overflow-hidden">
          <h2 className="px-5 py-3 text-sm font-bold text-ink-100">Inventory history</h2>
          {snapshots.length === 0 && (
            <div className="p-5 text-sm text-ink-400">No snapshots yet. One is recorded automatically the first time a connector syncs.</div>
          )}
          {snapshots.map((s) => {
            const p = s.payload as unknown as SnapshotPayload;
            return (
              <div key={s.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm text-ink-100 min-w-0">{s.summary}</span>
                  <span className="tabular text-xs text-ink-400 shrink-0">{fmtDateTime(s.createdAt)}</span>
                </div>
                {p?.highRiskCount > 0 && (
                  <div className="text-xs text-alarm mt-1">{p.highRiskCount} asset{p.highRiskCount === 1 ? "" : "s"} at high or critical risk at this point in time.</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

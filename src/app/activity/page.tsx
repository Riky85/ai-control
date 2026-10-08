import FilterBar from "@/components/FilterBar";
import ChangesTab from "./ChangesTab";
import AuditTab from "./AuditTab";
import { currentSession } from "@/lib/auth";
import { fmtAgo, fmtDateTime } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/Badge";
import StatusDot from "@/components/StatusDot";
import ExportMenu from "@/components/ExportMenu";
import { BlockHead, EmptyState, Table, td, PageHeader, Tabs, StatCard } from "@/components/ui";
import { Insight, TrendPanel, dailySeries, pctChange, trendWord } from "@/components/insight";
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

  const quiet = Math.floor((now - last.occurredAt.getTime()) / DAY);
  // Niente frase a parte: l'AI più attiva e il silenzio dei connettori stanno nelle card.
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Events, 30 days" value={in30.length.toLocaleString("en-GB")} hint={change30 != null ? `${trendWord(change30)} vs the 30 days before` : "First month of data"} />
        <StatCard
          label="AI with activity"
          value={String(aiActive)}
          hint={top ? `Busiest: ${top[1].name}, ${topShare}%${changeWeek != null ? ` · ${trendWord(changeWeek)} this week` : ""}` : `of ${assetCount} AI on record`}
          href={top ? `/estate/${top[0]}` : "/estate"}
        />
        <StatCard label="Sources reporting" value={String(sources.length)} hint={sources.join(", ") || "None in 30 days"} href="/sources" />
        <StatCard label="Last event" value={fmtAgo(last.occurredAt)} hint={stale ? `Nothing new in ${quiet} days` : fmtDateTime(last.occurredAt)} tone={stale ? "warn" : undefined} href={stale ? "/sources" : undefined} />
      </div>
      <TrendPanel title="Events each day" note="Last 30 days" values={values} labels={labels} unit=" events" />
    </>
  );
}

// "Audit log" (prima /audit) solo per amministratori; "Activity evidence" per distinguerla dall'AI Act evidence pack.
const TABS = [
  { key: "events", label: "Events", admin: false },
  { key: "changes", label: "Changes", admin: false },
  { key: "evidence", label: "Activity evidence", admin: false },
  { key: "audit", label: "Audit log", admin: true },
] as const;

export default async function ActivityPage({ searchParams }: { searchParams: { q?: string; tab?: string; field?: string } }) {
  const role = currentSession()?.role ?? "VIEWER";
  const isAdmin = role === "ADMIN" || role === "OWNER";
  const tabs = TABS.filter((t) => !t.admin || isAdmin);
  // Chi non è amministratore e apre ?tab=audit passa da AuditTab, che rimanda con il messaggio del ruolo.
  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "events";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader subtitle="Everything angar has seen"
        title="Activity"
        action={tab === "audit" ? undefined : <ExportMenu dataset={tab === "changes" ? "changes" : "activity"} />}
      />

      <Tabs active={tab} items={tabs.map((t) => ({ key: t.key, label: t.label, href: `/activity?tab=${t.key}` }))} />

      {tab === "events" ? (
        <EventsTab q={searchParams.q} />
      ) : tab === "changes" ? (
        <ChangesTab q={searchParams.q} field={searchParams.field} />
      ) : tab === "audit" ? (
        <AuditTab q={searchParams.q} />
      ) : (
        <EvidenceTab />
      )}
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
    return <EmptyState text="No activity yet." action={<Link href="/connect" className="btn btn-primary">Connect a source</Link>} />;

  return (
    <div className="flex flex-col gap-6">
      <EventsSummary orgId={currentOrgId()} />
      <FilterBar search={{ placeholder: people ? "Search events, people, AI…" : "Search events, AI…" }} right={`${activities.length} events`} />

      <Table
        columns={["System", "Event", "Actor", "Risk", "Source", "When"]}
        empty={activities.length === 0 && (query ? "No events match your search." : "No activity imported yet.")}
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
    <div className="flex flex-col gap-6">
      {worst ? (
        <Insight tone="alarm" href={`/estate/${worst.firstAsset}`} cta="Fix the first one">
          <b className="font-medium">{worst.label}</b> fails on {worst.n} AI. Fix this control first.
        </Insight>
      ) : withReport.length > 0 ? (
        <Insight tone="steady" href="/compliance/evidence" cta="Evidence pack">No control is failing on any AI.</Insight>
      ) : null}

      {withReport.length === 0 ? (
        <EmptyState text="No assurance reports yet. They appear after the first connector sync." />
      ) : (
        withReport.map((asset) => {
          const checks = (asset.assuranceReports[0].checks as unknown as CheckRow[] | null) ?? [];
          return (
            <Table
              key={asset.id}
              title={<Link href={`/estate/${asset.id}`} className="hover:underline">{asset.name}</Link>}
              note={`${checks.length} controls`}
              columns={["Control", { label: "Status", className: "w-20" }, "Evidence"]}
            >
              {checks.map((c) => (
                <tr key={c.key}>
                  <td className={`${td} text-ink-100`}>{c.label}</td>
                  <td className={td}><StatusDot status={c.status} /></td>
                  <td className={`${td} text-ink-400`}>{c.detail}</td>
                </tr>
              ))}
            </Table>
          );
        })
      )}

      <div className="rounded-xl border border-line bg-panel animate-rise">
        <BlockHead title="Inventory history" note={snapshots.length ? `Last ${snapshots.length}` : undefined} />
        <div className="divide-y divide-line">
          {snapshots.length === 0 && <div className="px-5 py-8 text-center text-sm text-ink-400">No snapshots yet. One is recorded at the first connector sync.</div>}
          {snapshots.map((s) => {
            const p = s.payload as unknown as SnapshotPayload;
            return (
              <div key={s.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm text-ink-100 min-w-0">{s.summary}</span>
                  <span className="eyebrow tabular shrink-0">{fmtDateTime(s.createdAt)}</span>
                </div>
                {p?.highRiskCount > 0 && (
                  <div className="text-xs text-alarm mt-1">{p.highRiskCount} asset{p.highRiskCount === 1 ? "" : "s"} at high or critical risk at that time.</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

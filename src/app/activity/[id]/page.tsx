import { PageHeader, BlockHead, Panel } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import Link from "next/link";
import { notFound } from "next/navigation";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";
import { displayableRef } from "@/lib/discovery/pseudonym";
import { TrendPanel, dailySeries } from "@/components/insight";

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

export default async function ActivityDetailPage({ params }: { params: { id: string } }) {
  const activity = await db.aiAssetActivity.findFirst({
    where: { id: params.id, aiAsset: { organizationId: currentOrgId() } },
    include: {
      aiAsset: {
        include: {
          owner: true,
          riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  if (!activity) notFound();
  const risk = activity.aiAsset.riskAssessments[0];
  // Il payload grezzo può contenere email, username o nomi di dispositivi.
  const people = showsPeople(await orgPrivacyMode(currentOrgId()));
  // Contesto: gli altri eventi della stessa AI (30 giorni), senza attori.
  const siblings = await db.aiAssetActivity.findMany({
    where: { aiAssetId: activity.aiAssetId, occurredAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    select: { id: true, eventType: true, occurredAt: true },
    orderBy: { occurredAt: "desc" },
    take: 5000,
  });
  const trend = dailySeries(siblings, 30, (e) => e.occurredAt);
  const others = siblings.filter((e) => e.id !== activity.id).slice(0, 5);

  return (
    <div className="flex flex-col gap-6 [&>*:not(.page-bar)]:max-w-2xl">
      <PageHeader
        crumbs={[{ label: "Activity", href: "/activity" }]}
        title={activity.eventType}
        subtitle={`${fmtDateTime(activity.occurredAt)} · ${SOURCE_LABEL[activity.source] ?? activity.source}`}
      />

      <Panel title="Event details">
        <dl className="flex flex-col gap-2.5 text-sm">
          <Row label="Asset">
            <Link href={`/estate/${activity.aiAssetId}`} className="text-ink-100 hover:underline font-medium">
              {activity.aiAsset.name}
            </Link>
          </Row>
          <Row label="Actor">
            <span className="text-ink-100">{!activity.actorRef ? "Unknown" : people ? displayableRef(activity.actorRef) ?? "Anonymous" : "Hidden by the employee privacy mode"}</span>
          </Row>
          <Row label="Event type">
            <span className="text-ink-100">{activity.eventType}</span>
          </Row>
          <Row label="Source connector">
            <span className="text-ink-100">{SOURCE_LABEL[activity.source] ?? activity.source}</span>
          </Row>
          <Row label="Owner on record">
            <span className="text-ink-100">{activity.aiAsset.owner?.name ?? "No owner on record"}</span>
          </Row>
          <Row label="Asset risk level">{risk ? <Badge>{risk.level}</Badge> : <span className="text-ink-400">Not assessed</span>}</Row>
        </dl>
      </Panel>

      {siblings.length > 1 && (
        <TrendPanel title={`${activity.aiAsset.name}: ${siblings.length} events in 30 days`} note="Each day" values={trend.values} labels={trend.labels} unit=" events" />
      )}

      {others.length > 0 && (
        <div className="rounded-xl border border-line bg-panel animate-rise overflow-hidden">
          <BlockHead
            title="Other events"
            rounded=""
            action={<Link href={`/activity?q=${encodeURIComponent(activity.aiAsset.name)}`} className="eyebrow hover:!text-ink-100 transition-colors">All [→]</Link>}
          />
          <div className="divide-y divide-line">
          {others.map((e) => (
            <Link key={e.id} href={`/activity/${e.id}`} className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-ink-100/[0.025] transition-colors">
              <span className="text-ink-100 truncate">{e.eventType}</span>
              <span className="eyebrow tabular shrink-0">{fmtDateTime(e.occurredAt)}</span>
            </Link>
          ))}
          </div>
        </div>
      )}

      {activity.payload != null && people && (
        <Panel title="Raw event payload" subtitle="Exactly what the connector imported">
          <pre className="text-xs text-ink-100 bg-ink border border-line rounded p-3 overflow-x-auto">
            {JSON.stringify(activity.payload, null, 2)}
          </pre>
        </Panel>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="eyebrow pt-0.5">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

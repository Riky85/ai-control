import { fmtDateTime } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  MICROSOFT_365: "Microsoft 365",
  GITHUB: "GitHub",
  ANTHROPIC: "Claude",
  OPENAI: "ChatGPT",
  GOOGLE_WORKSPACE: "Google Workspace",
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

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <div className="text-xs text-ink-400 mb-2">
          <Link href="/activity" className="hover:text-ink-100 hover:underline">Activity</Link>
          <span className="mx-1.5">/</span>
          {activity.eventType}
        </div>
        <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink-100">{activity.eventType}</h1>
        <p className="text-sm text-ink-400 mt-1">
          {fmtDateTime(activity.occurredAt)} · {SOURCE_LABEL[activity.source] ?? activity.source}
        </p>
      </div>

      <div className="rounded-xl border border-line bg-panel shadow-card p-5 text-sm">
        <h2 className="text-xs font-medium text-ink-400 mb-3">Event details</h2>
        <dl className="flex flex-col gap-2.5">
          <Row label="Asset">
            <Link href={`/assets/${activity.aiAssetId}`} className="text-ink-100 hover:underline font-medium">
              {activity.aiAsset.name}
            </Link>
          </Row>
          <Row label="Actor">
            <span className="text-ink-100">{activity.actorRef ?? "Unknown"}</span>
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
      </div>

      {activity.payload != null && (
        <div className="rounded-xl border border-line bg-panel shadow-card p-5">
          <h2 className="text-xs font-medium text-ink-400 mb-3">Raw event payload</h2>
          <p className="text-xs text-ink-400 mb-3">
            Exactly what the connector imported — useful for tracing back to the source system.
          </p>
          <pre className="text-xs text-ink-100 bg-ink border border-line rounded p-3 overflow-x-auto">
            {JSON.stringify(activity.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-400">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

import { db } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

const SOURCE_LABEL: Record<string, string> = {
  MICROSOFT_365: "Microsoft 365",
  GITHUB: "GitHub",
  ANTHROPIC: "Claude",
  OPENAI: "ChatGPT",
  GOOGLE_WORKSPACE: "Google Workspace",
};

export default async function ActivityPage() {
  const activities = await db.aiAssetActivity.findMany({
    where: { aiAsset: { organizationId: ORG_ID } },
    include: { aiAsset: true },
    orderBy: { occurredAt: "desc" },
    take: 150,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Activity</h1>
        <p className="text-sm text-ink-400 mt-1.5">
          Every event every connector has imported, across all assets.
        </p>
      </div>

      <div className="rounded-md border border-line bg-panel divide-y divide-line">
        {activities.map((a) => (
          <div key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="tabular text-xs text-ink-400 w-36 shrink-0">
                {new Date(a.occurredAt).toLocaleString()}
              </span>
              <Link href={`/assets/${a.aiAssetId}`} className="hover:underline font-medium text-ink-100">
                {a.aiAsset.name}
              </Link>
              <span className="text-ink-400">{a.eventType}</span>
              {a.actorRef && <span className="text-ink-400 text-xs">{a.actorRef}</span>}
            </div>
            <span className="text-xs text-ink-400">{SOURCE_LABEL[a.source] ?? a.source}</span>
          </div>
        ))}
        {activities.length === 0 && (
          <div className="px-4 py-6 text-sm text-ink-400">
            No activity imported yet. Sync a connector to populate this.
          </div>
        )}
      </div>
    </div>
  );
}

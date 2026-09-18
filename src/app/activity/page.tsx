import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/Badge";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

const SOURCE_LABEL: Record<string, string> = {
  MICROSOFT_365: "Microsoft 365",
  GITHUB: "GitHub",
  ANTHROPIC: "Claude",
  OPENAI: "ChatGPT",
  GOOGLE_WORKSPACE: "Google Workspace",
};

export default async function ActivityPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim();

  const activities = await db.aiAssetActivity.findMany({
    where: {
      aiAsset: { organizationId: ORG_ID },
      ...(q
        ? {
            OR: [
              { eventType: { contains: q, mode: "insensitive" } },
              { actorRef: { contains: q, mode: "insensitive" } },
              { aiAsset: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { aiAsset: { include: { riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } } } },
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

      <form className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search events, actors, assets…"
          className="bg-panel border border-line rounded-md px-3 py-1.5 text-sm text-ink-100 w-72"
        />
        <button type="submit" className="text-sm px-3 py-1.5 rounded-md border border-line text-ink-100 hover:border-ink-100 transition-colors">
          Search
        </button>
        {q && (
          <Link href="/activity" className="text-sm px-3 py-1.5 text-ink-400 hover:text-ink-100">
            Clear
          </Link>
        )}
      </form>

      <div className="rounded-md border border-line bg-panel shadow-card divide-y divide-line">
        {activities.map((a) => {
          const risk = a.aiAsset.riskAssessments[0];
          return (
            <Link
              href={`/activity/${a.id}`}
              key={a.id}
              className="flex items-center justify-between px-4 py-3 text-sm hover:bg-white/[0.025] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="tabular text-xs text-ink-400 w-36 shrink-0">
                  {new Date(a.occurredAt).toLocaleString()}
                </span>
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
            {q ? "No events match your search." : "No activity imported yet. Sync a connector to populate this."}
          </div>
        )}
      </div>
    </div>
  );
}

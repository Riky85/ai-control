import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

interface SnapshotPayload {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  highRiskCount: number;
}

export default async function EvidencePage() {
  const snapshots = await db.evidence.findMany({
    where: { organizationId: ORG_ID, type: "inventory_snapshot" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Evidence</h1>
        <p className="text-sm text-ink-400 mt-1.5 max-w-lg">
          A snapshot of the inventory is recorded automatically after every
          connector sync — this is the record you'd hand to an auditor.
        </p>
      </div>

      <div className="rounded-md border border-line bg-panel divide-y divide-line">
        {snapshots.length === 0 && (
          <div className="p-5 text-sm text-ink-400">
            No snapshots yet. One is recorded automatically the first time a connector syncs.
          </div>
        )}
        {snapshots.map((s) => {
          const p = s.payload as unknown as SnapshotPayload;
          return (
            <div key={s.id} className="px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-100">{s.summary}</span>
                <span className="tabular text-xs text-ink-400">
                  {new Date(s.createdAt).toLocaleString()}
                </span>
              </div>
              {p?.highRiskCount > 0 && (
                <div className="text-xs text-alarm mt-1">
                  {p.highRiskCount} asset at high or critical risk at this point in time.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { db } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

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

const ICON: Record<string, string> = { PASSED: "✓", WARNING: "!", FAILED: "✕" };
const COLOR: Record<string, string> = { PASSED: "text-steady", WARNING: "text-signal", FAILED: "text-alarm" };

export default async function EvidencePage() {
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
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Evidence</h1>
        <p className="text-sm text-ink-400 mt-1.5 max-w-lg">
          Every control, its status, and where that status comes from — this is the record you'd
          hand to an auditor. Nothing here is asserted without a fact backing it.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {withReport.map((asset) => {
          const checks = asset.assuranceReports[0].checks as unknown as CheckRow[];
          return (
            <div key={asset.id} className="rounded-md border border-line bg-panel shadow-card overflow-hidden">
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
                      <td className={`px-5 py-2 ${COLOR[c.status]}`}>{ICON[c.status]}</td>
                      <td className="px-5 py-2 text-ink-400">{c.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        {withReport.length === 0 && (
          <div className="rounded-md border border-line bg-panel shadow-card p-5 text-sm text-ink-400">
            No assurance reports yet — evidence appears automatically after the first connector sync.
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium text-ink-400 mb-3">Inventory history</h2>
        <div className="rounded-md border border-line bg-panel shadow-card divide-y divide-line">
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
    </div>
  );
}

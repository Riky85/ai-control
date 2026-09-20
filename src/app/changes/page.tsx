import { db } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

const FIELD_LABEL: Record<string, string> = {
  model: "Model",
  vendor: "Vendor",
  status: "Status",
};

export default async function ChangesPage() {
  const changes = await db.assetChange.findMany({
    where: { aiAsset: { organizationId: ORG_ID } },
    include: { aiAsset: true },
    orderBy: { detectedAt: "desc" },
    take: 50,
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Changes</h1>
        <p className="text-sm text-ink-400 mt-1.5 max-w-lg">
          Material changes detected between syncs — a straight before/after comparison,
          not a guess. This is what makes a Passport living instead of a snapshot.
        </p>
      </div>

      <div className="rounded-xl border border-line bg-panel shadow-card divide-y divide-line">
        {changes.map((c) => (
          <Link
            key={c.id}
            href={`/assets/${c.aiAssetId}`}
            className="flex items-center justify-between px-5 py-3.5 text-sm hover:bg-black/[0.015] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="tabular text-xs text-ink-400 w-36 shrink-0">
                {new Date(c.detectedAt).toLocaleString()}
              </span>
              <span className="font-medium text-ink-100">{c.aiAsset.name}</span>
              <span className="text-xs text-ink-400">{FIELD_LABEL[c.field] ?? c.field}</span>
            </div>
            <div className="text-xs">
              <span className="text-ink-400">{c.oldValue ?? "—"}</span>
              <span className="mx-1.5 text-ink-400">→</span>
              <span className="text-ink-100 font-medium">{c.newValue ?? "—"}</span>
            </div>
          </Link>
        ))}
        {changes.length === 0 && (
          <div className="px-5 py-6 text-sm text-ink-400">
            No changes detected yet — they show up here the moment a synced value (model, vendor,
            status) differs from what was on record before.
          </div>
        )}
      </div>
    </div>
  );
}

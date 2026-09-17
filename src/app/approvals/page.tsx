import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import RiskGauge from "@/components/RiskGauge";
import { setAssetStatusAction } from "@/lib/actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

export default async function ApprovalsPage() {
  const pending = await db.aiAsset.findMany({
    where: {
      organizationId: ORG_ID,
      deletedAt: null,
      status: { in: ["UNKNOWN", "UNAPPROVED", "UNREVIEWED"] },
    },
    include: {
      owner: true,
      riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [{ status: "asc" }, { firstSeenAt: "desc" }],
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Reviews</h1>
        <p className="text-sm text-ink-400 mt-1.5 max-w-lg">
          Every asset that hasn't been formally reviewed yet — the checkpoint
          before something is treated as sanctioned.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {pending.map((asset) => {
          const risk = asset.riskAssessments[0];
          return (
            <div key={asset.id} className="rounded-md border border-line bg-panel shadow-card p-4 flex items-center gap-5">
              {risk && (
                <div className="shrink-0 scale-75 -my-3">
                  <RiskGauge score={risk.score} level={risk.level} />
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/assets/${asset.id}`} className="text-sm font-medium text-ink-100 hover:underline">
                    {asset.name}
                  </Link>
                  <Badge>{asset.status}</Badge>
                  {risk && <Badge>{risk.level}</Badge>}
                </div>
                <p className="text-xs text-ink-400 mt-1">
                  {asset.owner?.name ?? "No owner on record"} — first seen{" "}
                  {new Date(asset.firstSeenAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <form action={setAssetStatusAction}>
                  <input type="hidden" name="assetId" value={asset.id} />
                  <input type="hidden" name="status" value="APPROVED" />
                  <button
                    type="submit"
                    className="text-xs px-3 py-1.5 rounded border border-line text-ink-100 hover:border-accent hover:text-accent transition-colors"
                  >
                    Approve
                  </button>
                </form>
                <form action={setAssetStatusAction}>
                  <input type="hidden" name="assetId" value={asset.id} />
                  <input type="hidden" name="status" value="UNAPPROVED" />
                  <button
                    type="submit"
                    className="text-xs px-3 py-1.5 rounded border border-line text-ink-400 hover:text-alarm hover:border-alarm transition-colors"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </div>
          );
        })}
        {pending.length === 0 && (
          <div className="rounded-md border border-line bg-panel shadow-card p-6 text-sm text-ink-400">
            Nothing waiting on review. Every known asset has been approved or rejected.
          </div>
        )}
      </div>
    </div>
  );
}

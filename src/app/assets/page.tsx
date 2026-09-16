import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/Badge";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

export default async function AssetsPage() {
  const assets = await db.aiAsset.findMany({
    where: { organizationId: ORG_ID, deletedAt: null },
    include: {
      owner: true,
      riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastSeenAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">AI assets</h1>
        <p className="text-sm text-ink-400 mt-1.5">
          Every application, agent, API or MCP server detected across your connectors.
        </p>
      </div>

      <div className="rounded-md border border-line bg-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400 border-b border-line">
              <th className="px-4 py-3 font-medium">Asset</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Risk</th>
              <th className="px-4 py-3 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {assets.map((asset) => {
              const risk = asset.riskAssessments[0];
              return (
                <tr key={asset.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <Link href={`/assets/${asset.id}`} className="hover:underline font-medium text-ink-100">
                      {asset.name}
                    </Link>
                    <div className="text-xs text-ink-400">{asset.vendor ?? "Vendor unknown"}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-400">{asset.type.replace(/_/g, " ").toLowerCase()}</td>
                  <td className="px-4 py-3 text-ink-400">
                    {asset.owner?.name ?? <span className="text-signal">No owner</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{asset.status}</Badge>
                  </td>
                  <td className="px-4 py-3">{risk ? <Badge>{risk.level}</Badge> : "—"}</td>
                  <td className="px-4 py-3 text-ink-400 text-xs tabular">
                    {asset.lastSeenAt ? new Date(asset.lastSeenAt).toLocaleString() : "Never"}
                  </td>
                </tr>
              );
            })}
            {assets.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-sm text-ink-400">
                  No assets yet. Connect Microsoft 365 or GitHub to start discovery.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
        <h1 className="text-xl font-semibold">AI Assets</h1>
        <p className="text-sm text-muted mt-1">
          Ogni applicazione, agente, API o MCP server rilevato in azienda.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-border">
              <th className="px-4 py-3 font-medium">Asset</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Risk</th>
              <th className="px-4 py-3 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {assets.map((asset) => {
              const risk = asset.riskAssessments[0];
              return (
                <tr key={asset.id} className="hover:bg-white/5">
                  <td className="px-4 py-3">
                    <Link href={`/assets/${asset.id}`} className="hover:underline font-medium">
                      {asset.name}
                    </Link>
                    <div className="text-xs text-muted">{asset.vendor ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{asset.type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-muted">
                    {asset.owner?.name ?? <span className="text-warning">Unowned</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{asset.status}</Badge>
                  </td>
                  <td className="px-4 py-3">{risk ? <Badge>{risk.level}</Badge> : "—"}</td>
                  <td className="px-4 py-3 text-muted text-xs">
                    {asset.lastSeenAt ? new Date(asset.lastSeenAt).toLocaleString() : "Never"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { db } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

export default async function PeoplePage() {
  const users = await db.user.findMany({
    where: { organizationId: ORG_ID },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { ownedAssets: true, usages: true } },
      ownedAssets: {
        where: { deletedAt: null },
        include: { riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">People</h1>
        <p className="text-sm text-ink-400 mt-1.5">
          Everyone connectors have observed using or owning an AI asset.
        </p>
      </div>

      <div className="rounded-xl border border-line bg-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400 bg-ink border-b border-line">
              <th className="px-5 py-2.5 font-medium">Person</th>
              <th className="px-5 py-2.5 font-medium">Department</th>
              <th className="px-5 py-2.5 font-medium">Owns</th>
              <th className="px-5 py-2.5 font-medium">Uses</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => {
              const highRiskOwned = u.ownedAssets.filter((a) =>
                ["HIGH", "CRITICAL"].includes(a.riskAssessments[0]?.level ?? "")
              ).length;
              return (
                <tr key={u.id} className="hover:bg-black/[0.025]">
                  <td className="px-5 py-3">
                    <Link href={`/people/${u.id}`} className="font-medium text-ink-100 hover:underline">
                      {u.name ?? u.email}
                    </Link>
                    <div className="text-xs text-ink-400">{u.email}</div>
                  </td>
                  <td className="px-5 py-3 text-ink-400">{u.department ?? "—"}</td>
                  <td className="px-5 py-3 tabular text-ink-100">{u._count.ownedAssets}</td>
                  <td className="px-5 py-3 tabular text-ink-400">{u._count.usages}</td>
                  <td className="px-5 py-3 text-xs">
                    {highRiskOwned > 0 ? (
                      <span className="text-alarm">Attention</span>
                    ) : (
                      <span className="text-steady">Good</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-sm text-ink-400">
                  No people on record yet. They appear automatically once a connector syncs, or add one from Settings.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

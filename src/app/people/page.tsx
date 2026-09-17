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
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">People</h1>
        <p className="text-sm text-ink-400 mt-1.5">
          Everyone connectors have observed using or owning an AI asset.
        </p>
      </div>

      <div className="rounded-md border border-line bg-panel shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400 border-b border-line">
              <th className="px-4 py-3 font-medium">Person</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Owns</th>
              <th className="px-4 py-3 font-medium">Uses</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-black/[0.02]">
                <td className="px-4 py-3">
                  <div className="font-medium text-ink-100">{u.name ?? u.email}</div>
                  <div className="text-xs text-ink-400">{u.email}</div>
                </td>
                <td className="px-4 py-3 text-ink-400">{u.department ?? "—"}</td>
                <td className="px-4 py-3">
                  {u._count.ownedAssets > 0 ? (
                    <Link href="/assets" className="tabular text-ink-100 hover:underline">
                      {u._count.ownedAssets}
                    </Link>
                  ) : (
                    <span className="text-ink-400">0</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular text-ink-400">{u._count.usages}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-sm text-ink-400">
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

import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import { PageHeader, Table } from "@/components/ui";
import ExportMenu from "@/components/ExportMenu";
import Link from "next/link";

export const dynamic = "force-dynamic";


export default async function PeoplePage() {
  const users = await db.user.findMany({
    where: { organizationId: currentOrgId() },
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
      <PageHeader
        title="People"
        subtitle={"Everyone connectors have observed using or owning an AI asset."}
        action={<ExportMenu dataset="people" />}
      />

      <Table columns={["Person", "Department", "Owns", "Uses", "Status"]}>
            {users.map((u) => {
              const highRiskOwned = u.ownedAssets.filter((a) =>
                ["HIGH", "CRITICAL"].includes(a.riskAssessments[0]?.level ?? "")
              ).length;
              return (
                <tr key={u.id} className="hover:bg-ink-100/[0.025]">
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
                    <Badge>{highRiskOwned > 0 ? "ATTENTION" : "GOOD"}</Badge>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-3 text-sm text-ink-400">
                  No people on record yet. They appear automatically once a connector syncs, or add one from Settings.
                </td>
              </tr>
            )}
          </Table>
    </div>
  );
}

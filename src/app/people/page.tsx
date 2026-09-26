import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import { PageHeader, Table } from "@/components/ui";
import ExportMenu from "@/components/ExportMenu";
import FilterBar from "@/components/FilterBar";
import Link from "next/link";

export const dynamic = "force-dynamic";


export default async function PeoplePage({ searchParams }: { searchParams: { q?: string; department?: string } }) {
  const q = searchParams.q?.trim();
  const departments = (await db.user.findMany({ where: { organizationId: currentOrgId(), department: { not: null } }, select: { department: true }, distinct: ["department"] })).map((d) => d.department!).sort();
  const users = await db.user.findMany({
    where: {
      organizationId: currentOrgId(),
      ...(searchParams.department ? { department: searchParams.department } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
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
        subtitle="Everyone angar has seen using or owning an AI."
        action={<ExportMenu dataset="people" />}
      />

      <FilterBar
        search={{ placeholder: "Search people…" }}
        filters={departments.length ? [{ param: "department", label: "Department", options: departments.map((d) => ({ value: d, label: d })) }] : []}
        right={`${users.length} ${users.length === 1 ? "person" : "people"}`}
      />
      <Table columns={["Person", "Department", "Owns", "Uses", "Status"]} empty={users.length === 0 && "Nobody matches — people appear when Microsoft 365, Google Workspace or an Admin key is connected."}>
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

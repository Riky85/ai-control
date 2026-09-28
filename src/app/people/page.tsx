import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import { PageHeader, Table } from "@/components/ui";
import ExportMenu from "@/components/ExportMenu";
import FilterBar from "@/components/FilterBar";
import Link from "next/link";
import PrivacyNotice from "@/components/PrivacyNotice";
import { StatCard, td } from "@/components/ui";
import { groupByDepartment, maskCount, orgPrivacyMode, showsPeople, MIN_GROUP, type PrivacyMode } from "@/lib/privacy";

export const dynamic = "force-dynamic";


export default async function PeoplePage({ searchParams }: { searchParams: { q?: string; department?: string } }) {
  const mode = await orgPrivacyMode(currentOrgId());
  if (!showsPeople(mode)) return <PeopleAggregate mode={mode} />;
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
          </Table>
    </div>
  );
}

const DAY = 86400000;

/**
 * Vista senza nomi (privacy per reparto o solo totali): conteggi per reparto
 * con gruppi di almeno MIN_GROUP persone, oppure solo i totali dell'azienda.
 */
async function PeopleAggregate({ mode }: { mode: PrivacyMode }) {
  const orgId = currentOrgId();
  const since = Date.now() - 30 * DAY;
  const users = await db.user.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      department: true,
      usages: { where: { aiAsset: { deletedAt: null } }, select: { lastSeenAt: true, aiAsset: { select: { name: true } } } },
    },
  });
  const active = (u: (typeof users)[number]) => u.usages.some((x) => x.lastSeenAt && x.lastSeenAt.getTime() >= since);
  const topAi = (list: typeof users) => {
    const count = new Map<string, number>();
    for (const u of list) for (const name of new Set(u.usages.map((x) => x.aiAsset.name))) count.set(name, (count.get(name) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const all = topAi(users);
  const usingAi = users.filter(active).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="People" subtitle={mode === "department" ? "AI use by department — no names." : "AI use across the company — no names."} action={<ExportMenu dataset="people" />} />
      <PrivacyNotice mode={mode} what="People" />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="People known" value={String(users.length)} hint="From company accounts and provider keys" />
        <StatCard label="Using AI" value={maskCount(usingAi)} hint="Active in the last 30 days" tone="accent" />
        <StatCard label="AI tools used" value={String(all.length)} hint="By at least one person" />
      </div>

      {mode === "department" ? (
        <Table columns={["Department", { label: "People", className: "text-right" }, { label: "Using AI (30 days)", className: "text-right" }, "Most used AI"]} empty={users.length === 0 && "Nobody yet — people appear when Microsoft 365, Google Workspace or an Admin key is connected."}>
          {groupByDepartment(users, (u) => u.id, (u) => u.department).map((g) =>
            g.suppressed ? (
              <tr key="suppressed">
                <td className={`${td} text-ink-400`} colSpan={4}>
                  Fewer than {MIN_GROUP} people in total — nothing can be shown by department.
                </td>
              </tr>
            ) : (
              <tr key={g.department}>
                <td className={`${td} font-medium ${g.merged ? "text-ink-400" : "text-ink-100"}`}>{g.department}</td>
                <td className={`${td} text-right tabular text-ink-100`}>{g.people}</td>
                <td className={`${td} text-right tabular text-ink-100`}>{maskCount(g.rows.filter(active).length)}</td>
                <td className={`${td} text-ink-400`}>
                  {topAi(g.rows)
                    .slice(0, 4)
                    .map(([name, n]) => `${name} (${maskCount(n)})`)
                    .join(", ") || "—"}
                </td>
              </tr>
            ),
          )}
        </Table>
      ) : (
        <Table columns={["AI", { label: "People using it", className: "text-right" }]} empty={all.length === 0 && "No AI use recorded yet."}>
          {all.map(([name, n]) => (
            <tr key={name}>
              <td className={`${td} text-ink-100`}>{name}</td>
              <td className={`${td} text-right tabular text-ink-100`}>{maskCount(n)}</td>
            </tr>
          ))}
        </Table>
      )}
      <p className="text-xs text-ink-400">Counts under {MIN_GROUP} are shown as &ldquo;&lt;{MIN_GROUP}&rdquo; so nobody can be singled out.</p>
    </div>
  );
}

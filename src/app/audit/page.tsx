import { fmtDateTime } from "@/lib/format";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { PageHeader, Table, td } from "@/components/ui";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.login_failed": "Failed sign-in",
  "auth.logout": "Signed out",
  "auth.signup": "Account created",
  "connector.connect": "Connected a provider",
  "connector.disconnect": "Disconnected a provider",
  "connector.sync": "Synced a provider",
  "member.invite": "Invited a member",
  "member.role_change": "Changed a member's role",
  "member.remove": "Removed a member",
  "share.create": "Created a shared dashboard",
  "share.revoke": "Revoked a shared dashboard",
  "workspace.create": "Created a workspace",
  "workspace.switch": "Switched workspace",
  "workspace.rename": "Renamed a workspace",
};

export default async function AuditPage({ searchParams }: { searchParams: { q?: string } }) {
  const s = await requireRole("ADMIN", "/");
  const q = searchParams.q?.trim();
  const rows = await db.auditLog.findMany({
    where: {
      organizationId: s.orgId,
      ...(q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { actorEmail: { contains: q, mode: "insensitive" } }, { target: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit log" subtitle="Who did what, when and from where in this workspace. Entries can't be edited or deleted." />
      <form className="flex items-center gap-2">
        <input name="q" defaultValue={q} placeholder="Filter by action, person or target" className="w-80 border border-line rounded-lg px-3 py-2 text-sm text-ink-100 bg-panel placeholder:text-ink-400 focus:outline-none focus:border-ink-400" />
        <button className="btn btn-secondary">Filter</button>
      </form>
      <Table columns={["When", "Who", "What", "Target", "IP"]} empty={rows.length === 0 ? "Nothing recorded yet." : false}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className={`${td} tabular text-ink-400 whitespace-nowrap`}>{fmtDateTime(r.createdAt)}</td>
            <td className={`${td} text-ink-100`}>{r.actorEmail ?? "—"}</td>
            <td className={td}>
              <span className="text-ink-100">{LABEL[r.action] ?? r.action}</span>
              {!LABEL[r.action] && null}
              <span className="block text-xs text-ink-400 font-mono">{r.action}</span>
            </td>
            <td className={`${td} text-ink-400 max-w-[260px] truncate`}>{r.target ?? "—"}</td>
            <td className={`${td} text-ink-400 font-mono text-xs`}>{r.ip ?? "—"}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

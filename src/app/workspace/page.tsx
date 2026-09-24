import { currentOrgId } from "@/lib/org";
import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { PageHeader, Panel, Tabs, Table } from "@/components/ui";
import { planById } from "@/lib/plans";
import CopyField from "@/components/CopyField";
import { inviteMemberAction, setMemberRoleAction, removeMemberAction, createShareLinkAction, revokeShareLinkAction, switchWorkspaceAction, createWorkspaceAction, renameWorkspaceAction } from "@/lib/workspace-actions";
import Badge from "@/components/Badge";

export const dynamic = "force-dynamic";
const input = "border border-line rounded-lg px-3 py-2 text-sm text-ink-100 bg-panel placeholder:text-ink-400 focus:outline-none focus:border-ink-400";
const ROLE_HELP: Record<string, string> = {
  OWNER: "Everything, including billing",
  ADMIN: "Manage connections and members",
  EDITOR: "Edit passports, owners, costs",
  VIEWER: "Read-only",
};

export default async function WorkspacePage({ searchParams }: { searchParams: { tab?: string; error?: string; invited?: string; shared?: string } }) {
  const tab = searchParams.tab === "sharing" ? "sharing" : searchParams.tab === "workspaces" ? "workspaces" : "members";
  const [org, members, links, allWorkspaces] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: currentOrgId() } }),
    db.workspaceMember.findMany({ where: { organizationId: currentOrgId() }, orderBy: [{ role: "asc" }, { invitedAt: "asc" }] }),
    db.shareLink.findMany({ where: { organizationId: currentOrgId() }, orderBy: { createdAt: "desc" } }),
    db.organization.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { aiAssets: true, members: true } } } }),
  ]);
  const plan = planById(org.plan);
  const h = headers();
  const base = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const activeLinks = links.filter((l) => !l.revokedAt && (!l.expiresAt || l.expiresAt > new Date()));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Workspace"
        subtitle={`${org.name} — who can use Angar, and dashboards shared outside it.`}
        action={<Link href="/billing" className="btn btn-secondary">{plan.name} plan</Link>}
      />

      <Tabs
        active={tab}
        items={[
          { key: "members", label: "Members", count: members.length, href: "/workspace?tab=members" },
          { key: "sharing", label: "Shared dashboards", count: activeLinks.length, href: "/workspace?tab=sharing" },
          { key: "workspaces", label: "Workspaces", count: allWorkspaces.length, href: "/workspace?tab=workspaces" },
        ]}
      />

      {searchParams.error && <div className="rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm">{searchParams.error}</div>}
      {searchParams.invited && <div className="rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-100">Member added.</div>}
      {searchParams.shared && <div className="rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-100">Link created — copy it below and send it to whoever needs to see the dashboard.</div>}

      {tab === "workspaces" ? (
        <div className="grid grid-cols-3 gap-4 items-start">
          <Table columns={["Workspace", "AI systems", "Members", "Plan", ""]}>
                {allWorkspaces.map((w) => (
                  <tr key={w.id}>
                    <td className="px-5 py-3">
                      <form action={renameWorkspaceAction} className="flex items-center gap-2">
                        <input type="hidden" name="orgId" value={w.id} />
                        <input name="name" defaultValue={w.name} className={`${input} py-1.5 w-56`} />
                        <button className="btn btn-secondary btn-sm">Rename</button>
                      </form>
                    </td>
                    <td className="px-5 py-3 text-ink-100 tabular">{w._count.aiAssets}</td>
                    <td className="px-5 py-3 text-ink-100 tabular">{w._count.members}</td>
                    <td className="px-5 py-3 text-ink-100">{planById(w.plan).name}</td>
                    <td className="px-5 py-3 text-right">
                      {w.id === org.id ? (
                        <Badge>CURRENT</Badge>
                      ) : (
                        <form action={switchWorkspaceAction}>
                          <input type="hidden" name="orgId" value={w.id} />
                          <button className="btn btn-secondary btn-sm">Open</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
          <Panel
            title="Create a workspace"
            subtitle={`${allWorkspaces.length} of ${plan.limits.workspaces ?? "unlimited"} on the ${plan.name} plan — e.g. one per company, plant or client`}
          >
            {plan.limits.workspaces === null || allWorkspaces.length < plan.limits.workspaces ? (
              <form action={createWorkspaceAction} className="flex flex-col gap-2">
                <input name="name" required placeholder="Workspace name" className={input} />
                <button className="btn btn-primary">Create workspace</button>
              </form>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-ink-400">Your plan's workspace limit is reached.</p>
                <Link href="/billing" className="btn btn-secondary">See plans</Link>
              </div>
            )}
          </Panel>
        </div>
      ) : tab === "members" ? (
        <div className="grid grid-cols-3 gap-4 items-start">
          <Table columns={["Member", "Role", "Status", ""]}>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="h-8 w-8 rounded-full bg-accent-soft text-accent-dark text-xs font-semibold flex items-center justify-center shrink-0">
                          {(m.name ?? m.email).charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium text-ink-100 truncate">{m.name ?? m.email}</span>
                          {m.name && <span className="block text-xs text-ink-400 truncate">{m.email}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <form action={setMemberRoleAction} className="flex items-center gap-2">
                        <input type="hidden" name="memberId" value={m.id} />
                        <select name="role" defaultValue={m.role} className={`${input} py-1.5`}>
                          {Object.keys(ROLE_HELP).map((r) => (
                            <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>
                          ))}
                        </select>
                        <button className="btn btn-secondary btn-sm">Save</button>
                      </form>
                    </td>
                    <td className="px-5 py-3"><Badge>{m.status === "active" ? "ACTIVE" : "INVITED"}</Badge></td>
                    <td className="px-5 py-3 text-right">
                      <form action={removeMemberAction}>
                        <input type="hidden" name="memberId" value={m.id} />
                        <button className="text-sm text-ink-400 hover:text-alarm transition-colors">Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-3 text-sm text-ink-400 text-center">No members yet — invite yourself first as Owner.</td>
                  </tr>
                )}
              </Table>

          <div className="flex flex-col gap-4">
            <Panel title="Invite a member" subtitle={`${members.length} of ${plan.limits.members ?? "unlimited"} on the ${plan.name} plan`}>
              <form action={inviteMemberAction} className="flex flex-col gap-2">
                <input name="email" type="email" required placeholder="Email" className={input} />
                <input name="name" placeholder="Name (optional)" className={input} />
                <select name="role" defaultValue={members.length === 0 ? "OWNER" : "VIEWER"} className={input}>
                  {Object.entries(ROLE_HELP).map(([r, help]) => (
                    <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()} — {help}</option>
                  ))}
                </select>
                <button className="btn btn-primary">Invite</button>
              </form>
            </Panel>
            <p className="text-xs text-ink-400 px-1">
              Invited people sign up with the same email and join this workspace with their role. Invitation emails aren't sent automatically yet — share the sign-up link yourself.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 items-start">
          <div className="col-span-2 flex flex-col gap-3">
            {links.map((l) => {
              const expired = l.expiresAt && l.expiresAt < new Date();
              const live = !l.revokedAt && !expired;
              return (
                <div key={l.id} className={`rounded-xl border border-line bg-panel p-4 flex flex-col gap-3 ${live ? "" : "opacity-60"}`}>
                  <div className="flex items-center gap-3">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-ink-100 truncate">{l.name}</span>
                      <span className="block text-xs text-ink-400">
                        Overview dashboard · {l.viewCount} view{l.viewCount === 1 ? "" : "s"}
                        {l.lastViewedAt && ` · last opened ${l.lastViewedAt.toLocaleDateString()}`} ·{" "}
                        {l.revokedAt ? "Revoked" : expired ? "Expired" : l.expiresAt ? `Expires ${l.expiresAt.toLocaleDateString()}` : "No expiry"}
                      </span>
                    </span>
                    {live && (
                      <form action={revokeShareLinkAction}>
                        <input type="hidden" name="linkId" value={l.id} />
                        <button className="text-sm text-ink-400 hover:text-alarm transition-colors">Revoke</button>
                      </form>
                    )}
                  </div>
                  {live && <CopyField value={`${base}/share/${l.token}`} />}
                </div>
              );
            })}
            {links.length === 0 && (
              <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-ink-400">
                No shared dashboards yet. Create a read-only link to show your AI estate to management, auditors or a client.
              </div>
            )}
          </div>

          <Panel title="Share a dashboard" subtitle={`${activeLinks.length} of ${plan.limits.sharedDashboards ?? "unlimited"} active on the ${plan.name} plan`}>
            <form action={createShareLinkAction} className="flex flex-col gap-2">
              <input name="name" placeholder="Name, e.g. Board — Q3 AI estate" className={input} />
              <select name="expiresInDays" defaultValue="30" className={input}>
                <option value="7">Expires in 7 days</option>
                <option value="30">Expires in 30 days</option>
                <option value="90">Expires in 90 days</option>
                <option value="0">Never expires</option>
              </select>
              <button className="btn btn-primary">Create link</button>
              <p className="text-xs text-ink-400">Anyone with the link sees a read-only snapshot of the Overview. You can revoke it at any time.</p>
            </form>
          </Panel>
        </div>
      )}
    </div>
  );
}

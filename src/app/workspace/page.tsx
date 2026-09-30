import { fmtDate } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { currentSession } from "@/lib/auth";
import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { Notice, PageHeader, Tabs } from "@/components/ui";
import { EmptyRow, Row, Section } from "@/components/SettingsRows";
import { emailEnabled } from "@/lib/mail";
import { planById } from "@/lib/plans";
import CopyField from "@/components/CopyField";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { inviteMemberAction, setMemberRoleAction, removeMemberAction, createShareLinkAction, revokeShareLinkAction, switchWorkspaceAction, createWorkspaceAction, renameWorkspaceAction } from "@/lib/workspace-actions";
import { createMemberResetLinkAction } from "@/lib/auth-actions";
import Badge from "@/components/Badge";

export const dynamic = "force-dynamic";
const input = "field";
const ROLE_HELP: Record<string, string> = {
  OWNER: "Everything, including billing",
  ADMIN: "Manage connections and members",
  EDITOR: "Edit passports, owners, costs",
  VIEWER: "Read-only",
};
const roleLabel = (r: string) => r.charAt(0) + r.slice(1).toLowerCase();

export default async function WorkspacePage({ searchParams }: { searchParams: { tab?: string; invited?: string; shared?: string; inviteLink?: string; emailSent?: string; resetFor?: string; resetLink?: string } }) {
  const tab = searchParams.tab === "sharing" ? "sharing" : searchParams.tab === "workspaces" ? "workspaces" : "members";
  const [org, members, links, allWorkspaces] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: currentOrgId() } }),
    db.workspaceMember.findMany({ where: { organizationId: currentOrgId() }, orderBy: [{ role: "asc" }, { invitedAt: "asc" }] }),
    db.shareLink.findMany({ where: { organizationId: currentOrgId() }, orderBy: { createdAt: "desc" } }),
    // Solo i workspace di cui l'utente è membro: mai quelli di altri clienti.
    db.organization.findMany({ where: { members: { some: { email: currentSession()!.email } } }, orderBy: { createdAt: "asc" }, include: { _count: { select: { aiAssets: true, members: true } } } }),
  ]);
  const plan = planById(org.plan);
  const h = headers();
  const base = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const activeLinks = links.filter((l) => !l.revokedAt && (!l.expiresAt || l.expiresAt > new Date()));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Workspace" subtitle={org.name} />

      <Tabs
        active={tab}
        items={[
          { key: "members", label: "Members", count: members.length, href: "/workspace?tab=members" },
          { key: "sharing", label: "Sharing", count: activeLinks.length, href: "/workspace?tab=sharing" },
          { key: "workspaces", label: "Workspaces", count: allWorkspaces.length, href: "/workspace?tab=workspaces" },
        ]}
      />

      {searchParams.invited && (
        <Notice>
          <div className="flex flex-col gap-2">
            <span>{searchParams.emailSent === "1" ? "Member added — invitation email sent." : "Member added. Send them this sign-up link:"}</span>
            {searchParams.emailSent !== "1" && searchParams.inviteLink && <CopyField value={searchParams.inviteLink} />}
          </div>
        </Notice>
      )}
      {searchParams.resetLink && (
        <Notice>
          <div className="flex flex-col gap-2">
            <span>Password reset link for <b>{searchParams.resetFor}</b> — works once, expires in 1 hour. Send it only to them.</span>
            <CopyField value={searchParams.resetLink} />
          </div>
        </Notice>
      )}
      {searchParams.shared && <Notice tone="success">Link created — copy it below.</Notice>}

      {tab === "members" && (
        <>
          <Section>
            <Row title="Invite" hint={`${members.length} of ${plan.limits.members ?? "unlimited"} on ${plan.name}. ${emailEnabled() ? "They get an email." : "You share the sign-up link."}`}>
              <form action={inviteMemberAction} className="grid grid-cols-1 sm:grid-cols-2 items-center gap-2 w-full max-w-md">
                <input name="email" type="email" required placeholder="Email" aria-label="Email" className={input} />
                <input name="name" placeholder="Name (optional)" aria-label="Name" className={input} />
                <select name="role" defaultValue={members.length === 0 ? "OWNER" : "VIEWER"} aria-label="Role" className={input}>
                  {Object.entries(ROLE_HELP).map(([r, help]) => (
                    <option key={r} value={r}>{roleLabel(r)} — {help}</option>
                  ))}
                </select>
                <button className="btn btn-secondary btn-sm justify-self-start sm:justify-self-end">Invite</button>
              </form>
            </Row>
          </Section>
          <Section title="Members">
            {members.map((m) => (
              <Row
                key={m.id}
                title={
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{m.name ?? m.email}</span>
                    {m.status !== "active" && <Badge>INVITED</Badge>}
                  </span>
                }
                hint={m.name ? <span className="block truncate">{m.email}</span> : undefined}
              >
                <form action={setMemberRoleAction}>
                  <input type="hidden" name="memberId" value={m.id} />
                  <AutoSubmitSelect name="role" defaultValue={m.role} aria-label="Role" className={`${input} py-1.5`}>
                    {Object.keys(ROLE_HELP).map((r) => (
                      <option key={r} value={r}>{roleLabel(r)}</option>
                    ))}
                  </AutoSubmitSelect>
                </form>
                {m.status === "active" && (
                  <form action={createMemberResetLinkAction}>
                    <input type="hidden" name="email" value={m.email} />
                    <button className="btn btn-ghost btn-sm">Reset link</button>
                  </form>
                )}
                <form action={removeMemberAction}>
                  <input type="hidden" name="memberId" value={m.id} />
                  <button className="btn btn-ghost btn-sm">Remove</button>
                </form>
              </Row>
            ))}
            {members.length === 0 && <EmptyRow>No members yet — invite yourself first as Owner.</EmptyRow>}
          </Section>
        </>
      )}

      {tab === "sharing" && (
        <>
          <Section>
            <Row title="Share the Overview" hint={`Read-only link. ${activeLinks.length} of ${plan.limits.sharedDashboards ?? "unlimited"} active on ${plan.name}.`}>
              <form action={createShareLinkAction} className="flex flex-wrap gap-2 w-full max-w-md">
                <input name="name" placeholder="Name, e.g. Board Q3" aria-label="Link name" className={`${input} flex-1 min-w-[10rem]`} />
                <select name="expiresInDays" defaultValue="30" aria-label="Expiry" className={input}>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="0">No expiry</option>
                </select>
                <button className="btn btn-secondary btn-sm">Create link</button>
              </form>
            </Row>
          </Section>
          <Section title="Links">
            {links.map((l) => {
              const expired = l.expiresAt && l.expiresAt < new Date();
              const live = !l.revokedAt && !expired;
              return (
                <div key={l.id} className={live ? "" : "opacity-60"}>
                  <Row
                    title={<span className="block truncate">{l.name}</span>}
                    hint={
                      <>
                        {l.viewCount} view{l.viewCount === 1 ? "" : "s"}
                        {l.lastViewedAt && ` · last ${fmtDate(l.lastViewedAt)}`} ·{" "}
                        {l.revokedAt ? "Revoked" : expired ? "Expired" : l.expiresAt ? `Expires ${fmtDate(l.expiresAt)}` : "No expiry"}
                      </>
                    }
                  >
                    {live && (
                      <>
                        <div className="w-full max-w-md">
                          <CopyField value={`${base}/share/${l.token}`} />
                        </div>
                        <form action={revokeShareLinkAction}>
                          <input type="hidden" name="linkId" value={l.id} />
                          <button className="btn btn-ghost btn-sm">Revoke</button>
                        </form>
                      </>
                    )}
                  </Row>
                </div>
              );
            })}
            {links.length === 0 && <EmptyRow>No shared links yet.</EmptyRow>}
          </Section>
        </>
      )}

      {tab === "workspaces" && (
        <>
          <Section>
            <Row title="New workspace" hint={`${allWorkspaces.length} of ${plan.limits.workspaces ?? "unlimited"} on ${plan.name}. One for each company, plant or client.`}>
              {plan.limits.workspaces === null || allWorkspaces.length < plan.limits.workspaces ? (
                <form action={createWorkspaceAction} className="flex gap-2 w-full max-w-md">
                  <input name="name" required placeholder="Workspace name" aria-label="Workspace name" className={`${input} flex-1 min-w-0`} />
                  <button className="btn btn-secondary btn-sm">Create</button>
                </form>
              ) : (
                <>
                  <span className="text-xs text-ink-400">Limit reached</span>
                  <Link href="/billing" className="btn btn-secondary btn-sm">See plans →</Link>
                </>
              )}
            </Row>
          </Section>
          <Section title="Your workspaces">
            {allWorkspaces.map((w) => (
              <Row
                key={w.id}
                title={
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{w.name}</span>
                    {w.id === org.id && <Badge>CURRENT</Badge>}
                  </span>
                }
                hint={`${w._count.aiAssets} AI · ${w._count.members} member${w._count.members === 1 ? "" : "s"} · ${planById(w.plan).name}`}
              >
                <form action={renameWorkspaceAction} className="flex gap-2 w-full max-w-xs">
                  <input type="hidden" name="orgId" value={w.id} />
                  <input name="name" defaultValue={w.name} required aria-label="Workspace name" className={`${input} py-1.5 flex-1 min-w-0`} />
                  <button className="btn btn-secondary btn-sm">Rename</button>
                </form>
                {w.id !== org.id && (
                  <form action={switchWorkspaceAction}>
                    <input type="hidden" name="orgId" value={w.id} />
                    <button className="btn btn-secondary btn-sm">Open</button>
                  </form>
                )}
              </Row>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { myGroups, entityRows } from "@/lib/groups";
import { createGroupAction, addToGroupAction, removeFromGroupAction, renameGroupAction } from "@/lib/group-actions";
import { switchWorkspaceAction } from "@/lib/workspace-actions";
import { currentMonth, monthLabel, recentMonths } from "@/lib/chargeback";
import { EmptyState, PageHeader, StatCard, Table, Tabs, td } from "@/components/ui";
import { fmtEur } from "@/lib/format";

export const dynamic = "force-dynamic";

// Vista di gruppo (holding): solo le società in cui l'utente è OWNER/ADMIN attivo.
export default async function GroupPage({ searchParams }: { searchParams: { id?: string; error?: string } }) {
  const s = currentSession();
  if (!s) redirect("/login");
  const { orgs, groups } = await myGroups(s.email);
  const group = groups.find((g) => g.id === searchParams.id) ?? groups[0] ?? null;
  const current = orgs.find((o) => o.id === s.orgId);

  if (!group)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Group view" subtitle="All your companies" />
        {/* Stato vuoto standard: una riga e una sola azione. */}
        <EmptyState
          className="animate-rise"
          text={
            current
              ? "No group yet. A group adds up spend, savings and budgets across your companies."
              : "No group yet. You need to be an owner or admin of this workspace to create one."
          }
          action={
            current ? (
              <form action={createGroupAction} className="flex flex-wrap items-center justify-center gap-2">
                <input name="name" required maxLength={100} placeholder="Group name, e.g. Rossi Holding" aria-label="Group name" className="field w-full sm:w-64" />
                <button className="btn btn-primary">Create group with {current.name}</button>
              </form>
            ) : undefined
          }
        />
      </div>
    );

  const rows = await entityRows(group.entities);
  const t = rows.reduce(
    (a, r) => ({ spend: a.spend + r.monthlySpend, save: a.save + r.canSave, saved: a.saved + r.savedMonthly, ai: a.ai + r.aiCount, budget: a.budget + r.budget, budgetSpend: a.budgetSpend + r.budgetSpend }),
    { spend: 0, save: 0, saved: 0, ai: 0, budget: 0, budgetSpend: 0 }
  );
  // Budget sforati e dove si concentra il risparmio: finiscono negli hint delle card.
  const over = rows.filter((r) => r.teamsOver > 0);
  const bestSave = [...rows].sort((a, b) => b.canSave - a.canSave)[0];
  const bestShare = bestSave && t.save ? Math.round((bestSave.canSave / t.save) * 100) : 0;
  const biggest = [...rows].sort((a, b) => b.monthlySpend - a.monthlySpend)[0];
  const biggestShare = biggest && t.spend ? Math.round((biggest.monthlySpend / t.spend) * 100) : 0;
  const addable = orgs.filter((o) => o.groupId !== group.id && !o.groupId);
  const months = recentMonths(12);
  const teamsOver = over.reduce((n, r) => n + r.teamsOver, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={group.name}
        subtitle={`Group view · ${rows.length} compan${rows.length === 1 ? "y" : "ies"} you administer`}
        action={
          <form method="get" action="/api/export/chargeback/group" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={group.id} />
            <select name="month" defaultValue={currentMonth()} className="field py-1.5" aria-label="Month">
              {months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
            <button className="btn btn-secondary btn-sm">Export intercompany CSV</button>
          </form>
        }
      />
      {groups.length > 1 && <Tabs items={groups.map((g) => ({ key: g.id, label: g.name, href: `/group?id=${g.id}` }))} active={group.id} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Group AI spend" value={t.spend ? `${fmtEur(t.spend)}/mo` : "—"} hint={t.spend ? (biggest && rows.length > 1 ? `${biggest.name}: ${biggestShare}%` : `${fmtEur(t.spend * 12)} a year`) : "No costs yet"} />
        <StatCard label="Saved" value={t.saved ? `${fmtEur(t.saved)}/mo` : "—"} hint={t.saved ? `${fmtEur(t.saved * 12)} a year` : "Nothing done yet"} />
        <StatCard label="Could still save" value={t.save ? `${fmtEur(t.save)}/mo` : "—"} hint={t.save ? (bestSave && rows.length > 1 ? `${bestShare}% in ${bestSave.name}` : `${fmtEur(t.save * 12)} a year`) : "Nothing found"} href={t.save && bestSave?.id === s.orgId ? "/opportunities" : undefined} />
        <StatCard
          label="AI in use"
          value={String(t.ai)}
          hint={over.length ? `${teamsOver} team budget${teamsOver === 1 ? "" : "s"} over, in ${over.map((r) => r.name).join(", ")}` : t.budget ? `Budgets: ${fmtEur(t.budgetSpend)} of ${fmtEur(t.budget)}/mo` : "No team budgets set"}
          tone={over.length ? "alarm" : undefined}
          href={over.some((r) => r.id === s.orgId) ? "/budgets" : undefined}
        />
      </div>


      <Table
        title="Companies"
        note="Workspaces you own or administer"
        footer={
          <>
        {addable.length > 0 && (
          <form action={addToGroupAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="groupId" value={group.id} />
            <select name="orgId" className="field py-1.5" aria-label="Workspace to add" required>
              {addable.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <button className="btn btn-secondary btn-sm">Add to group</button>
          </form>
        )}
        <form action={renameGroupAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="groupId" value={group.id} />
          <input name="name" defaultValue={group.name} required maxLength={100} className="field py-1.5 w-52" aria-label="Group name" />
          <button className="btn btn-ghost btn-sm">Rename</button>
        </form>
          </>
        }
        columns={[
          "Company",
          { label: "AI", className: "text-right" },
          { label: "Spend / mo", className: "text-right" },
          { label: "Saved / mo", className: "text-right" },
          { label: "Could save / mo", className: "text-right" },
          { label: "Budgets vs actual", className: "w-[22%]" },
          { label: "", className: "w-[170px]" },
        ]}
      >
        {rows.map((r) => {
          const pct = r.budget ? (r.budgetSpend / r.budget) * 100 : null;
          const bar = pct == null ? "bg-ink-400/40" : pct > 100 ? "bg-alarm" : pct >= 80 ? "bg-accent" : "bg-ink-100/70";
          return (
            <tr key={r.id}>
              <td className={td}>
                <div className="font-medium text-ink-100">{r.name}</div>
                <div className="text-xs text-ink-400">{r.id === s.orgId ? "Current workspace" : r.country ?? ""}</div>
              </td>
              <td className={`${td} text-right tabular text-ink-100`}>{r.aiCount}</td>
              <td className={`${td} text-right tabular text-ink-100`}>{r.monthlySpend ? fmtEur(r.monthlySpend) : "—"}</td>
              <td className={`${td} text-right tabular text-ink-100`}>{r.savedMonthly ? fmtEur(r.savedMonthly) : "—"}</td>
              <td className={`${td} text-right tabular text-ink-100`}>{r.canSave ? fmtEur(r.canSave) : "—"}</td>
              <td className={td}>
                {r.budget ? (
                  <>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="tabular text-ink-100">{fmtEur(r.budgetSpend)} of {fmtEur(r.budget)}</span>
                      {r.teamsOver > 0 && <span className="font-mono uppercase text-[10px] tracking-[0.05em] text-alarm">{r.teamsOver} over</span>}
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-ink-100/[0.08]">
                      <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, pct!)}%` }} />
                    </div>
                  </>
                ) : (
                  <span className="eyebrow">No budgets</span>
                )}
              </td>
              <td className={`${td} text-right`}>
                <div className="flex items-center justify-end gap-1">
                  {r.id !== s.orgId && (
                    <form action={switchWorkspaceAction}>
                      <input type="hidden" name="orgId" value={r.id} />
                      <button className="btn btn-secondary btn-sm">Open</button>
                    </form>
                  )}
                  <form action={removeFromGroupAction}>
                    <input type="hidden" name="groupId" value={group.id} />
                    <input type="hidden" name="orgId" value={r.id} />
                    <button className="btn btn-ghost btn-sm btn-icon" title={`Remove ${r.name} from the group`} aria-label={`Remove ${r.name} from the group`}>✕</button>
                  </form>
                </div>
              </td>
            </tr>
          );
        })}
      </Table>

    </div>
  );
}

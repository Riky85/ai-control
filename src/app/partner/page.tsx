import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { partnerClients } from "@/lib/partner";
import { planById } from "@/lib/plans";
import { fmtEur } from "@/lib/format";
import { switchWorkspaceAction, createWorkspaceAction } from "@/lib/workspace-actions";
import { Notice, PageHeader, StatCard, Table, td } from "@/components/ui";
import Badge from "@/components/Badge";

export const dynamic = "force-dynamic";

// Console partner: tutti i workspace cliente dell'utente (solo quelli di cui è membro).
export default async function PartnerPage({ searchParams }: { searchParams: { error?: string } }) {
  const s = currentSession();
  if (!s) redirect("/login");
  const clients = await partnerClients(s.email, s.orgId);
  const totals = clients.reduce(
    (t, c) => ({ spend: t.spend + c.monthlySpend, save: t.save + c.canSave, review: t.review + c.toReview }),
    { spend: 0, save: 0, review: 0 }
  );
  const onlyOwn = clients.length <= 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Partner console"
        subtitle="All your client workspaces in one place"
        action={
          <form action={createWorkspaceAction} className="flex items-center gap-2">
            <input name="name" required placeholder="Client company name" aria-label="Client company name" className="field py-1.5 w-52" />
            <button className="btn btn-primary">New client workspace</button>
          </form>
        }
      />
      {searchParams.error && <Notice tone="error">{searchParams.error}</Notice>}

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Clients" value={String(clients.length)} hint={onlyOwn ? "Add your first client workspace" : "Workspaces you're a member of"} tone="accent" />
        <StatCard label="Total AI spend" value={totals.spend ? `${fmtEur(totals.spend)}/mo` : "—"} hint={totals.spend ? `${fmtEur(totals.spend * 12)} a year` : "No costs yet"} />
        <StatCard label="Total possible savings" value={totals.save ? `${fmtEur(totals.save)}/mo` : "—"} hint={totals.save ? `${fmtEur(totals.save * 12)} a year across clients` : "Nothing found yet"} />
        <StatCard label="Items to review" value={String(totals.review)} hint={totals.review ? "AI found by scans, not yet decided" : "All clear"} tone={totals.review ? "signal" : undefined} />
      </div>

      {onlyOwn && (
        <div className="rounded-xl border border-dashed border-line bg-panel p-8 flex flex-col gap-3 animate-rise">
          <h2 className="text-base font-semibold text-ink-100">Manage AI spend for all your clients</h2>
          <p className="text-sm text-ink-400 max-w-2xl">
            Accountants, consultants and MSPs use angar to look after AI spend for many client companies at once. Create one workspace per client, drop their bank
            statement or invite them, and this console shows every client side by side — spend, possible savings, AI to review and alerts — sorted by where you can save
            the most.
          </p>
          <ol className="text-sm text-ink-100 list-decimal pl-5 flex flex-col gap-1">
            <li>Create a client workspace with the button above.</li>
            <li>Add their costs (bank statement, invoices or a connected bank) from Sources.</li>
            <li>Invite the client from Workspace → Members, if they should see it too.</li>
          </ol>
          <p className="text-xs text-ink-400">Each workspace stays separate: clients never see each other, and you only see workspaces you&apos;re a member of.</p>
        </div>
      )}

      <Table
        columns={[
          "Client",
          "Plan",
          { label: "AI", className: "text-right" },
          { label: "AI spend", className: "text-right" },
          { label: "Possible savings", className: "text-right" },
          { label: "To review", className: "text-right" },
          { label: "Computers online", className: "text-right" },
          { label: "Unread alerts", className: "text-right" },
          "",
        ]}
      >
        {clients.map((c) => (
          <tr key={c.id}>
            <td className={td}>
              <span className="flex items-center gap-2">
                <span className="font-medium text-ink-100">{c.name}</span>
                {c.current && <Badge>CURRENT</Badge>}
              </span>
              <span className="block text-xs text-ink-400">{c.role.charAt(0) + c.role.slice(1).toLowerCase()}</span>
            </td>
            <td className={`${td} text-ink-400`}>{planById(c.plan as Parameters<typeof planById>[0]).name}</td>
            <td className={`${td} text-right tabular text-ink-100`}>{c.aiCount}</td>
            <td className={`${td} text-right tabular text-ink-100`}>{c.monthlySpend ? `${fmtEur(c.monthlySpend)}/mo` : "—"}</td>
            <td className={`${td} text-right tabular ${c.canSave ? "text-accent font-medium" : "text-ink-400"}`}>{c.canSave ? `${fmtEur(c.canSave)}/mo` : "—"}</td>
            <td className={`${td} text-right tabular ${c.toReview ? "text-signal" : "text-ink-400"}`}>{c.toReview}</td>
            <td className={`${td} text-right tabular text-ink-100`}>
              <span className="inline-flex items-center gap-1.5">
                {c.computersOnline > 0 && <span className="h-2 w-2 rounded-full bg-steady" />}
                {c.computersOnline}
              </span>
            </td>
            <td className={`${td} text-right tabular ${c.unreadAlerts ? "text-alarm" : "text-ink-400"}`}>{c.unreadAlerts}</td>
            <td className={`${td} text-right`}>
              <form action={switchWorkspaceAction}>
                <input type="hidden" name="orgId" value={c.id} />
                <button className="btn btn-secondary btn-sm">Open</button>
              </form>
            </td>
          </tr>
        ))}
      </Table>
      <p className="text-xs text-ink-400">Sorted by possible savings. Computers count as online if the desktop app checked in within the last 70 minutes.</p>
    </div>
  );
}

import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import { departmentSpend, UNASSIGNED } from "@/lib/budgets";
import { setBudgetAction, deleteBudgetAction } from "@/lib/budget-actions";
import { PageHeader, StatCard, Table, td, Notice } from "@/components/ui";
import { fmtEur } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BudgetsPage({ searchParams }: { searchParams: { error?: string } }) {
  const orgId = currentOrgId();
  const [spend, budgets, userDepts] = await Promise.all([
    departmentSpend(orgId),
    db.budget.findMany({ where: { organizationId: orgId } }),
    db.user.findMany({ where: { organizationId: orgId, department: { not: null } }, select: { department: true }, distinct: ["department"] }),
  ]);

  // Reparti: da spesa + budget esistenti + reparti delle persone (senza doppioni, ignorando maiuscole).
  const names = new Map<string, string>();
  const add = (d: string | null | undefined) => {
    const t = d?.trim();
    if (t && !names.has(t.toLowerCase())) names.set(t.toLowerCase(), t);
  };
  spend.forEach((s) => add(s.department));
  budgets.forEach((b) => add(b.department));
  userDepts.forEach((u) => add(u.department));

  const rows = Array.from(names.values())
    .map((department) => {
      const s = spend.find((x) => x.department.toLowerCase() === department.toLowerCase());
      const b = budgets.find((x) => x.department.toLowerCase() === department.toLowerCase());
      const eur = s?.monthlyEur ?? 0;
      return { department, eur, budget: b?.monthlyEur ?? null, budgetDept: b?.department ?? department, people: s?.people ?? 0, aiCount: s?.aiCount ?? 0, topAi: s?.topAi ?? [] };
    })
    .sort((a, b) => (a.department === UNASSIGNED ? 1 : 0) - (b.department === UNASSIGNED ? 1 : 0) || b.eur - a.eur || a.department.localeCompare(b.department));

  const named = rows.filter((r) => r.department !== UNASSIGNED);
  const totalBudget = budgets.reduce((s, b) => s + b.monthlyEur, 0);
  const totalSpend = spend.reduce((s, r) => s + r.monthlyEur, 0);
  const over = rows.filter((r) => r.budget && r.eur > r.budget).length;
  const month = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", month: "long" }).format(new Date());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Budgets" subtitle="Monthly AI budget per team — angar warns you at 80% and 100%." />

      {searchParams.error && <Notice tone="error">{searchParams.error}</Notice>}

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total budget" value={`${fmtEur(totalBudget)}/mo`} hint={budgets.length ? `${budgets.length} team${budgets.length === 1 ? "" : "s"} with a budget` : "No budgets set yet"} />
        <StatCard label={`Spend in ${month}`} value={`${fmtEur(totalSpend)}/mo`} hint={totalBudget ? `${Math.round((totalSpend / totalBudget) * 100)}% of the total budget` : "Split by who uses each AI"} tone="accent" />
        <StatCard label="Teams over budget" value={String(over)} hint={over ? "angar has sent an alert" : "All within budget"} tone={over ? "alarm" : undefined} />
      </div>

      {named.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center">
          <h2 className="text-lg font-semibold text-ink-100">No teams yet</h2>
          <p className="text-sm text-ink-400 mt-1 max-w-lg mx-auto">
            Teams come from each person&apos;s department in Microsoft 365 or Google Workspace. You can also set the department on each person — angar then splits every AI&apos;s cost by the people who use it.
          </p>
          <div className="flex items-center justify-center gap-2 mt-5">
            <Link href="/people" className="btn btn-primary">Set departments on people</Link>
            <Link href="/sources" className="btn btn-secondary">Connect Microsoft 365 or Google</Link>
          </div>
          {rows.length > 0 && <p className="text-xs text-ink-400 mt-4">{fmtEur(totalSpend)}/mo of AI spend is not assigned to a team yet.</p>}
        </div>
      ) : (
        <Table columns={["Team", { label: "Spend vs budget", className: "w-[30%]" }, "Top AI", { label: "People", className: "text-right" }, { label: "Monthly budget", className: "w-[260px]" }]}>
          {rows.map((r) => {
            const pct = r.budget ? (r.eur / r.budget) * 100 : null;
            const bar = pct == null ? "bg-ink-400/40" : pct > 100 ? "bg-alarm" : pct >= 80 ? "bg-signal" : "bg-steady";
            const text = pct == null ? "text-ink-400" : pct > 100 ? "text-alarm" : pct >= 80 ? "text-signal" : "text-steady";
            return (
              <tr key={r.department}>
                <td className={td}>
                  <div className="font-medium text-ink-100">{r.department}</div>
                  <div className="text-xs text-ink-400">{r.aiCount} AI</div>
                </td>
                <td className={td}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-ink-100 tabular">{fmtEur(r.eur)}</span>
                    <span className={`text-xs tabular ${text}`}>{r.budget ? `${Math.round(pct!)}% of ${fmtEur(r.budget)}` : "No budget"}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-100/[0.06]">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct == null ? 0 : Math.min(100, pct)}%` }} />
                  </div>
                </td>
                <td className={`${td} text-ink-400`}>
                  {r.topAi.length ? r.topAi.map((a) => `${a.name} (${fmtEur(a.eur)})`).join(", ") : "—"}
                </td>
                <td className={`${td} text-right tabular text-ink-100`}>{r.people || "—"}</td>
                <td className={td}>
                  {r.department === UNASSIGNED ? (
                    <Link href="/people" className="text-xs text-ink-400 underline hover:text-ink-100">Assign people to teams</Link>
                  ) : (
                    <div className="flex items-center gap-2">
                      <form action={setBudgetAction} className="flex items-center gap-2">
                        <input type="hidden" name="department" value={r.budgetDept} />
                        <input name="monthlyEur" inputMode="decimal" defaultValue={r.budget ?? ""} placeholder="€ / month" className="field w-28 tabular" aria-label={`Monthly budget for ${r.department}`} />
                        <button className="btn btn-secondary btn-sm">{r.budget ? "Update" : "Set"}</button>
                      </form>
                      {r.budget != null && (
                        <form action={deleteBudgetAction}>
                          <input type="hidden" name="department" value={r.budgetDept} />
                          <button className="btn btn-ghost btn-sm" title="Remove budget" aria-label={`Remove budget for ${r.department}`}>✕</button>
                        </form>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      <section className="rounded-xl border border-line bg-panel p-5">
        <h2 className="text-base font-semibold text-ink-100">Add a team budget</h2>
        <p className="text-sm text-ink-400 mt-0.5 mb-4">Use the same name as the department in your directory. Leave the amount empty or 0 to remove a budget.</p>
        <form action={setBudgetAction} className="flex flex-wrap items-center gap-2">
          <input name="department" placeholder="Team, e.g. Marketing" className="field w-56" list="budget-depts" required />
          <datalist id="budget-depts">
            {named.map((r) => (
              <option key={r.department} value={r.department} />
            ))}
          </datalist>
          <input name="monthlyEur" inputMode="decimal" placeholder="€ / month" className="field w-32 tabular" required />
          <button className="btn btn-primary btn-sm">Save budget</button>
        </form>
      </section>

      <p className="text-xs text-ink-400">
        Each AI&apos;s monthly cost is split across teams by how many of its known users are in each team. AI with no known users go to the team set on the AI, otherwise to Unassigned. Alerts go to the bell and, if connected, to Slack or Teams.
      </p>
    </div>
  );
}

import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import { departmentSpend, UNASSIGNED } from "@/lib/budgets";
import { setBudgetAction, deleteBudgetAction } from "@/lib/budget-actions";
import { PageHeader, StatCard, Table, Tabs, td, Notice } from "@/components/ui";
import Chargeback from "./Chargeback";
import TeamValue from "./TeamValue";
import { fmtEur } from "@/lib/format";
import { maskCount, orgPrivacyMode, showsPeople } from "@/lib/privacy";

export const dynamic = "force-dynamic";

const VIEW_TABS = [
  { key: "budgets", label: "Budgets", href: "/budgets" },
  { key: "chargeback", label: "Chargeback", href: "/budgets?view=chargeback" },
];

export default async function BudgetsPage({ searchParams }: { searchParams: { error?: string; view?: string; month?: string; saved?: string } }) {
  const orgId = currentOrgId();
  if (searchParams.view === "chargeback")
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Budgets" />
        <Tabs items={VIEW_TABS} active="chargeback" />
        {searchParams.error && <Notice tone="error">{searchParams.error}</Notice>}
        {searchParams.saved && <Notice tone="success">Accounts saved.</Notice>}
        <Chargeback orgId={orgId} month={searchParams.month} />
      </div>
    );
  // Privacy per reparto / solo totali: i gruppi sotto le 5 persone mostrano "<5".
  const people = showsPeople(await orgPrivacyMode(orgId));
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
    <div className="flex flex-col gap-4">
      <PageHeader title="Budgets" />
      <Tabs items={VIEW_TABS} active="budgets" />

      {searchParams.error && <Notice tone="error">{searchParams.error}</Notice>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total budget" value={`${fmtEur(totalBudget)}/mo`} hint={budgets.length ? `${budgets.length} team${budgets.length === 1 ? "" : "s"}` : undefined} />
        <StatCard label={`Spend in ${month}`} value={`${fmtEur(totalSpend)}/mo`} hint={totalBudget ? `${Math.round((totalSpend / totalBudget) * 100)}% of budget` : undefined} />
        <StatCard label="Teams over budget" value={String(over)} hint={over ? "Alert sent" : undefined} tone={over ? "alarm" : undefined} />
      </div>

      <TeamValue orgId={orgId} />

      {named.length === 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-line bg-panel p-5">
            <h2 className="text-sm font-bold text-ink-100">No teams yet</h2>
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <Link href="/people" className="btn btn-primary btn-sm">Set departments</Link>
              <Link href="/sources" className="btn btn-ghost btn-sm">Connect a directory</Link>
            </div>
          </div>
          <AddBudget named={named.map((r) => r.department)} secondary />
        </div>
      ) : (
        <Table
          columns={["Team", { label: "Spend", className: "w-[30%]" }, "Top AI", { label: "People", className: "text-right" }, { label: "Budget", className: "w-[260px]" }]}
        >
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
                <td className={`${td} text-right tabular text-ink-100`}>{r.people ? (people ? r.people : maskCount(r.people)) : "—"}</td>
                <td className={td}>
                  {r.department === UNASSIGNED ? (
                    <Link href="/people" className="text-xs text-ink-400 underline hover:text-ink-100">Assign people</Link>
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

      {named.length > 0 && <AddBudget named={named.map((r) => r.department)} />}
    </div>
  );
}

// Senza team il passo principale è assegnare i reparti: qui il pulsante resta secondario.
function AddBudget({ named, secondary = false }: { named: string[]; secondary?: boolean }) {
  return (
    <section className="rounded-xl border border-line bg-panel animate-rise">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-ink border-b border-line rounded-t-xl px-5 py-3 bar-head">
        <h2 className="text-sm font-bold text-ink-100" title="Same name as the department in your directory. Empty or 0 removes it.">Add a budget</h2>
      </div>
      <form action={setBudgetAction} className="p-5 flex flex-wrap items-center gap-2">
        <input name="department" placeholder="Team, e.g. Marketing" className="field w-48" list="budget-depts" required />
        <datalist id="budget-depts">
          {named.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        <input name="monthlyEur" inputMode="decimal" placeholder="€ / month" className="field w-28 tabular" required />
        <button className={`btn btn-sm ${secondary ? "btn-secondary" : "btn-primary"}`}>Save</button>
      </form>
    </section>
  );
}

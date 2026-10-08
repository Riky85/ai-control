import Link from "next/link";
import { db } from "@/lib/db";
import { computeChargeback, currentMonth, monthLabel, recentMonths, METHOD_LABEL } from "@/lib/chargeback";
import { setAccountingSettingsAction, setCostCenterAction } from "@/lib/chargeback-actions";
import { StatCard, Table, td } from "@/components/ui";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { fmtEur } from "@/lib/format";
import { maskCount, orgPrivacyMode, showsDepartments, showsPeople } from "@/lib/privacy";


/** Scheda Chargeback di /budgets: costo AI del mese per reparto e centro di costo, con export contabili. */
export default async function Chargeback({ orgId, month: asked }: { orgId: string; month?: string }) {
  const months = recentMonths(12);
  const month = asked && months.includes(asked) ? asked : currentMonth();
  const [cb, settings, mode] = await Promise.all([
    computeChargeback(orgId, month),
    db.accountingSettings.findUnique({ where: { organizationId: orgId } }),
    orgPrivacyMode(orgId),
  ]);
  if (!cb) return null;
  const people = (n: number) => (!showsDepartments(mode) ? "—" : showsPeople(mode) ? String(n) : maskCount(n));
  const missingCodes = cb.rows.filter((r) => !r.costCenter).length;
  const exportHref = (format: string) => `/api/export/chargeback?month=${month}&format=${format}`;
  const accountsSet = !!settings?.expenseAccount;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form method="get" action="/budgets" className="flex items-center gap-2">
          <input type="hidden" name="view" value="chargeback" />
          <AutoSubmitSelect name="month" defaultValue={month} className="field py-1.5" aria-label="Month">
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
                {m === currentMonth() ? " (so far)" : ""}
              </option>
            ))}
          </AutoSubmitSelect>
          <noscript>
            <button className="btn btn-secondary btn-sm">Show</button>
          </noscript>
        </form>
        <details className="relative print:hidden">
          <summary className="btn btn-secondary list-none cursor-pointer [&::-webkit-details-marker]:hidden">Export</summary>
          <div className="absolute right-0 mt-1.5 w-64 z-30 rounded-xl border border-line bg-panel shadow-lg p-1.5 text-sm">
            <ExportLink href={exportHref("xlsx")} tag="XLS" title="Excel" hint="By cost centre and by AI" />
            <ExportLink href={exportHref("csv")} tag="CSV" title="CSV" hint="One row for each team and AI" />
            <ExportLink href={exportHref("datev")} tag="DAT" title="DATEV (EXTF)" hint={accountsSet ? "Buchungsstapel with KOST1" : "Set the accounts below first"} />
            <ExportLink href={exportHref("teamsystem")} tag="TS" title="TeamSystem" hint="Prima nota CSV with centro di costo" />
          </div>
        </details>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={`AI cost in ${monthLabel(month)}`}
          value={fmtEur(cb.totalEur)}
          hint={cb.runRateEur > 0 ? `${fmtEur(cb.actualEur)} from charges` : cb.totalEur ? "Real charges" : undefined}
        />
        <StatCard label="Charged to teams" value={fmtEur(cb.allocatedEur)} hint={cb.totalEur ? `${Math.round((cb.allocatedEur / cb.totalEur) * 100)}% · ${cb.rows.length} team${cb.rows.length === 1 ? "" : "s"}` : undefined} />
        <StatCard label="Unallocated" value={fmtEur(cb.unallocatedEur)} hint={undefined} tone={cb.unallocatedEur > 0 ? "signal" : undefined} />
      </div>

      <Table
        columns={["Team", { label: "Cost centre", className: "w-[340px]" }, "Pays for", { label: "People", className: "text-right" }, { label: "Amount", className: "text-right" }]}
        empty={cb.rows.length === 0 ? "Nothing to charge this month." : false}
      >
        {cb.rows.map((r) => (
          <tr key={r.department}>
            <td className={`${td} font-medium text-ink-100`}>{r.department}</td>
            <td className={td}>
              <form action={setCostCenterAction} className="flex items-center gap-2">
                <input type="hidden" name="department" value={r.department} />
                <input type="hidden" name="month" value={month} />
                <input name="code" defaultValue={r.costCenter?.code ?? ""} placeholder="Code" className="field w-24 py-1.5 tabular" aria-label={`Cost centre code for ${r.department}`} maxLength={36} />
                <input name="name" defaultValue={r.costCenter?.name ?? ""} placeholder="Name (optional)" className="field w-32 py-1.5" aria-label={`Cost centre name for ${r.department}`} maxLength={100} />
                <button className="btn btn-ghost btn-sm">Save</button>
              </form>
            </td>
            <td className={`${td} text-ink-400`}>
              {r.lines.slice(0, 3).map((l) => (
                <div key={l.assetId ?? l.name} className="flex justify-between gap-3 text-xs">
                  <span className="truncate" title={METHOD_LABEL[l.method]}>
                    {l.name} <span className="text-ink-400/70">· {l.method === "seats" ? "seats" : l.method === "users" ? "active users" : "set on AI"}</span>
                  </span>
                  <span className="tabular shrink-0">{fmtEur(l.eur)}</span>
                </div>
              ))}
              {r.lines.length > 3 && <div className="text-xs">+{r.lines.length - 3} more</div>}
            </td>
            <td className={`${td} text-right tabular text-ink-100`}>{r.people ? people(r.people) : "—"}</td>
            <td className={`${td} text-right tabular text-ink-100`}>{fmtEur(r.eur)}</td>
          </tr>
        ))}
      </Table>

      {cb.unallocated.length > 0 && (
        <Table columns={["Unallocated", "Why", { label: "Amount", className: "text-right" }]}>
          {cb.unallocated.map((u, i) => (
            <tr key={i}>
              <td className={`${td} text-ink-100`}>{u.assetId ? <Link href={`/assets/${u.assetId}`} className="hover:underline">{u.name}</Link> : u.name}</td>
              <td className={`${td} text-ink-400`}>
                {u.reason}
                {u.reason === "People without a department" && (
                  <Link href="/people" className="ml-2 text-xs underline hover:text-ink-100">Set departments</Link>
                )}
              </td>
              <td className={`${td} text-right tabular text-ink-100`}>{fmtEur(u.eur)}</td>
            </tr>
          ))}
        </Table>
      )}

      <details className="rounded-xl border border-line bg-panel overflow-hidden group">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 bg-ink px-5 py-3 group-open:border-b group-open:border-line [&::-webkit-details-marker]:hidden bar-head">
          <span>
            <span className="text-sm font-bold text-ink-100">Accounting accounts</span>
            {accountsSet && (
              <span className="block text-xs text-ink-400 mt-0.5">
                Expense {settings!.expenseAccount}
                {settings?.clearingAccount ? ` · clearing ${settings.clearingAccount}` : ""}
              </span>
            )}
          </span>
          <span className="eyebrow group-open:hidden">Edit</span>
        </summary>
        <form action={setAccountingSettingsAction} className="p-5 flex flex-wrap items-end gap-3">
          <input type="hidden" name="month" value={month} />
          <Field name="expenseAccount" label="Expense account" placeholder="e.g. 4964" value={settings?.expenseAccount} />
          <Field name="clearingAccount" label="Clearing account" placeholder="e.g. 1590" value={settings?.clearingAccount} />
          <Field name="datevConsultant" label="DATEV consultant no." placeholder="Beraternummer" value={settings?.datevConsultant} />
          <Field name="datevClient" label="DATEV client no." placeholder="Mandantennummer" value={settings?.datevClient} />
          <button className="btn btn-secondary btn-sm">Save accounts</button>
        </form>
      </details>

      {missingCodes > 0 && <p className="text-xs text-ink-400">{missingCodes} team{missingCodes === 1 ? "" : "s"} without a cost centre code.</p>}
    </div>
  );
}

function ExportLink({ href, tag, title, hint }: { href: string; tag: string; title: string; hint: string }) {
  return (
    <a href={href} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-ink-100 hover:bg-ink-100/[0.04] transition-colors">
      <span className="h-6 w-7 rounded-[2px] bg-ink text-ink-100 border border-line font-mono uppercase text-[10px] tracking-[0.05em] flex items-center justify-center shrink-0">{tag}</span>
      <span>
        <span className="block">{title}</span>
        <span className="block text-xs text-ink-400">{hint}</span>
      </span>
    </a>
  );
}

function Field({ name, label, placeholder, value }: { name: string; label: string; placeholder: string; value?: string | null }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-400">
      {label}
      <input name={name} defaultValue={value ?? ""} placeholder={placeholder} className="field w-40 tabular" maxLength={20} inputMode="numeric" />
    </label>
  );
}

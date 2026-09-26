import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { currentSession } from "@/lib/auth";
import { buildReport } from "@/lib/report";
import { PageHeader, StatCard, Panel } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import { sendReportNowAction } from "@/lib/spend-actions";
import { emailEnabled } from "@/lib/mail";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

// Il report mensile, anche da stampare o salvare come PDF.
export default async function ReportPage({ searchParams }: { searchParams: { sent?: string; error?: string } }) {
  const r = await buildReport(currentOrgId());
  const me = currentSession();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`AI report — ${r.month}`}
        subtitle={`${r.org?.name ?? ""} · sent every month to owners and admins${emailEnabled() ? "" : " once email is set up"}.`}
        action={
          <div className="flex items-center gap-2">
            <form action={sendReportNowAction}>
              <button className="btn btn-secondary">Email it to me</button>
            </form>
            <PrintButton />
          </div>
        }
      />
      {searchParams.sent && <div className="rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-100">Sent to {me?.email}.</div>}
      {searchParams.error && <div className="rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm">{searchParams.error}</div>}

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="AI in use" value={String(r.assets.length)} tone="accent" />
        <StatCard label="Monthly spend" value={r.spend ? fmtEur(r.spend) : "—"} hint={r.spend ? `${fmtEur(r.spend * 12)} a year` : undefined} />
        <StatCard label="You could save" value={r.canSave ? `${fmtEur(r.canSave)}/mo` : "—"} hint={r.canSave ? `${fmtEur(r.canSave * 12)} a year` : undefined} />
      </div>

      <div className="grid grid-cols-2 gap-4 items-start">
        <Panel title="Biggest costs">
          <div className="divide-y divide-line -mx-5 border-t border-line">
            {r.costed.slice(0, 8).map((x) => (
              <div key={x.a.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="text-ink-100">{x.a.name}</span>
                <span className="tabular text-ink-100">{x.m!.estimated ? "≈ " : ""}{fmtEur(x.m!.eur)}</span>
              </div>
            ))}
            {r.costed.length === 0 && <p className="px-5 py-3 text-sm text-ink-400">No costs yet.</p>}
          </div>
        </Panel>
        <Panel title="Top savings">
          <div className="divide-y divide-line -mx-5 border-t border-line">
            {r.savings.slice(0, 6).map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
                <span className="text-ink-100">{s.title}</span>
                <span className="tabular text-ink-100 shrink-0">{fmtEur(s.monthlyEur)}/mo</span>
              </div>
            ))}
            {r.savings.length === 0 && <p className="px-5 py-3 text-sm text-ink-400">Nothing to save right now.</p>}
          </div>
        </Panel>
      </div>
      <Panel title="What changed this month">
        <ul className="flex flex-col gap-2 text-sm">
          {r.events.map((e, i) => (
            <li key={i} className="text-ink-100">
              {e.title} <span className="text-ink-400">— {e.detail}</span>
            </li>
          ))}
          {r.events.length === 0 && <li className="text-ink-400">Nothing new.</li>}
        </ul>
      </Panel>
      <p className="text-xs text-ink-400 print:hidden">
        <Link href="/savings" className="underline">Open Savings</Link> for details and actions.
      </p>
    </div>
  );
}


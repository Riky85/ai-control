import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { currentSession } from "@/lib/auth";
import { buildReport } from "@/lib/report";
import { Notice, PageHeader, StatCard, Panel } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import { sendReportNowAction } from "@/lib/spend-actions";
import { emailEnabled } from "@/lib/mail";
import PrintButton from "@/components/PrintButton";
import BenchmarkCard from "@/components/BenchmarkCard";
import ForecastCard, { loadForecastCard } from "@/components/engine/ForecastCard";
import { monthLabel } from "@/lib/engine/forecast";
import { EmptyState, Insight, pctChange, trendWord } from "@/components/insight";

export const dynamic = "force-dynamic";

// Il report mensile, anche da stampare o salvare come PDF.
export default async function ReportPage({ searchParams }: { searchParams: { sent?: string; error?: string } }) {
  const orgId = currentOrgId();
  const r = await buildReport(orgId);
  const me = currentSession();
  const forecast = r.spend > 0 ? await loadForecastCard(orgId) : null;
  // Una frase utile: variazione dell'ultimo mese chiuso, altrimenti il peso della voce più cara.
  const h = forecast?.history ?? [];
  const lastM = h[h.length - 1];
  const prevM = h[h.length - 2];
  const mom = lastM && prevM ? pctChange(lastM.eur, prevM.eur) : null;
  const topCost = r.costed[0];
  const topShare = topCost && r.spend ? Math.round((topCost.m!.eur / r.spend) * 100) : 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`AI report — ${r.month}`}
        subtitle={r.org?.name ?? undefined}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <form action={sendReportNowAction}>
              <button className="btn btn-ghost" title={`Sent every month to owners and admins${emailEnabled() ? "" : " once email is set up"}`}>Email it to me</button>
            </form>
            <PrintButton />
            <Link href="/report/board" className={`btn ${r.assets.length ? "btn-primary" : "btn-secondary"}`} title="Quarterly board report: angar Score, 12-month forecast, verified savings and top risks — ready to print as PDF">Board report</Link>
          </div>
        }
      />
      {searchParams.sent && <Notice tone="success">Sent to {me?.email}.</Notice>}

      {r.assets.length === 0 && (
        <div className="print:hidden">
          <EmptyState title="Nothing to report yet" text="Drop a bank statement or invoices — the report fills in from your AI costs." href="/sources" cta="Add costs" />
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard href="/estate" label="AI in use" value={String(r.assets.length)} />
        <StatCard href="/estate?paid=yes" label="Monthly spend" value={r.spend ? fmtEur(r.spend) : "—"} hint={r.spend ? `${fmtEur(r.spend * 12)} a year` : undefined} />
        <StatCard href="/opportunities" label="You could save" value={r.canSave ? `${fmtEur(r.canSave)}/mo` : "—"} hint={r.canSave ? `${fmtEur(r.canSave * 12)} a year` : undefined} />
        <StatCard href="/opportunities?view=progress" label="Saved so far" value={r.saved.monthly >= 1 ? `${fmtEur(r.saved.monthly)}/mo` : "—"} hint={r.saved.verified >= 1 ? `${fmtEur(r.saved.verified)}/mo confirmed` : r.saved.monthly >= 1 ? `${fmtEur(r.saved.monthly * 12)} a year` : undefined} />
      </div>

      {mom != null && Math.abs(mom) >= 5 && lastM && prevM ? (
        <Insight tone={mom > 0 ? "signal" : "steady"} href={mom > 0 ? "/opportunities" : undefined} cta="See opportunities">
          Spend {trendWord(mom)} in {monthLabel(lastM.month)}: {fmtEur(lastM.eur)} vs {fmtEur(prevM.eur)}
        </Insight>
      ) : topCost && topShare >= 30 ? (
        <Insight href={`/assets/${topCost.a.id}`} cta={`Open ${topCost.a.name}`}>
          <b className="font-medium">{topCost.a.name}</b> is {topShare}% of spend
        </Insight>
      ) : null}

      {forecast && <ForecastCard {...forecast} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Panel flush title="Biggest costs">
          <div className="divide-y divide-line">
            {r.costed.slice(0, 8).map((x) => (
              <div key={x.a.id} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
                <span className="text-ink-100 truncate min-w-0">{x.a.name}</span>
                <span className="tabular text-ink-100 shrink-0">{x.m!.estimated ? "≈ " : ""}{fmtEur(x.m!.eur)}</span>
              </div>
            ))}
            {r.costed.length === 0 && <p className="px-5 py-3 text-sm text-ink-400">No costs yet.</p>}
          </div>
        </Panel>
        <Panel flush title="Top savings">
          <div className="divide-y divide-line">
            {r.savings.slice(0, 6).map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
                <span className="text-ink-100">{s.title}</span>
                <span className="tabular text-ink-100 shrink-0">{fmtEur(s.monthlyEur)}/mo</span>
              </div>
            ))}
            {r.savings.length === 0 && <p className="px-5 py-3 text-sm text-ink-400">Nothing to save.</p>}
          </div>
        </Panel>
      </div>
      <BenchmarkCard orgId={currentOrgId()} variant="section" />
      <Panel title="What changed">
        <ul className="flex flex-col gap-2 text-sm">
          {r.events.map((e, i) => (
            <li key={i} className="text-ink-100">
              <span title={e.detail}>{e.title}</span>
            </li>
          ))}
          {r.events.length === 0 && <li className="text-ink-400">Nothing new.</li>}
        </ul>
      </Panel>
    </div>
  );
}


import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import CsvDropzone from "@/components/CsvDropzone";
import AiTable from "@/components/AiTable";
import { StatCard, PageHeader, Panel } from "@/components/ui";
import LineChart from "@/components/LineChart";
import ExportMenu from "@/components/ExportMenu";
import { computeSavings, monthlyOf, loadAssets } from "@/lib/savings";
import { aiFilters, filterAssets, type AiFilterParams } from "@/lib/ai-filters";
import FilterBar from "@/components/FilterBar";
import { uploadSpendAction } from "@/lib/spend-actions";
import { fmtEur } from "@/lib/format";

export const dynamic = "force-dynamic";

// Home = i numeri (cliccabili), l'andamento nel tempo e la tabella delle AI.
export default async function OverviewPage({ searchParams }: { searchParams: { connected?: string; imported?: string; spend?: string } & AiFilterParams }) {
  const orgId = currentOrgId();
  const [org, { items: savings, totalMonthly: canSave, assets }, all, broken, toReview] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    computeSavings(orgId),
    loadAssets(orgId, { includeRejected: true }),
    db.connector.count({ where: { organizationId: orgId, status: "ERROR", credentialsEncrypted: { not: null }, provider: { notIn: ["NETWORK"] } } }),
    db.aiAsset.count({ where: { organizationId: orgId, deletedAt: null, status: { in: ["UNKNOWN", "UNREVIEWED"] } } }),
  ]);
  const costed = assets.map((a) => monthlyOf(a)).filter((m): m is NonNullable<typeof m> => !!m && m.eur > 0);
  const spend = costed.reduce((s, m) => s + m.eur, 0);
  const estimated = costed.filter((m) => m.estimated).length;
  const unpaid = assets.filter((a) => !monthlyOf(a)).length;
  const shown = filterAssets(all, searchParams);
  const records = await db.spendRecord.findMany({ where: { organizationId: orgId, date: { gte: new Date(Date.now() - 400 * 86400000) } }, select: { date: true, amountEur: true } });

  // Ultimi 12 mesi: spesa AI reale (addebiti) oppure, senza addebiti, AI in uso.
  const months: { key: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleString("en-GB", { month: "short" }) });
  }
  const spendByMonth = months.map((m) => records.filter((r) => r.date.toISOString().slice(0, 7) === m.key).reduce((t, r) => t + r.amountEur, 0));
  const firstMonth = spendByMonth.findIndex((v) => v > 0);
  const hasSpend = firstMonth >= 0;
  const from = hasSpend ? Math.max(0, Math.min(firstMonth, months.length - 3)) : 0;
  const chartLabels = months.slice(from).map((m) => m.label);
  const ratio = spend ? Math.max(0, 1 - canSave / spend) : 1;
  const chartSeries = hasSpend
    ? [
        { name: "AI spend", values: spendByMonth.slice(from).map((v) => Math.round(v)) },
        ...(canSave > 0 ? [{ name: "With savings", style: "ghost" as const, values: spendByMonth.slice(from).map((v) => Math.round(v * ratio)) }] : []),
      ]
    : [{ name: "AI in use", values: months.map((m) => all.filter((a) => a.firstSeenAt.toISOString().slice(0, 7) <= m.key).length) }];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" subtitle={`${org?.name ?? ""} — your AI at a glance.`} action={
          assets.length ? (
            <div className="flex items-center gap-2">
              <a href="/api/export/register" className="btn btn-secondary" title="AI register for the EU AI Act and GDPR records (Excel)">AI register</a>
              <ExportMenu dataset="assets" />
            </div>
          ) : undefined
        } />

      {(searchParams.connected || searchParams.imported || searchParams.spend) && (
        <div className="rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-100">
          {searchParams.spend ? (
            <><b>{searchParams.spend} AI service{searchParams.spend === "1" ? "" : "s"} found in your files.</b> Costs, plans and seats are filled in below.</>
          ) : searchParams.connected ? (
            <><b>Connected.</b> What angar found is now in the list below.</>
          ) : (
            <><b>{searchParams.imported} AI systems imported.</b></>
          )}
        </div>
      )}
      {broken > 0 && (
        <Link href="/sources" className="rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm">
          {broken} source{broken === 1 ? " stopped" : "s stopped"} syncing — open Sources to fix.
        </Link>
      )}

      {assets.length === 0 ? (
        <div className="rounded-xl border border-line bg-panel p-10 flex flex-col items-center text-center gap-5">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink-100">Which AI does your company pay for?</h2>
            <p className="text-sm text-ink-400 mt-1.5 max-w-xl">
              Drop a bank or card statement (or your e-invoices). In a few seconds angar lists every AI subscription, what it really costs and where you can save. Nothing to type.
            </p>
          </div>
          <form action={uploadSpendAction} className="w-full max-w-xl flex flex-col gap-3">
            <input type="hidden" name="back" value="/" />
            <CsvDropzone accept=".csv,.txt,.tsv,.xlsx,.xls,.ods,.xml,.p7m,.zip" multiple label="Drop your bank statement or invoices here" />
            <button className="btn btn-primary">Show my AI spend</button>
          </form>
          <div className="flex items-center gap-4 text-sm text-ink-400">
            <a href="/api/spend/sample" className="underline hover:text-ink-100">Download a sample statement</a>
            <span>·</span>
            <Link href="/sources" className="underline hover:text-ink-100">Other sources</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="AI in use" value={String(assets.length)} hint={toReview ? `${toReview} found by the scan to decide` : `${new Set(assets.map((a) => a.vendor).filter(Boolean)).size} providers`} tone="accent" href={toReview ? "/?status=TODECIDE#your-ai" : "/#your-ai"} />
            <StatCard label="Monthly spend" value={spend ? fmtEur(spend) : "—"} hint={spend ? (estimated ? `${estimated} estimated from list prices` : `${fmtEur(spend * 12)} a year`) : "Add a bank statement"} href={spend ? "/?paid=yes#your-ai" : "/sources"} />
            <StatCard label="You could save" value={canSave ? `${fmtEur(canSave)}/mo` : "—"} hint={canSave ? `${savings.length} suggestion${savings.length === 1 ? "" : "s"} →` : "Nothing found yet"} href="/savings" />
            <StatCard label="Not paid by the company" value={String(unpaid)} hint={unpaid ? "Free or personal accounts" : "Everything is on the books"} tone={unpaid ? "signal" : undefined} href={unpaid ? "/?paid=no#your-ai" : "/discover"} />
          </div>

          <Panel
            title={hasSpend ? "AI spend by month" : "AI in use over time"}
            subtitle={hasSpend ? (canSave > 0 ? "From your statements and invoices · dashed: what it would cost with angar's savings" : "From your statements and invoices") : "Add a bank statement to see spend over time"}
          >
            <LineChart labels={hasSpend ? chartLabels : months.map((m) => m.label)} series={chartSeries} format={hasSpend ? (v) => fmtEur(v) : (v) => String(Math.round(v))} />
          </Panel>

          <div id="your-ai" className="flex flex-col gap-3 scroll-mt-6">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink-100">Your AI</h2>
                <p className="text-sm text-ink-400">Most expensive first. Open one to see its passport.</p>
              </div>
              <Link href="/sources" className="btn btn-secondary btn-sm">+ Add sources</Link>
            </div>
            <FilterBar search={{ placeholder: "Find an AI by name or provider" }} filters={aiFilters(all)} right={`${shown.length} of ${all.length}`} />
            <AiTable assets={shown} savings={savings} empty="Nothing matches these filters." />
          </div>
        </>
      )}
    </div>
  );
}

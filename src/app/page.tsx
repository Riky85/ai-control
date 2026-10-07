import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { AssetLimitNotice } from "@/components/PlanBanner";
import { db } from "@/lib/db";
import CsvDropzone from "@/components/CsvDropzone";
import AiTable from "@/components/AiTable";
import { StatCard, PageHeader, Tabs } from "@/components/ui";
import EstateView from "@/components/estate/EstateView";
import ExportMenu from "@/components/ExportMenu";
import { computeSavingsCached, monthlyOf, loadAssets } from "@/lib/savings";
import { aiFilters, filterAssets, type AiFilterParams } from "@/lib/ai-filters";
import FilterBar from "@/components/FilterBar";
import { uploadSpendAction } from "@/lib/spend-actions";
import { fmtEur } from "@/lib/format";
import { currentSession } from "@/lib/auth";
import ScoreCard, { type ScoreCardData } from "@/components/engine/ScoreCard";
import { computeScoreCached, scoreHistory, scoreActions } from "@/lib/engine/score";

export const dynamic = "force-dynamic";

// "Welcome, Riccardo" / "Good morning, Riccardo" a seconda dell'ora di Roma.
function greeting(name?: string | null) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(new Date()));
  const part = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : "Welcome to angar";
}

// Home = i numeri (cliccabili) e la tabella delle AI. Andamento e benchmark stanno nel report mensile.
export default async function OverviewPage({ searchParams }: { searchParams: { connected?: string; imported?: string; spend?: string; view?: string } & AiFilterParams }) {
  const orgId = currentOrgId();
  const session = currentSession();
  // Tutto in parallelo; risparmi e computer collegati sono condivisi con il layout (React cache).
  const [org, { items: savings, totalMonthly: canSave, assets }, all, broken, toReview, spendCount] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    computeSavingsCached(orgId),
    loadAssets(orgId, { includeRejected: true }),
    db.connector.count({ where: { organizationId: orgId, status: "ERROR", credentialsEncrypted: { not: null }, provider: { notIn: ["NETWORK"] } } }),
    db.aiAsset.count({ where: { organizationId: orgId, deletedAt: null, status: { in: ["UNKNOWN", "UNREVIEWED"] } } }),
    db.spendRecord.count({ where: { organizationId: orgId } }),
  ]);

  // angar Score: solo se c'è almeno un'AI (altrimenti non c'è niente da valutare).
  let scoreCard: ScoreCardData | null = null;
  if (all.length > 0) {
    const [score, history] = await Promise.all([computeScoreCached(orgId), scoreHistory(orgId, 30)]);
    const plan = scoreActions(score.facts, score);
    scoreCard = {
      score: score.score,
      level: score.level,
      levelLabel: score.levelLabel,
      verdict: score.verdict,
      savingsMonthlyEur: score.savingsMonthlyEur,
      confidence: score.confidence,
      confidenceLabel: score.confidenceLabel,
      // Una dimensione non misurata mostra "—" (conta 60, spiegato su /score).
      dims: score.dimensions.map((d) => ({ axis: d.axis, label: d.label, value: d.status === "unmeasured" || d.status === "na" ? null : d.value, level: d.level, levelLabel: d.levelLabel })),
      potential: plan.potential,
      actions: plan.actions.filter((a) => a.points > 0).length,
      // Solo fotografie dello stesso metodo: le vecchie (assi diversi) non sono confrontabili.
      delta: history.length && history[0].day !== history[history.length - 1].day ? { points: score.score - history[0].score, since: history[0].day } : null,
    };
  }

  const costed = assets.map((a) => monthlyOf(a)).filter((m): m is NonNullable<typeof m> => !!m && m.eur > 0);
  const spend = costed.reduce((s, m) => s + m.eur, 0);
  const estimated = costed.filter((m) => m.estimated).length;
  const estimatedEur = costed.filter((m) => m.estimated).reduce((t, m) => t + m.eur, 0);
  // I server MCP non si pagano come un'AI: non contano tra "non pagate dall'azienda".
  const unpaid = assets.filter((a) => a.type !== "MCP_SERVER" && !monthlyOf(a)).length;
  const shown = filterAssets(all, searchParams);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={greeting(session?.name)} subtitle={org?.name ?? undefined} action={
          assets.length ? (
            <div className="flex items-center gap-2">
              {spendCount > 0 && <Link href="/report" className="btn btn-ghost btn-sm">Monthly report →</Link>}
              <ExportMenu dataset="assets" />
            </div>
          ) : undefined
        } />
      <AssetLimitNotice orgId={orgId} />

      {(searchParams.connected || searchParams.imported || searchParams.spend) && (
        <div className="rounded-xl border border-line bg-panel dark:bg-ink px-4 py-3 text-sm text-ink-100">
          {searchParams.spend ? (
            <><b>{searchParams.spend} AI service{searchParams.spend === "1" ? "" : "s"} found.</b></>
          ) : searchParams.connected ? (
            <><b>Connected.</b></>
          ) : (
            <><b>{searchParams.imported} AI systems imported.</b></>
          )}
        </div>
      )}
      {broken > 0 && (
        <Link href="/sources" className="rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm">
          {broken} source{broken === 1 ? " stopped" : "s stopped"} syncing →
        </Link>
      )}

      {assets.length === 0 ? (
        <div className="rounded-xl border border-line bg-panel p-6 sm:p-10 flex flex-col items-center text-center gap-5">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-ink-100">Which AI do you pay for?</h2>
          </div>
          <form action={uploadSpendAction} className="w-full max-w-xl flex flex-col gap-3">
            <input type="hidden" name="back" value="/" />
            <CsvDropzone accept=".csv,.txt,.tsv,.xlsx,.xls,.ods,.xml,.xsig,.p7m,.zip,.pdf" multiple label="Drop a bank statement or invoices" />
            <button className="btn btn-primary">Show my AI spend</button>
          </form>
          <div className="flex items-center gap-4 text-sm text-ink-400">
            <a href="/api/spend/sample" className="underline hover:text-ink-100">Download a sample statement</a>
            <span>·</span>
            <Link href="/connect" className="underline hover:text-ink-100">Other sources</Link>
          </div>
        </div>
      ) : (
        <>
          {scoreCard && <ScoreCard data={scoreCard} />}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="AI in use" value={String(assets.length)} hint={toReview ? `${toReview} to review` : `${new Set(assets.map((a) => a.vendor).filter(Boolean)).size} providers`} href={toReview ? "/review" : "/providers"} />
            <StatCard label="Monthly spend" value={spend ? fmtEur(spend) : "—"} hint={spend ? (estimated ? `${fmtEur(estimatedEur)} estimated` : `${fmtEur(spend * 12)} a year`) : "Add a bank statement"} href={spend ? "/report" : "/sources"} />
            <StatCard label="You could save" value={canSave ? `${fmtEur(canSave)}/mo` : "—"} hint={canSave ? `${savings.length} suggestion${savings.length === 1 ? "" : "s"}` : undefined} href="/savings" />
            <StatCard label="Not company-paid" value={String(unpaid)} hint={unpaid ? "Free or personal" : undefined} tone={unpaid ? "signal" : undefined} href={unpaid ? "/?paid=no#your-ai" : undefined} />
          </div>

          <div id="your-ai" className="flex flex-col gap-3 scroll-mt-6">
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold text-ink-100">Your AI</h2>
                {/* Elenco o grafo delle dipendenze (AI Estate). */}
                <Tabs active={searchParams.view === "graph" ? "graph" : "list"} items={[{ key: "list", label: "List", href: "/#your-ai" }, { key: "graph", label: "Graph", href: "/?view=graph#your-ai" }]} />
              </div>
              <Link href="/connect" className="btn btn-ghost btn-sm">+ Add sources</Link>
            </div>
            {searchParams.view === "graph" ? (
              <EstateView orgId={orgId} />
            ) : (
              <>
                <FilterBar search={{ placeholder: "Find an AI" }} filters={aiFilters(all).filter((f) => f.param === "paid")} right={`${shown.length} of ${all.length}`} />
                <AiTable assets={shown} savings={savings} empty="No match." />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

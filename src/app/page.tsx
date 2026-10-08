import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { AssetLimitNotice } from "@/components/PlanBanner";
import { db } from "@/lib/db";
import CsvDropzone from "@/components/CsvDropzone";
import { PageHeader } from "@/components/ui";
import { redirect } from "next/navigation";
import { computeSavingsCached, monthlyOf, loadAssets } from "@/lib/savings";
import type { AiFilterParams } from "@/lib/ai-filters";
import { uploadSpendAction } from "@/lib/spend-actions";
import { fmtEur } from "@/lib/format";
import { currentSession } from "@/lib/auth";
import ScoreCard, { type ScoreCardData } from "@/components/engine/ScoreCard";
import { computeScoreCached, scoreHistory, scoreActions } from "@/lib/engine/score";
import MarketChangesBlock from "@/components/market/MarketChangesBlock";
import { loadOpportunitiesCached } from "@/lib/opportunities";
import { OverviewMetricsRow, TopOpportunities } from "@/components/overview/TopOpportunities";

export const dynamic = "force-dynamic";

// "Welcome, Riccardo" / "Good morning, Riccardo" a seconda dell'ora di Roma.
function greeting(name?: string | null) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(new Date()));
  const part = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : "Welcome to angar";
}

// Home (spec §15): angar Score, le 6 metriche dell'estate, le opportunità migliori e i cambi di mercato
// che contano. L'elenco delle AI è in AI Estate (/estate): i vecchi link "/?view=graph", "/?q=…#your-ai" vanno lì.
export default async function OverviewPage({ searchParams }: { searchParams: { connected?: string; imported?: string; spend?: string; view?: string } & AiFilterParams }) {
  if (searchParams.view === "graph") redirect("/estate/graph");
  const moved = new URLSearchParams();
  for (const k of ["q", "status", "paid", "category"] as const) if (searchParams[k]) moved.set(k, searchParams[k]!);
  if (moved.toString()) redirect(`/estate?${moved}`);
  const orgId = currentOrgId();
  const session = currentSession();
  // Tutto in parallelo; risparmi e computer collegati sono condivisi con il layout (React cache).
  const [org, { assets }, all, broken, toReview, spendCount] = await Promise.all([
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
  const estimatedEur = costed.filter((m) => m.estimated).reduce((t, m) => t + m.eur, 0);
  // Opportunità (stesso totale del motore dei risparmi) e metriche dell'estate.
  const opp = assets.length ? await loadOpportunitiesCached(orgId) : null;
  const em = opp?.estate?.metrics ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={greeting(session?.name)} subtitle={org?.name ?? "Your AI at a glance"} action={
          assets.length ? (
            <div className="flex items-center gap-2">
              {spendCount > 0 && <Link href="/report" className="btn btn-ghost btn-sm btn-go">Monthly report</Link>}
              <Link href="/estate" className="btn btn-ghost btn-sm btn-go">See all AI</Link>
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

          <OverviewMetricsRow
            m={{
              systems: em?.systems ?? assets.length,
              toReview,
              spend,
              estimatedEur,
              savingsMonthly: opp?.summary.totalMonthly ?? 0,
              opportunities: opp?.summary.open ?? 0,
              concentration: em?.providerConcentration ?? null,
              unowned: em?.unowned ?? 0,
              highDependencies: em?.highDependencies ?? 0,
            }}
          />
          {opp && <TopOpportunities list={opp.list} />}
          <MarketChangesBlock orgId={orgId} />
          <Link href="/estate" className="text-sm text-ink-400 hover:text-ink-100 w-fit">
            See all {all.length} AI →
          </Link>
        </>
      )}
    </div>
  );
}

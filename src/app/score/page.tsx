import { currentOrgId } from "@/lib/org";
import ForecastCard, { loadForecastCard } from "@/components/engine/ForecastCard";
import ScoreView from "@/components/engine/ScoreView";
import { computeScoreCached, recordScoreSnapshot, scoreHistoryAll, scoreActions, whatChanged, romeDay, type ScorePoint } from "@/lib/engine/score";
import { SCORE_METHOD } from "@/lib/engine/score-meta";
import Link from "next/link";
import { db } from "@/lib/db";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

// Angar Score (AI spend efficiency): numero, livello, confidenza, andamento, le 5 dimensioni e perché.
export default async function ScorePage() {
  const orgId = currentOrgId();
  // Senza AI e senza costi non c'è niente da valutare: niente numero, solo il primo passo.
  const [anyAi, anySpend] = await Promise.all([
    db.aiAsset.findFirst({ where: { organizationId: orgId, deletedAt: null }, select: { id: true } }),
    db.spendRecord.findFirst({ where: { organizationId: orgId }, select: { id: true } }),
  ]);
  if (!anyAi && !anySpend)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Angar Score" subtitle="AI spend efficiency" />
        <EmptyState
          text={
            <>
              <b className="block text-ink-100 font-bold mb-1">Score needs spend data</b>
              Drop a bank statement or invoices and angar scores how well your AI spend turns into use.
            </>
          }
          action={
            <Link href="/" className="btn btn-primary btn-sm">
              Add spend data
            </Link>
          }
        />
      </div>
    );
  const [result, all, forecast] = await Promise.all([computeScoreCached(orgId), scoreHistoryAll(orgId, 90), loadForecastCard(orgId)]);

  // Fotografia di oggi col metodo attuale, se manca (il lavoro giornaliero la aggiorna comunque).
  const today = romeDay();
  let points: ScorePoint[] = all;
  if (!all.some((p) => p.day === today && p.method === SCORE_METHOD)) {
    await recordScoreSnapshot(orgId, new Date(), result).catch(() => null);
    points = [...all.filter((p) => p.day !== today), { day: today, score: result.score, axes: result.axes, method: SCORE_METHOD, monthlySpendEur: result.facts.monthlySpendEur }];
  }
  // Le fotografie del metodo precedente (assi diversi) non si confrontano: solo il segno "Method changed".
  const current = points.filter((p) => p.method === SCORE_METHOD);
  const changedOn = points.some((p) => p.method !== SCORE_METHOD) ? current[0]?.day ?? today : null;
  const plan = scoreActions(result.facts, result);
  const changed = await whatChanged(orgId, { score: result.score, monthlySpendEur: result.facts.monthlySpendEur }, current).catch(() => null);

  return (
    <ScoreView result={result} plan={plan} current={current} changedOn={changedOn} changed={changed}>
      <ForecastCard {...forecast} />
    </ScoreView>
  );
}

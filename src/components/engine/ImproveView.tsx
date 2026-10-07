import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { LevelPill } from "@/components/engine/ScoreCard";
import type { FullScore } from "@/lib/engine/score";
import type { ActionPlan, ScoreAction } from "@/lib/engine/score-model";
import { AXIS_LABEL, LEVEL_STYLE, CONFIDENCE_TEXT } from "@/lib/engine/score-meta";
import { CERTAINTY_LABEL, type ActionCertainty } from "@/lib/engine/score-model";

const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");
const CERTAINTY_STYLE: Record<ActionCertainty, string> = {
  high: LEVEL_STYLE.strong.pill,
  medium: LEVEL_STYLE.fair.pill,
  investigate: LEVEL_STYLE.none.pill,
};

/**
 * "Improve my score": il piano d'azione (solo presentazione). Ogni azione ha i punti ricalcolati
 * (punteggio con la correzione − oggi), il risparmio con la base del calcolo, la certezza e il link
 * al flusso esistente (Savings, posti, fonti).
 */
export default function ImproveView({ result, plan }: { result: FullScore; plan: ActionPlan }) {
  const scored = plan.actions.filter((a) => a.points > 0);
  const best = plan.best;
  const rest = plan.actions.filter((a) => a.key !== best?.key);
  const sumPts = scored.reduce((s, a) => s + a.points, 0);
  const together = plan.potential - result.score;
  const investigate = plan.actions.filter((a) => a.certainty === "investigate").reduce((t, a) => t + (a.monthlyEur ?? 0), 0);
  const cell = "bg-panel px-5 py-4 flex flex-col gap-1.5 min-w-0";
  const big = "font-display text-[30px] leading-none font-semibold tabular text-ink-100";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Improve your score" crumbs={[{ label: "Angar Score", href: "/score" }, { label: "Improve" }]} />

      {/* Riepilogo: punteggio attuale, potenziale, risparmi */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line animate-rise">
        <div className={cell}>
          <span className="text-sm font-semibold text-ink-100">Score</span>
          <span className="flex items-end gap-2">
            <span className={big}>{result.score}</span>
            <LevelPill level={result.level} label={result.levelLabel} className="mb-0.5" />
          </span>
        </div>
        <div className={cell} title={together !== sumPts ? `Done together the actions add +${together}, not +${sumPts}: the score stops at 100.` : undefined}>
          <span className="text-sm font-semibold text-ink-100">Potential</span>
          <span className={big}>{plan.potential}</span>
          <span className="text-xs text-ink-400">{scored.length ? `${scored.length} ${scored.length === 1 ? "action" : "actions"}` : "Nothing to raise"}</span>
        </div>
        <div className={cell} title={investigate >= 1 ? `${eur(investigate)} a month needs investigation first` : undefined}>
          <span className="text-sm font-semibold text-ink-100">Savings</span>
          <span className={big}>
            {eur(plan.potentialSavingsEur)}
            <span className="text-sm font-normal text-ink-400"> a month</span>
          </span>
          <span className="text-xs text-ink-400 tabular">{eur(plan.potentialSavingsEur * 12)} a year</span>
        </div>
      </section>

      {result.confidence === "provisional" && (
        <div className="rounded-xl border border-line bg-panel px-4 py-3 text-sm text-ink-100 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex-1 min-w-0" title={CONFIDENCE_TEXT.provisional}>No usage data yet.</span>
          <Link href="/download" className="btn btn-secondary btn-sm">
            Get the desktop app
          </Link>
        </div>
      )}

      {/* Le azioni, la migliore per prima (l'unico pulsante arancio) */}
      <section className="rounded-xl border border-line bg-panel animate-rise" aria-labelledby="actions-title">
        <div className="px-5 pt-5 pb-2">
          <h2 id="actions-title" className="text-sm font-bold text-ink-100" title="Ordered by certainty × saving × points">
            Actions
          </h2>
        </div>
        {plan.actions.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-ink-400">Nothing to do.</p>
        ) : (
          <ol className="divide-y divide-line">
            {(best ? [best, ...rest] : rest).map((a, i) => (
              <li key={a.key} className="px-5 py-4 grid grid-cols-[1.5rem_minmax(0,1fr)] sm:grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-3 items-center">
                <span className="text-sm tabular text-ink-400">{i + 1}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-ink-100" title={`${AXIS_LABEL[a.axis]} · ${a.detail}`}>{a.title}</span>
                    {a.inProgress && <span className="text-[11px] rounded-full border border-line px-2 py-0.5 text-ink-400">In progress</span>}
                  </div>
                  <Facts a={a} />
                </div>
                <Link href={a.href} className={`btn ${best && a.key === best.key ? "btn-primary" : "btn-secondary"} btn-sm col-start-2 sm:col-start-3 justify-self-start`}>
                  {a.cta}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** Punti, risparmio con la base del calcolo e certezza di un'azione. */
function Facts({ a }: { a: ScoreAction }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-1 text-sm">
      <span className="tabular font-semibold text-ink-100">{a.points > 0 ? `+${a.points} ${a.points === 1 ? "point" : "points"}` : "No score change"}</span>
      {a.monthlyEur != null && a.monthlyEur >= 1 && (
        <span className="tabular text-ink-100" title={a.basis ?? undefined}>
          {eur(a.monthlyEur)} <span className="text-ink-400">a month</span>
        </span>
      )}
      {a.certainty !== "high" && <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${CERTAINTY_STYLE[a.certainty]}`}>{CERTAINTY_LABEL[a.certainty]}</span>}
    </div>
  );
}

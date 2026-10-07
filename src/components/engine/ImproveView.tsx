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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Improve your angar Score"
        crumbs={[{ label: "angar Score", href: "/score" }, { label: "Improve" }]}
        subtitle="Actions built from your real data. Points are recalculated with each fix applied — never guessed."
      />

      {/* Riepilogo: punteggio attuale, potenziale, risparmi */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line animate-rise">
        <div className="bg-panel px-5 py-4 flex flex-col gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-ink-100">Current score</span>
          <span className="flex items-end gap-2">
            <span className="font-display text-[34px] leading-none font-bold tabular text-ink-100">{result.score}</span>
            <LevelPill level={result.level} label={result.levelLabel} className="mb-1" />
          </span>
          <span className="text-xs text-ink-400">{result.confidenceLabel}</span>
        </div>
        <div className="bg-panel px-5 py-4 flex flex-col gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-ink-100">Potential score</span>
          <span className="font-display text-[34px] leading-none font-bold tabular text-ink-100">
            {result.score} → {plan.potential}
          </span>
          <span className="text-xs text-ink-400">
            {scored.length ? `You can reach ${plan.potential} by addressing ${scored.length} ${scored.length === 1 ? "opportunity" : "opportunities"}.` : "No action would raise the score right now."}
          </span>
        </div>
        <div className="bg-panel px-5 py-4 flex flex-col gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-ink-100">Estimated savings</span>
          <span className="font-display text-[34px] leading-none font-bold tabular text-ink-100">
            {eur(plan.potentialSavingsEur)}
            <span className="text-sm font-normal text-ink-400"> a month</span>
          </span>
          <span className="text-xs text-ink-400">
            {eur(plan.potentialSavingsEur * 12)} a year if every action is done
            {investigate >= 1 ? ` · ${eur(investigate)} a month of it needs investigation first` : ""}
          </span>
        </div>
      </section>

      {result.confidence === "provisional" && (
        <div className="rounded-xl border border-line bg-panel px-4 py-3 text-sm text-ink-100 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex-1 min-w-0">{CONFIDENCE_TEXT.provisional} Seat actions appear once usage is measured.</span>
          <Link href="/download" className="btn btn-secondary btn-sm">
            Get the desktop app
          </Link>
        </div>
      )}

      {/* La migliore prossima azione */}
      {best && (
        <section className="rounded-2xl border border-ink-400/60 bg-panel animate-rise p-5 sm:p-6" aria-labelledby="best-title">
          <div className="text-xs font-semibold text-ink-400">Best next action · best mix of certainty, saving and points</div>
          <div className="flex flex-col md:flex-row md:items-end gap-4 mt-2">
            <div className="flex-1 min-w-0">
              <h2 id="best-title" className="text-xl font-bold text-ink-100 leading-snug">
                {best.title}
              </h2>
              <p className="text-sm text-ink-400 mt-1">{best.detail}</p>
              <Facts a={best} />
            </div>
            <Link href={best.href} className="btn btn-primary shrink-0 self-start md:self-end">
              {best.cta}
            </Link>
          </div>
        </section>
      )}

      {/* Tutte le azioni */}
      <section className="rounded-2xl border border-line bg-panel animate-rise" aria-labelledby="actions-title">
        <div className="px-5 pt-5 pb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="actions-title" className="text-base font-bold text-ink-100">
            Recommended actions
          </h2>
          <span className="text-xs text-ink-400">Ordered by certainty × saving × points</span>
        </div>
        {plan.actions.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-ink-400">Nothing to do: angar found no waste and no missing data that would raise the score.</p>
        ) : (
          <ol className="divide-y divide-line">
            {(best ? [best, ...rest] : rest).map((a, i) => (
              <li key={a.key} className="px-5 py-4 grid grid-cols-[1.5rem_minmax(0,1fr)] sm:grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-3 items-start">
                <span className="text-sm tabular text-ink-400 pt-0.5">{i + 1}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-ink-100">{a.title}</span>
                    {a.inProgress && <span className="text-[11px] rounded-full border border-line px-2 py-0.5 text-ink-400">In progress</span>}
                  </div>
                  <p className="text-xs text-ink-400 mt-0.5">
                    {AXIS_LABEL[a.axis]} · {a.detail}
                  </p>
                  <Facts a={a} />
                </div>
                <Link href={a.href} className="btn btn-secondary btn-sm col-start-2 sm:col-start-3 justify-self-start">
                  {a.cta}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Impatto sul punteggio */}
      {scored.length > 0 && (
        <section className="rounded-2xl border border-line bg-panel animate-rise p-5 sm:p-6" aria-labelledby="impact-title">
          <h2 id="impact-title" className="text-base font-bold text-ink-100">
            Score impact
          </h2>
          <ul className="mt-3 max-w-xl divide-y divide-line text-sm">
            <li className="flex justify-between gap-4 py-2">
              <span className="text-ink-400">Current score</span>
              <span className="tabular font-semibold text-ink-100">{result.score}</span>
            </li>
            {scored.map((a) => (
              <li key={a.key} className="flex justify-between gap-4 py-2">
                <span className="text-ink-100 min-w-0 truncate">{a.title}</span>
                <span className="tabular text-ink-100 shrink-0">+{a.points}</span>
              </li>
            ))}
            <li className="flex justify-between gap-4 py-2">
              <span className="font-semibold text-ink-100">Potential score</span>
              <span className="tabular font-bold text-ink-100">{plan.potential}</span>
            </li>
          </ul>
          {together !== sumPts && (
            <p className="text-xs text-ink-400 mt-2">
              Done together the actions add +{together}, not +{sumPts}: each one changes the ratios the others are measured on, and the score stops at 100.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/** Punti, risparmio con la base del calcolo e certezza di un'azione. */
function Facts({ a }: { a: ScoreAction }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-sm">
      <span className="tabular font-semibold text-ink-100">{a.points > 0 ? `+${a.points} ${a.points === 1 ? "point" : "points"}` : "No score change"}</span>
      {a.monthlyEur != null && a.monthlyEur >= 1 && (
        <span className="tabular text-ink-100">
          {eur(a.monthlyEur)} <span className="text-ink-400">a month</span>
        </span>
      )}
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${CERTAINTY_STYLE[a.certainty]}`}>{CERTAINTY_LABEL[a.certainty]}</span>
      {a.basis && <span className="basis-full text-xs text-ink-400 tabular">{a.basis}</span>}
    </div>
  );
}

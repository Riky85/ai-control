import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { LevelPill, ScoreBar, scoreSentence } from "@/components/engine/ScoreCard";
import type { ScorePoint, FullScore } from "@/lib/engine/score";
import type { Dimension, ActionPlan } from "@/lib/engine/score-model";
import { AXIS_HINT, AXIS_WEIGHT, CONFIDENCE_TEXT, UNMEASURED_CAP, LEVEL_STYLE } from "@/lib/engine/score-meta";

const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");
const fmtDay = (day: string) => new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const minus = (n: number) => (n < 0 ? `−${Math.abs(n)}` : n > 0 ? `+${n}` : "0");

export interface ScoreViewProps {
  result: FullScore;
  plan: ActionPlan;
  /** Fotografie del metodo attuale (la più vecchia per prima). */
  current: ScorePoint[];
  /** Primo giorno del metodo attuale, se ci sono fotografie del metodo precedente. */
  changedOn: string | null;
  changed: { from: number; to: number; since: string; savedMonthlyEur: number } | null;
  children?: ReactNode;
}

/**
 * Pagina /score (solo presentazione, dati dal server): testata con numero,
 * livello, confidenza e andamento; le 5 dimensioni; "Why is my score X?".
 */
export default function ScoreView({ result, plan, current, changedOn, changed, children }: ScoreViewProps) {
  const first = current[0];
  const delta = current.length >= 2 ? result.score - first.score : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader subtitle="How well your AI spend is used"
        title="Angar Score"
        action={
          <Link href="/impact?view=score" className="btn btn-ghost btn-sm">
            What if…
          </Link>
        }
      />

      {/* Testata: numero, livello, confidenza, frase, andamento */}
      <section className="rounded-xl border border-line bg-panel animate-rise">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8 p-5 sm:p-7">
          <div className="flex flex-col min-w-0">
            <div className="flex flex-wrap items-center gap-2 eyebrow">
              <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-line px-1.5 py-0.5 font-mono uppercase text-[10px] tracking-[0.05em] text-ink-100">
                <span title={CONFIDENCE_TEXT[result.confidence]} className={`h-1.5 w-1.5 rounded-full ${result.confidence === "high" || result.confidence === "measured" ? LEVEL_STYLE.strong.dot : result.confidence === "early" ? LEVEL_STYLE.fair.dot : LEVEL_STYLE.none.dot}`} aria-hidden />
                {result.confidenceLabel}
              </span>
              {delta != null && delta !== 0 && !(changed && changed.to !== changed.from) && (
                <span className="tabular">
                  {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} since {fmtDay(first.day)}
                </span>
              )}
            </div>
            <div className="flex items-end gap-3 mt-4">
              <span className="font-display text-[60px] leading-[0.85] font-light tracking-[-0.04em] tabular text-ink-100">
                {result.score}
                <span className="text-[20px] tracking-normal text-ink-400 ml-1">/100</span>
              </span>
              <LevelPill level={result.level} label={result.levelLabel} className="mb-2" />
            </div>
            <ScoreBar value={result.score} className="mt-5 max-w-md" />
            <p className="text-[15px] text-ink-100 mt-4 leading-snug max-w-lg">{scoreSentence(result)}</p>
            {changed && changed.to !== changed.from && (
              <p className="text-sm text-ink-100 mt-2 tabular">
                {changed.from} → {changed.to}
                {changed.savedMonthlyEur >= 1 && ` · ${eur(changed.savedMonthlyEur)} a month saved`}
                <span className="eyebrow ml-1.5">since {fmtDay(changed.since)}</span>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-5">
              <Link href="/opportunities?view=score" className="btn btn-primary btn-go">
                Improve my score
              </Link>
              {plan.potential > result.score && (
                <span className="text-sm text-ink-400 tabular">
                  Potential <b className="text-ink-100 font-normal">{plan.potential}</b>
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3 min-w-0 justify-center">
            <Trend points={current} />
            {result.gaps.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {result.gaps.map((g) => (
                  <Link key={g.label} href={g.href} className="eyebrow !text-accent hover:!text-ink-100 transition-colors">
                    {g.label} [→]
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Le 5 dimensioni */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {result.dimensions.map((d) => (
          <DimensionCard key={d.axis} d={d} />
        ))}
      </div>

      <WhySection result={result} />

      {/* angar Engine: previsione e anomalie (passata dalla pagina) */}
      {children}
    </div>
  );
}

function DimensionCard({ d }: { d: Dimension }) {
  const unmeasured = d.status === "unmeasured" || d.status === "na";
  // Spiegazione e peso nel tooltip: la card mostra solo nome, numero e stato.
  const weight =
    d.status === "na"
      ? "Not counted: no data for this dimension."
      : d.status === "unmeasured"
        ? `Counts as ${UNMEASURED_CAP} until measured · ${Math.round(d.weight * 100)}% of the score`
        : `${Math.round(d.weight * 100)}% of the score${Math.round(d.weight * 100) !== Math.round(AXIS_WEIGHT[d.axis] * 100) ? ` (${Math.round(AXIS_WEIGHT[d.axis] * 100)}% base)` : ""}`;
  return (
    <section id={`axis-${d.axis}`} title={`${AXIS_HINT[d.axis]} · ${weight}`} className={`scroll-mt-6 rounded-xl border border-line bg-panel animate-rise flex flex-col min-w-0 p-4 gap-3 target:border-ink-400 ${d.level === "weak" ? "tile-warn" : ""}`}>
      <h3 className={`eyebrow truncate ${d.level === "weak" ? "!text-accent" : ""}`}>{d.label}</h3>
      <div className="flex items-center justify-between gap-2">
        <span className={`font-display text-[30px] leading-none font-light tracking-[-0.03em] tabular ${d.level === "weak" ? "text-accent" : "text-ink-100"}`}>{unmeasured ? "—" : d.value}</span>
        <LevelPill level={d.level} label={d.levelLabel} />
      </div>
      <ScoreBar value={unmeasured ? 0 : d.value ?? 0} />
    </section>
  );
}

/** "Why is my score X?": cosa lo tiene giù, per dimensione e motivo per motivo. Somma = 100 − punteggio. */
function WhySection({ result }: { result: FullScore }) {
  const limits = result.dimensions.filter((d) => d.points < 0).sort((a, b) => a.points - b.points);
  const total = result.drivers.reduce((s, d) => s + d.points, 0);
  return (
    <section id="why" className="scroll-mt-6 rounded-xl border border-line bg-panel animate-rise p-5 sm:p-6">
      <h2 className="text-sm font-bold text-ink-100" title={`The reasons add up to exactly ${minus(total)}.`}>Why {result.score}?</h2>
      {result.drivers.length === 0 ? (
        <p className="text-sm text-ink-100 mt-4">Nothing holds it back.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-6 lg:gap-10 mt-5">
          <div className="min-w-0">
            <h3 className="eyebrow mb-1">By dimension</h3>
            <ul className="divide-y divide-line">
              {limits.map((d) => (
                <li key={d.axis}>
                  <a href={`#axis-${d.axis}`} className="flex items-baseline justify-between gap-3 py-2 text-sm group">
                    <span className="text-ink-100 group-hover:underline">{d.label}</span>
                    <span className="tabular text-accent">{minus(d.points)}</span>
                  </a>
                </li>
              ))}
              {result.capPoints > 0 && (
                <li className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="text-ink-100">No usage data</span>
                  <span className="tabular text-accent">{minus(-result.capPoints)}</span>
                </li>
              )}
            </ul>
          </div>
          <div className="min-w-0">
            <h3 className="eyebrow mb-1">Reasons</h3>
            <ul className="divide-y divide-line">
              {result.drivers
                .filter((d) => d.points < 0)
                .map((d) => (
                  <li key={`${d.axis}:${d.label}`}>
                    <Link href={d.href} className="flex items-start gap-3 py-2 text-sm group" title={d.missingData ? "Missing data" : undefined}>
                      <span className="w-8 shrink-0 tabular text-accent">{minus(d.points)}</span>
                      <span className="flex-1 min-w-0 leading-snug text-ink-100 group-hover:underline">{d.label}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

/** Andamento del punteggio (solo il metodo attuale), linea grigia. Con meno di due giorni non c'è ancora una linea. */
function Trend({ points }: { points: ScorePoint[] }) {
  if (points.length < 2) return <div className="eyebrow">Trend starts tomorrow.</div>;
  const W = 480;
  const H = 72;
  const vals = points.map((p) => p.score);
  const lo = Math.max(0, Math.min(...vals) - 5);
  const hi = Math.min(100, Math.max(...vals) + 5);
  const x = (i: number) => (i * W) / (points.length - 1);
  const y = (v: number) => 4 + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - 8);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <div className="w-full">
      <div className="eyebrow mb-2">Trend</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[72px] text-ink-400" preserveAspectRatio="none" aria-label={`Score trend, from ${vals[0]} to ${vals[vals.length - 1]}`}>
        <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between font-mono uppercase tracking-[0.04em] text-[10px] text-ink-400 tabular mt-1">
        <span>
          {fmtDay(points[0].day)} · {vals[0]}
        </span>
        <span>Today · {vals[vals.length - 1]}</span>
      </div>
    </div>
  );
}

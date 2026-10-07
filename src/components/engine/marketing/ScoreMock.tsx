import { LevelPill, ScoreBar } from "@/components/engine/ScoreCard";
import { AXES, AXIS_LABEL, LEVEL_LABEL, levelOf, type Axis } from "@/lib/engine/score-meta";

/**
 * Esempio illustrativo dell'angar Score (mai dati di clienti) per le pagine
 * pubbliche: numero, livello, barra grigia e le 5 dimensioni. I valori danno
 * davvero 82 con i pesi del metodo (20/30/20/20/10).
 */
export const DEMO_DIMS: Record<Axis, number> = { visibility: 96, utilization: 72, tools: 84, consumption: 79, savings: 86 };
export const DEMO_SCORE = 82;

export default function ScoreMock({ compact = false }: { compact?: boolean }) {
  const lv = levelOf(DEMO_SCORE);
  return (
    <div className="flex flex-col sm:flex-row gap-5 min-w-0">
      <div className="sm:w-44 shrink-0">
        <div className="text-xs text-ink-400">AI spend efficiency</div>
        <div className="flex items-end gap-2 mt-1">
          <span className={`font-display font-bold tracking-tight tabular text-ink-100 leading-[0.9] ${compact ? "text-[44px]" : "text-[52px]"}`}>{DEMO_SCORE}</span>
          <LevelPill level={lv} label={LEVEL_LABEL[lv]} className="mb-1" />
        </div>
        <ScoreBar value={DEMO_SCORE} className="mt-3" />
        <p className="text-xs text-ink-400 mt-3 leading-snug">Well optimized. €620 a month could be saved.</p>
      </div>
      <ul className="flex-1 min-w-0 divide-y divide-line">
        {AXES.map((a) => {
          const l = levelOf(DEMO_DIMS[a]);
          return (
            <li key={a} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-ink-100 truncate">{AXIS_LABEL[a]}</span>
              <LevelPill level={l} label={LEVEL_LABEL[l]} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import Link from "next/link";
import ScoreRing from "@/components/engine/ScoreRing";
import { AXES, AXIS_LABEL, type Axes, type Grade, type ScoreConfidence } from "@/lib/engine/score-meta";

export interface ScoreCardData {
  score: number;
  grade: Grade;
  verdict: string;
  axes: Axes;
  top: { label: string; scoreImpact: number; href: string } | null;
  confidence: ScoreConfidence;
  /** Variazione rispetto a 30 giorni fa (se c'è lo storico). */
  delta?: number | null;
}

/**
 * Indicatore di un asse, sobrio: numero e 10 tacche neutre. Solo gli assi
 * deboli (sotto 45) hanno un piccolo punto arancione accanto al nome.
 */
export function AxisGauge({ label, value, size = 64 }: { label: string; value: number; size?: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const filled = Math.round(v / 10);
  const big = size >= 70;
  const ticks = (
    <div className="flex gap-[3px]" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-full ${i < filled ? "bg-ink-100/75" : "bg-ink-100/[0.09]"}`} />
      ))}
    </div>
  );
  // Senza etichetta (intestazione delle card degli assi): solo le tacche.
  if (!label) return <div className="w-28" role="img" aria-label={`${v} out of 100`}>{ticks}</div>;
  return (
    <div className="min-w-0 rounded-xl border border-line bg-ink-100/[0.02] px-3 py-2.5" role="group" aria-label={`${label}: ${v} out of 100`}>
      <div className="flex items-center gap-1.5 text-xs text-ink-400">
        <span className="truncate">{label}</span>
        {v < 45 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Weak area" />}
      </div>
      <div className={`font-display font-semibold tabular text-ink-100 leading-tight mt-0.5 ${big ? "text-[26px]" : "text-[20px]"}`}>
        {v}
        <span className="text-[11px] font-normal text-ink-400 ml-0.5">/100</span>
      </div>
      <div className="mt-2">{ticks}</div>
    </div>
  );
}

/** Compatibilità: il vecchio nome ora disegna l'anello. */
export const AxisBar = AxisGauge;

/**
 * Card dell'angar Score per la home: anello, i 4 assi, il primo modo per
 * migliorare e il link ai dettagli. Solo presentazione: i dati arrivano dal server.
 */
export default function ScoreCard({ data }: { data: ScoreCardData }) {
  const { score, grade, verdict, axes, top, confidence, delta } = data;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-line bg-panel animate-rise">
      <div aria-hidden className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative flex flex-col md:flex-row md:items-center gap-5 p-5">
        <div className="flex items-center gap-4 md:w-[300px] shrink-0">
          <ScoreRing score={score} grade={grade} size={104} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-ink-400">
              <span className="font-medium text-ink-100">angar Score</span>
              {delta != null && delta !== 0 && (
                <span className={`tabular font-medium ${delta > 0 ? "text-steady" : "text-alarm"}`}>
                  {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}
                </span>
              )}
            </div>
            <div className="text-sm text-ink-100 mt-1 leading-snug">{verdict}</div>
            {confidence === "low" && <div className="text-xs text-ink-400 mt-1">Early estimate</div>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 min-w-0">
          {AXES.map((a) => (
            <AxisGauge key={a} label={AXIS_LABEL[a]} value={axes[a]} size={60} />
          ))}
        </div>
      </div>

      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-5 py-3 text-sm">
        {top ? (
          <Link href={top.href} className="flex-1 min-w-0 flex items-baseline gap-2 group">
            <span className="text-ink-400 shrink-0">Top way to improve</span>
            <span className="text-ink-100 truncate group-hover:underline">{top.label}</span>
            <span className="tabular text-accent font-medium shrink-0">+{formatPts(-top.scoreImpact)} pts</span>
          </Link>
        ) : (
          <span className="flex-1 text-ink-400">Nothing to fix right now.</span>
        )}
        <Link href="/score" className="text-ink-400 hover:text-ink-100 shrink-0">
          See details →
        </Link>
      </div>
    </section>
  );
}

export const formatPts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

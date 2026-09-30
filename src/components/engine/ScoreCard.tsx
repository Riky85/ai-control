import Link from "next/link";
import ScoreRing from "@/components/engine/ScoreRing";
import { LEVEL, levelOf } from "./score-level";
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

/** Barra di un asse, come quella dei prezzi di mercato: linea, tratto riempito e punto sul valore. */
export function AxisTrack({ value, className = "" }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const lv = LEVEL[levelOf(v)];
  return (
    <div className={`relative h-3 ${className}`} aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
      {[25, 50, 75].map((t) => (
        <div key={t} className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-line" style={{ left: `${t}%` }} />
      ))}
      <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink-100/20" style={{ width: `${v}%` }} />
      <div className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel ${lv.dot}`} style={{ left: `${Math.max(1.5, Math.min(98.5, v))}%` }} />
    </div>
  );
}

/**
 * Riquadro di un asse (cliccabile): nome, giudizio (Weak / Fair / Good / Strong),
 * valore e barra. Stesso linguaggio del blocco "What you pay vs the market".
 */
export function AxisGauge({ label, value, size = 64, href }: { label: string; value: number; size?: number; href?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const lv = LEVEL[levelOf(v)];
  if (!label) return <AxisTrack value={v} className="w-32" />;
  const big = size >= 70;
  const body = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-xs text-ink-400">{label}</span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${lv.pill}`}>{lv.label}</span>
      </div>
      <div className={`font-display font-semibold tabular text-ink-100 leading-tight mt-1 ${big ? "text-[26px]" : "text-[22px]"}`}>
        {v}
        <span className="text-[11px] font-normal text-ink-400 ml-0.5">/100</span>
      </div>
      <AxisTrack value={v} className="mt-2" />
    </>
  );
  const cls = "block min-w-0 rounded-xl border border-line bg-panel px-3.5 py-3 transition-colors";
  return href ? (
    <Link href={href} className={`${cls} hover:border-ink-400 hover:bg-ink-100/[0.02] group`} aria-label={`${label}: ${v} out of 100, ${lv.label}. See details`}>
      {body}
    </Link>
  ) : (
    <div className={cls} role="group" aria-label={`${label}: ${v} out of 100, ${lv.label}`}>
      {body}
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
            <AxisGauge key={a} label={AXIS_LABEL[a]} value={axes[a]} size={60} href={`/score#axis-${a}`} />
          ))}
        </div>
      </div>

      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-ink rounded-b-2xl px-5 py-3 text-sm">
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

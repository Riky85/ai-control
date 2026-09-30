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

/** Barretta di un asse: etichetta, valore e barra sottile. */
export function AxisBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-ink-400 truncate">{label}</span>
        <span className="tabular font-medium text-ink-100">{value}</span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-ink-100/[0.08] overflow-hidden">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

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

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-3 flex-1 min-w-0">
          {AXES.map((a) => (
            <AxisBar key={a} label={AXIS_LABEL[a]} value={axes[a]} />
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

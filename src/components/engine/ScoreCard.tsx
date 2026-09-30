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

/** Colore di un valore 0..100: verde buono, giallo da migliorare, rosso debole. */
export function levelColor(value: number) {
  return value >= 70 ? "rgb(var(--c-steady))" : value >= 45 ? "rgb(var(--c-signal))" : "rgb(var(--c-alarm))";
}

/** Anello di un asse: valore al centro, etichetta sotto. */
export function AxisGauge({ label, value, size = 64 }: { label: string; value: number; size?: number }) {
  const stroke = Math.max(4, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-ink-100/[0.08]" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke={levelColor(v)} strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.02, v / 100))} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display font-semibold tabular text-ink-100" style={{ fontSize: Math.round(size * 0.3) }}>
          {v}
        </span>
      </div>
      {label && <span className="text-xs text-ink-400 truncate max-w-full">{label}</span>}
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

        <div className="grid grid-cols-4 gap-3 flex-1 min-w-0 md:max-w-md md:ml-auto">
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

import { Pill } from "@/components/governance/parts";
import type { Strength } from "@/lib/engine/negotiate";

/**
 * Pezzi del dossier di rinnovo: forza negoziale e andamento settimanale
 * dell'uso (SVG in linea, stesso linguaggio di ForecastCard).
 */

const STRENGTH: Record<Strength, { label: string; tone: "steady" | "muted" | "signal"; bars: number }> = {
  strong: { label: "Strong position", tone: "steady", bars: 3 },
  fair: { label: "Fair position", tone: "muted", bars: 2 },
  weak: { label: "Weak position", tone: "signal", bars: 1 },
};

/** Forza negoziale: tre tacche + testo (mai solo colore). */
export function NegotiationStrength({ level, reasons }: { level: Strength; reasons: string[] }) {
  const s = STRENGTH[level];
  const dot = level === "strong" ? "bg-steady" : level === "weak" ? "bg-signal" : "bg-ink-100";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex items-end gap-0.5" aria-hidden>
          {[1, 2, 3].map((n) => (
            <span key={n} className={`w-1 rounded-full ${n <= s.bars ? dot : "bg-ink-100/10"}`} style={{ height: 4 + n * 3 }} />
          ))}
        </span>
        <Pill tone={s.tone}>{s.label}</Pill>
      </div>
      {reasons.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-ink-400">
          {reasons.map((r) => (
            <li key={r} className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-400" aria-hidden />
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const W = 320;
const H = 56;

/** Persone attive ogni settimana: linea sottile, ultimo punto evidenziato. */
export function UsageSpark({ weekly }: { weekly: number[] }) {
  if (weekly.every((v) => v === 0)) return <p className="text-xs text-ink-400">No weekly usage recorded yet.</p>;
  const max = Math.max(1, ...weekly) * 1.1;
  const x = (i: number) => (weekly.length <= 1 ? 0 : (i * W) / (weekly.length - 1));
  const y = (v: number) => 4 + (1 - v / max) * (H - 8);
  const line = weekly.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = weekly.length - 1;
  return (
    <div className="relative">
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14 overflow-visible" preserveAspectRatio="none" role="img" aria-label={`Active people each week: ${weekly.join(", ")}`}>
      <line x1="0" x2={W} y1={H - 4} y2={H - 4} className="stroke-line" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={line} fill="none" stroke="#FF7323" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {weekly.map((v, i) => (
        <rect key={i} x={x(i) - W / weekly.length / 2} y="0" width={W / weekly.length} height={H} fill="transparent">
          <title>{`${weekly.length - i === 1 ? "This week" : `${weekly.length - i - 1} weeks ago`}: ${v} active`}</title>
        </rect>
      ))}
    </svg>
      {/* Punto HTML: nell'SVG deformato un cerchio diventerebbe un'ellisse. */}
      <span className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-panel" style={{ left: `${(x(last) / W) * 100}%`, top: `${(y(weekly[last]) / H) * 100}%` }} aria-hidden />
    </div>
  );
}

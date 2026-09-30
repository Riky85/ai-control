import type { Grade } from "@/lib/engine/score-meta";

/**
 * Anello dell'angar Score: arco di 270° in arancio sfumato, punteggio grande
 * al centro e voto (A–E) sotto. Solo SVG, nessuno stato: va bene sul server.
 */
export default function ScoreRing({ score, grade, size = 200, label = true }: { score: number; grade: Grade; size?: number; label?: boolean }) {
  const s = Math.max(0, Math.min(100, score));
  const stroke = Math.max(6, Math.round(size * 0.065));
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75; // 270°
  const id = `score-ring-${size}`;
  const big = size >= 150;
  // Punta dell'arco: un punto luminoso dove finisce il punteggio.
  const angle = (135 + 270 * (s / 100)) * (Math.PI / 180);
  const tip = { x: size / 2 + r * Math.cos(angle), y: size / 2 + r * Math.sin(angle) };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`angar Score ${s} out of 100, grade ${grade}`}>
      <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-full bg-accent/25 blur-2xl" />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relative">
        <defs>
          <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#FF9A5C" />
            <stop offset="100%" stopColor="#FF7323" />
          </linearGradient>
        </defs>
        <g transform={`rotate(135 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" className="stroke-ink-100/10" strokeDasharray={`${arc} ${c}`} />
          {s > 0 && (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke={`url(#${id})`} strokeDasharray={`${arc * (s / 100)} ${c}`} />
          )}
        </g>
        {s > 0 && <circle cx={tip.x} cy={tip.y} r={stroke * 0.32} fill="white" opacity="0.9" />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`font-display font-semibold tracking-tight tabular text-ink-100 leading-none ${big ? "text-[64px]" : size >= 100 ? "text-[34px]" : "text-[24px]"}`}>{s}</div>
        {label && (
          <div className={`flex items-center gap-1.5 ${big ? "mt-2" : "mt-1"}`}>
            <span className={`rounded-md bg-accent/15 text-accent font-semibold ${big ? "text-sm px-2 py-0.5" : "text-[11px] px-1.5 leading-4"}`}>{grade}</span>
            {big && <span className="text-xs text-ink-400">out of 100</span>}
          </div>
        )}
      </div>
    </div>
  );
}

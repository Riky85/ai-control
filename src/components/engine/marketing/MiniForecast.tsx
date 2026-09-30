import { fmtEur } from "@/lib/format";

const W = 320;
const H = 88;
const PAD = { l: 4, r: 4, t: 8, b: 6 };

/**
 * Sparkline della previsione, stesso linguaggio della ForecastCard:
 * storico pieno, proiezione tratteggiata, fascia low–high, punto su "oggi".
 */
export default function MiniForecast({ history, projection, next12Eur, growthPct }: { history: { eur: number }[]; projection: { eur: number; low: number; high: number }[]; next12Eur: number; growthPct: number }) {
  const n = history.length + projection.length;
  const max = Math.max(1, ...history.map((h) => h.eur), ...projection.map((p) => p.high)) * 1.05;
  const min = Math.min(...history.map((h) => h.eur), ...projection.map((p) => p.low)) * 0.9;
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, n - 1);
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * (H - PAD.t - PAD.b);
  const off = history.length;
  const hist = history.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h.eur).toFixed(1)}`).join(" ");
  const proj = [`M${x(off - 1).toFixed(1)},${y(history[off - 1].eur).toFixed(1)}`, ...projection.map((p, i) => `L${x(off + i).toFixed(1)},${y(p.eur).toFixed(1)}`)].join(" ");
  const band = `${projection.map((p, i) => `${i ? "L" : "M"}${x(off + i).toFixed(1)},${y(p.high).toFixed(1)}`).join(" ")} ${[...projection]
    .map((p, i) => ({ p, i }))
    .reverse()
    .map(({ p, i }) => `L${x(off + i).toFixed(1)},${y(p.low).toFixed(1)}`)
    .join(" ")} Z`;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs text-ink-400">Next 12 months</div>
          <div className="font-display text-[22px] leading-none font-semibold tracking-tight tabular text-ink-100 mt-1">{fmtEur(next12Eur)}</div>
        </div>
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular text-signal bg-signal/10">▲ +{growthPct}% in a year</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full h-auto text-accent" role="img" aria-label={`Illustrative forecast: ${fmtEur(next12Eur)} over the next 12 months`}>
        <line x1={x(off - 0.5)} x2={x(off - 0.5)} y1={2} y2={H - 2} className="stroke-line" strokeDasharray="2 3" />
        <path d={band} fill="currentColor" opacity={0.12} />
        <path d={proj} fill="none" stroke="currentColor" strokeWidth={1.75} strokeDasharray="4 3.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={hist} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(off - 1)} cy={y(history[off - 1].eur)} r={3.5} fill="currentColor" className="stroke-panel" strokeWidth={2} />
      </svg>
    </div>
  );
}

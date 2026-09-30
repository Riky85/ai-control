/**
 * Uso negli ultimi 30 giorni: linea con area tenue, punto sull'ultimo giorno,
 * picco segnato, tooltip nativo per giorno. SVG scritto a mano, nessuna libreria
 * (stesso linguaggio del grafico "Next 12 months").
 */
const W = 640;
const H = 150;
const PAD = { l: 8, r: 8, t: 18, b: 22 };

const fmtN = (n: number) => Math.round(n).toLocaleString("en-GB");

export default function UsageChart({ values, labels, unit = "visits", weekChange }: { values: number[]; labels: string[]; unit?: string; weekChange: number | null }) {
  const n = values.length;
  const total = values.reduce((t, v) => t + v, 0);
  const max = Math.max(1, ...values) * 1.12;
  const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = n > 1 ? `${line} L${x(n - 1).toFixed(1)},${H - PAD.b} L${x(0).toFixed(1)},${H - PAD.b} Z` : "";
  const peak = values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
  const step = n > 1 ? (W - PAD.l - PAD.r) / (n - 1) : W;
  const avg = n ? total / n : 0;
  const up = (weekChange ?? 0) > 0;
  const summary = `${fmtN(total)} ${unit} in the last ${n} days${weekChange != null ? `, ${weekChange >= 0 ? "+" : ""}${weekChange}% vs the week before` : ""}.`;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-line bg-panel animate-rise" aria-labelledby="usage-chart-title">
      {/* Barra grigia in alto con il titolo. */}
      <div className="bg-ink border-b border-line rounded-t-2xl px-5 py-3 text-sm bar-head">
        <h2 id="usage-chart-title" className="font-semibold text-ink-100">
          Last {n} days
        </h2>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4 px-5 pt-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[30px] leading-none font-semibold tracking-tight tabular text-ink-100">{fmtN(total)}</span>
            <span className="text-sm text-ink-400">{unit}</span>
          </div>
        </div>
        {weekChange != null && (
          <div className="sm:text-right">
            <div className={`font-display text-lg font-semibold tabular leading-none ${weekChange === 0 ? "text-ink-100" : up ? "text-steady" : "text-signal"}`}>
              <span aria-hidden>{weekChange === 0 ? "" : up ? "▲ " : "▼ "}</span>
              {weekChange > 0 ? "+" : ""}
              {weekChange}%
            </div>
            <div className="text-xs text-ink-400 mt-1">last 7 days vs the week before</div>
          </div>
        )}
      </div>

      <figure className="px-5 pt-3 pb-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto text-accent" role="img" aria-label={summary}>
          <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="stroke-line" strokeWidth={1} />
          {avg > 0 && <line x1={PAD.l} x2={W - PAD.r} y1={y(avg)} y2={y(avg)} className="stroke-line" strokeDasharray="2 4" strokeWidth={1} />}
          {area && <path d={area} fill="currentColor" opacity={0.1} />}
          {n > 1 && <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
          {n > 0 && values[peak] > 0 && peak !== n - 1 && (
            <>
              <circle cx={x(peak)} cy={y(values[peak])} r={2.5} fill="currentColor" />
              <text x={x(peak)} y={y(values[peak]) - 7} textAnchor={peak < 3 ? "start" : peak > n - 4 ? "end" : "middle"} className="fill-ink-400 text-[11px] tabular">
                {fmtN(values[peak])}
              </text>
            </>
          )}
          {n > 0 && <circle cx={x(n - 1)} cy={y(values[n - 1])} r={4} fill="currentColor" className="stroke-panel" strokeWidth={2} />}
          {n > 0 && (
            <text x={x(0)} y={H - 6} className="fill-ink-400 text-[11px]">
              {labels[0]}
            </text>
          )}
          {n > 2 && (
            <text x={x(Math.floor((n - 1) / 2))} y={H - 6} textAnchor="middle" className="fill-ink-400 text-[11px]">
              {labels[Math.floor((n - 1) / 2)]}
            </text>
          )}
          {n > 1 && (
            <text x={x(n - 1)} y={H - 6} textAnchor="end" className="fill-ink-100 text-[11px] font-medium">
              Today
            </text>
          )}
          {values.map((v, i) => (
            <rect key={i} x={x(i) - step / 2} y={0} width={step} height={H - PAD.b} fill="transparent" className="hover:fill-ink-100/[0.04]">
              <title>{`${labels[i] ?? ""}: ${fmtN(v)} ${unit}`}</title>
            </rect>
          ))}
        </svg>
        <figcaption className="flex items-center gap-4 text-[11px] text-ink-400 mt-1">
          <span className="flex items-center gap-1.5" aria-hidden>
            <svg width="16" height="4" className="text-accent">
              <path d="M0 2h16" stroke="currentColor" strokeWidth="2" />
            </svg>
            {unit[0].toUpperCase() + unit.slice(1)} each day
          </span>
          <span className="flex items-center gap-1.5" aria-hidden>
            <svg width="16" height="4">
              <path d="M0 2h16" className="stroke-ink-400" strokeWidth="1" strokeDasharray="2 3" />
            </svg>
            Daily average {fmtN(avg)}
          </span>
          <span className="sr-only">{summary}</span>
        </figcaption>
      </figure>
    </section>
  );
}

"use client";

import { useRef, useState } from "react";

export interface LineSeries {
  name: string;
  values: number[];
  /** "main" = arancio pieno; "ghost" = grigio tratteggiato (proiezione). */
  style?: "main" | "ghost";
}

/**
 * Grafico a linee semplice: una scala, linee sottili, griglia leggera,
 * etichetta diretta sull'ultimo punto, crosshair + tooltip al passaggio.
 */
export default function LineChart({ labels, series, format = (v) => String(v), height = 220 }: { labels: string[]; series: LineSeries[]; format?: (v: number) => string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 800;
  const H = height;
  const pad = { l: 56, r: 96, t: 16, b: 28 };
  const max = Math.max(1, ...series.flatMap((s) => s.values)) * 1.1;
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const x = (i: number) => pad.l + (labels.length <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (labels.length - 1));
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 0; i < labels.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  };

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={series.map((s) => `${s.name}: ${s.values.map(format).join(", ")}`).join("; ")}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--c-line))" strokeWidth={1} />
            <text x={pad.l - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--c-muted))">{format(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => (
          <text key={l + i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="rgb(var(--c-muted))">{l}</text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="rgb(var(--c-muted))" strokeOpacity={0.5} strokeWidth={1} />}
        {series.map((s) => {
          const main = s.style !== "ghost";
          const last = s.values.length - 1;
          return (
            <g key={s.name}>
              <path d={path(s.values)} fill="none" stroke={main ? "#FF7323" : "rgb(var(--c-muted))"} strokeWidth={2} strokeDasharray={main ? undefined : "5 5"} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => (hover === i || i === last) && (
                <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={main ? "#FF7323" : "rgb(var(--c-muted))"} stroke="rgb(var(--c-panel))" strokeWidth={2} />
              ))}
              <text x={x(last) + 10} y={y(s.values[last]) + 4} fontSize="11" fill="rgb(var(--c-text))">{s.name}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-line bg-panel shadow-xl px-3 py-2 text-xs"
          style={{ left: `calc(${(x(hover) / W) * 100}% + ${x(hover) > W * 0.6 ? "-170px" : "12px"})` }}
        >
          <div className="font-medium text-ink-100 mb-1">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-4 text-ink-400">
              <span className="flex items-center gap-1.5">
                <span className={`inline-block w-3 h-0.5 ${s.style === "ghost" ? "bg-ink-400" : "bg-accent"}`} />
                {s.name}
              </span>
              <span className="tabular text-ink-100">{format(s.values[hover])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function niceTicks(max: number) {
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v * 100) / 100);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

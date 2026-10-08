import Link from "next/link";
import { forecastSpend, monthLabel } from "@/lib/engine/forecast";
import { fmtEur } from "@/lib/format";

export interface ForecastCardProps {
  history: { month: string; eur: number }[];
  projection: { month: string; eur: number; low: number; high: number }[];
  next12Eur: number;
  growthPct: number;
  runRateEur: number;
  drivers: string[];
}

export async function loadForecastCard(orgId: string): Promise<ForecastCardProps> {
  const f = await forecastSpend(orgId, 12);
  return { history: f.history, projection: f.projection, next12Eur: f.next12Eur, growthPct: f.growthPct, runRateEur: f.runRateEur, drivers: f.drivers };
}

const W = 640;
const H = 168;
const PAD = { l: 8, r: 8, t: 14, b: 22 };

const short = (key: string) => monthLabel(key).slice(0, 3);
const compact = (n: number) => (n >= 10000 ? `€${Math.round(n / 1000)}k` : n >= 1000 ? `€${(n / 1000).toFixed(1)}k` : fmtEur(n));

/**
 * Previsione della spesa AI: storico pieno, proiezione tratteggiata con fascia
 * low–high, totale dei prossimi 12 mesi, crescita e i motivi principali.
 * Server component: il tooltip di ogni mese è il <title> SVG nativo.
 */
export default function ForecastCard({ history, projection, next12Eur, growthPct, runRateEur, drivers }: ForecastCardProps) {
  const empty = history.length === 0 && runRateEur <= 0;
  const hist = history.slice(-12);
  const proj = projection.slice(0, 12);
  const n = hist.length + proj.length;
  const max = Math.max(1, ...hist.map((h) => h.eur), ...proj.map((p) => p.high)) * 1.08;
  const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const line = (pts: [number, number][]) => pts.map(([a, b], i) => `${i ? "L" : "M"}${x(a).toFixed(1)},${y(b).toFixed(1)}`).join(" ");
  const off = hist.length;
  const histPath = line(hist.map((h, i) => [i, h.eur]));
  // La proiezione parte dall'ultimo mese reale, così le due linee si toccano.
  const projPts: [number, number][] = [...(hist.length ? [[off - 1, hist[off - 1].eur] as [number, number]] : []), ...proj.map((p, i) => [off + i, p.eur] as [number, number])];
  const band =
    proj.length > 0
      ? `${proj.map((p, i) => `${i ? "L" : "M"}${x(off + i).toFixed(1)},${y(p.high).toFixed(1)}`).join(" ")} ${[...proj]
          .map((p, i) => ({ p, i }))
          .reverse()
          .map(({ p, i }) => `L${x(off + i).toFixed(1)},${y(p.low).toFixed(1)}`)
          .join(" ")} Z`
      : "";
  const all = [...hist.map((h) => ({ month: h.month, text: `${monthLabel(h.month)}: ${fmtEur(h.eur)}` })), ...proj.map((p) => ({ month: p.month, text: `${monthLabel(p.month)}: ${fmtEur(p.eur)} forecast (${fmtEur(p.low)} to ${fmtEur(p.high)})` }))];
  const step = n > 1 ? (W - PAD.l - PAD.r) / (n - 1) : W;
  const up = growthPct > 0;
  const summary = `AI spend forecast: ${fmtEur(next12Eur)} over the next 12 months, ${growthPct >= 0 ? "+" : ""}${growthPct}% in 12 months.`;

  return (
    <section className="relative overflow-hidden rounded-xl border border-line bg-panel animate-rise" aria-labelledby="forecast-title">
      {/* Barra grigia in alto: titolo e legenda del grafico. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-ink border-b border-line rounded-t-xl px-5 py-3 text-sm bar-head">
        <h2 id="forecast-title" className="font-bold text-ink-100">Next 12 months</h2>
        {!empty && (
          <div className="flex items-center gap-4 text-[11px] text-ink-400" aria-hidden>
            <span className="flex items-center gap-1.5"><svg width="16" height="4" className="text-ink-100"><path d="M0 2h16" stroke="currentColor" strokeWidth="2" /></svg>Actual</span>
            <span className="flex items-center gap-1.5"><svg width="16" height="4" className="text-ink-100"><path d="M0 2h16" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" /></svg>Forecast</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-ink-100/10" />Likely range</span>
          </div>
        )}
      </div>
      <div className="relative flex flex-wrap items-end justify-between gap-4 px-5 pt-4">
        <div>
          <div className="font-display text-[26px] leading-none font-semibold tracking-tight tabular text-ink-100">{empty ? "—" : fmtEur(next12Eur)}</div>
        </div>
        {!empty && (
          <div className="text-right">
            <div className={`font-display text-lg font-semibold tabular leading-none ${growthPct === 0 ? "text-ink-100" : up ? "text-signal" : "text-steady"}`}>
              <span aria-hidden>{growthPct === 0 ? "" : up ? "▲ " : "▼ "}</span>
              {growthPct > 0 ? "+" : ""}
              {growthPct}%
            </div>
            <div className="text-xs text-ink-400 mt-1">monthly spend in a year</div>
          </div>
        )}
      </div>

      {empty ? (
        <p className="relative px-5 py-8 text-sm text-ink-400">
          No spend history yet. <Link href="/sources" className="underline hover:text-ink-100">Add costs</Link>
        </p>
      ) : (
        <figure className="relative px-5 pt-3">
          {/* Il disegno si allarga con il blocco (linee a spessore fisso); scritte e punto sono HTML sopra, così restano nitidi. */}
          <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-44 text-ink-100" role="img" aria-label={summary}>
            <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="stroke-line" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {hist.length > 0 && proj.length > 0 && <line x1={x(off - 0.5)} x2={x(off - 0.5)} y1={PAD.t - 6} y2={H - PAD.b} className="stroke-line" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />}
            {band && <path d={band} fill="currentColor" opacity={0.12} />}
            {projPts.length > 1 && <path d={line(projPts)} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
            {hist.length > 1 && <path d={histPath} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
            {/* Aree di passaggio: tooltip nativo per ogni mese. */}
            {all.map((m, i) => (
              <rect key={m.month} x={x(i) - step / 2} y={0} width={step} height={H} fill="transparent" className="hover:fill-ink-100/[0.04]">
                <title>{m.text}</title>
              </rect>
            ))}
          </svg>
          {/* Punto di oggi e valore finale, in HTML sopra il disegno. */}
          {hist.length > 0 && (
            <span aria-hidden className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-100 ring-2 ring-panel" style={{ left: `${(x(off - 1) / W) * 100}%`, top: `${(y(hist[off - 1].eur) / H) * 100}%` }} />
          )}
          {proj.length > 0 && (
            <span aria-hidden className="absolute right-0 -translate-y-full text-[11px] text-ink-400 tabular" style={{ top: `${(Math.max(PAD.t + 10, y(proj[proj.length - 1].high)) / H) * 100}%` }}>
              {compact(proj[proj.length - 1].eur)}
            </span>
          )}
          </div>
          {/* Etichette dell'asse: primo mese, "Now", ultimo mese — mai sovrapposte. */}
          <div aria-hidden className="relative h-5 mt-1 text-[11px]">
            {n > 0 && off > 0 && (x(off) - x(0)) / W > 0.12 && <span className="absolute left-0 text-ink-400">{short(all[0].month)}</span>}
            {proj.length > 0 && (
              <span className={`absolute font-medium text-ink-100 ${off === 0 ? "left-0" : "-translate-x-1/2"}`} style={off === 0 ? undefined : { left: `${(x(off) / W) * 100}%` }}>
                Now
              </span>
            )}
            {n > 1 && (x(n - 1) - x(off)) / W > 0.14 && <span className="absolute right-0 text-ink-400">{monthLabel(all[n - 1].month)}</span>}
          </div>
          <figcaption className="sr-only">
            <table>
              <caption>{summary}</caption>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Spend</th>
                  <th>Low</th>
                  <th>High</th>
                </tr>
              </thead>
              <tbody>
                {hist.map((h) => (
                  <tr key={h.month}>
                    <td>{monthLabel(h.month)}</td>
                    <td>{fmtEur(h.eur)}</td>
                    <td />
                    <td />
                  </tr>
                ))}
                {proj.map((p) => (
                  <tr key={p.month}>
                    <td>{monthLabel(p.month)} (forecast)</td>
                    <td>{fmtEur(p.eur)}</td>
                    <td>{fmtEur(p.low)}</td>
                    <td>{fmtEur(p.high)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </figcaption>
        </figure>
      )}

      {!empty && drivers.length > 0 && (
        <ul className="relative mt-4 bg-ink border-t border-line rounded-b-xl px-5 py-3 flex flex-col gap-1.5 text-xs text-ink-400 bar-foot">
          {drivers.slice(0, 3).map((d) => (
            <li key={d} className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-400" aria-hidden />
              <span>{d}</span>
            </li>
          ))}
        </ul>
      )}
      {!empty && drivers.length === 0 && <div className="h-4" />}
    </section>
  );
}

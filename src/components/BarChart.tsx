/**
 * Grafico a barre orizzontali, minimale, senza dipendenze esterne — stesso
 * principio di AssetGraph.tsx: SVG scritto a mano, coerente con la palette
 * dell'app, niente libreria di charting da aggiungere per un solo grafico.
 */
export interface BarChartRow {
  label: string;
  value: number;
}

export default function BarChart({ rows, formatValue }: { rows: BarChartRow[]; formatValue?: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const fmt = formatValue ?? ((v: number) => v.toLocaleString());

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="w-28 shrink-0 text-xs text-ink-400 truncate">{r.label}</div>
          <div className="flex-1 h-5 bg-ink rounded-full overflow-hidden">
            <div
              className="h-full bg-ink-100 rounded-full"
              style={{ width: `${Math.max((r.value / max) * 100, 4)}%` }}
            />
          </div>
          <div className="w-20 shrink-0 text-xs text-ink-100 text-right tabular">{fmt(r.value)}</div>
        </div>
      ))}
    </div>
  );
}

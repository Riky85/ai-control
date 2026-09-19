/**
 * Grafico a ciambella, SVG scritto a mano — stesso principio di BarChart e
 * AssetGraph: nessuna libreria esterna per un solo grafico. Ispirato al
 * pattern "Vendors by Criticality" di OneTrust: anello colorato con legenda
 * a fianco, numero totale al centro.
 */
export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export default function DonutChart({ slices, centerLabel }: { slices: DonutSlice[]; centerLabel?: string }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  const radius = 40;
  const stroke = 14;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <svg width="100" height="100" viewBox="0 0 100 100" className="shrink-0 -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#EAE8E3" strokeWidth={stroke} />
        {slices.map((s, i) => {
          const fraction = s.value / total;
          const dash = fraction * circumference;
          const dashOffset = -offset;
          offset += dash;
          return (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={dashOffset}
            />
          );
        })}
      </svg>
      <div className="flex flex-col gap-1.5">
        {centerLabel && <div className="text-xs text-ink-400 mb-1">{centerLabel}</div>}
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-ink-100">{s.label}</span>
            <span className="text-ink-400">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";

/**
 * Ciambella più moderna: anello sottile con estremità arrotondate e un
 * piccolo distacco tra le fette (non più segmenti che si toccano), numero
 * totale grande al centro, legenda con percentuale reale e — se una fetta
 * ha un href — cliccabile verso la vista filtrata corrispondente.
 */
export interface DonutSlice {
  label: string;
  value: number;
  color: string;
  href?: string;
}

export default function DonutChart({ slices, centerLabel }: { slices: DonutSlice[]; centerLabel?: string }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  const radius = 42;
  const stroke = 11;
  const circumference = 2 * Math.PI * radius;
  const gap = slices.length > 1 ? 3 : 0;
  let offset = 0;

  return (
    <div className="flex items-center gap-7">
      <div className="relative shrink-0 animate-rise">
        <svg width="112" height="112" viewBox="0 0 100 100" className="-rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgb(var(--c-line))" strokeWidth={stroke} />
          {slices.map((s, i) => {
            const fraction = s.value / total;
            const dash = Math.max(fraction * circumference - gap, 0);
            const dashOffset = -offset;
            offset += fraction * circumference;
            return (
              <circle
                key={i}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={dashOffset}
                className="transition-all duration-300"
              />
            );
          })}
        </svg>
        {centerLabel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-lg font-bold text-ink-100 leading-none">{total}</span>
            <span className="text-[9px] text-ink-400 mt-0.5">{centerLabel}</span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {slices.map((s, i) => {
          const pct = Math.round((s.value / total) * 100);
          const row = (
            <div className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-ink-100 font-medium">{s.label}</span>
              <span className="text-ink-400">{s.value} · {pct}%</span>
            </div>
          );
          return s.href ? (
            <Link key={i} href={s.href} className="hover:opacity-70 transition-opacity">
              {row}
            </Link>
          ) : (
            <div key={i}>{row}</div>
          );
        })}
      </div>
    </div>
  );
}

import Link from "next/link";

/** Card statistica condivisa da tutte le pagine — nessun hover, solo link se serve. */
export function StatCard({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  tone?: "signal" | "alarm" | "accent";
}) {
  const color = "text-ink-100";
  const dot = tone === "signal" ? "bg-signal" : tone === "alarm" ? "bg-alarm" : null;
  const inner = (
    <>
      <div className="text-sm text-ink-400 flex items-center gap-1.5">
        {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
        {label}
      </div>
      <div>
        <div className={`font-display text-[30px] leading-none font-semibold tracking-tight tabular ${color}`}>{value}</div>
        {hint && <div className="text-xs text-ink-400 mt-1.5 truncate">{hint}</div>}
      </div>
    </>
  );
  const cls = "rounded-xl border border-line bg-panel p-5 min-h-[112px] flex flex-col justify-between gap-4 animate-rise";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Contenitore per grafici e sezioni — titolo, sottotitolo, azione opzionale. */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-panel p-5 animate-rise ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-ink-100">{title}</h2>
          {subtitle && <p className="text-sm text-ink-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink-100">{title}</h1>
        {subtitle && <p className="text-sm text-ink-400 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Tabella standard della piattaforma — stessa grafica di AI Passports ovunque:
 * contenitore bordato, intestazione grigia, righe divise, prima colonna con logo.
 */
export function Table({ columns, children, empty }: { columns: (string | { label: string; className?: string })[]; children: React.ReactNode; empty?: string | false }) {
  return (
    <div className="rounded-xl border border-line bg-panel overflow-hidden animate-rise">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-400 bg-ink border-b border-line">
            {columns.map((c, i) => {
              const col = typeof c === "string" ? { label: c } : c;
              return (
                <th key={i} className={`px-5 py-2.5 font-medium ${col.className ?? ""}`}>
                  {col.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {children}
          {empty && (
            <tr>
              <td colSpan={columns.length} className="px-5 py-8 text-center text-sm text-ink-400">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export const td = "px-5 py-3";

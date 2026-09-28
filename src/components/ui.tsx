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
  const color = tone === "accent" ? "text-accent" : "text-ink-100";
  const dot = tone === "signal" ? "bg-signal" : tone === "alarm" ? "bg-alarm" : null;
  const inner = (
    <>
      <div className="text-sm text-ink-400 flex items-center gap-2">
        {dot && <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />}
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
    <Link href={href} className={`${cls} hover:border-ink-400 transition-colors`}>
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

/**
 * Intestazione standard di ogni pagina: percorso opzionale, titolo,
 * sottotitolo, azioni a destra — e sempre il pulsante documentazione.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  crumbs,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  crumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="flex flex-wrap lg:flex-nowrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav className="text-sm text-ink-400 mb-2 flex items-center gap-1.5">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>/</span>}
                {c.href ? <Link href={c.href} className="hover:text-ink-100 hover:underline">{c.label}</Link> : <span>{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink-100 break-words lg:truncate">{title}</h1>
        {subtitle && <p className="text-sm text-ink-400 mt-1">{subtitle}</p>}
      </div>
      {/* Su schermi grandi le azioni stanno a sinistra dei pulsanti fissi del layout (avvisi, computer,
          documentazione); su schermi piccoli quei pulsanti hanno una riga loro sopra la pagina. */}
      <div className="flex flex-wrap items-center gap-2 shrink-0 lg:pr-[8.25rem] min-h-9">{action}</div>
    </div>
  );
}

/**
 * Tabella standard della piattaforma — stessa grafica di AI Passports ovunque:
 * contenitore bordato, intestazione grigia, righe divise, prima colonna con logo.
 */
export function Table({ columns, children, empty }: { columns: (string | { label: string; className?: string })[]; children: React.ReactNode; empty?: string | false }) {
  return (
    <div className="rounded-xl border border-line bg-panel overflow-x-auto animate-rise">
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

/**
 * Schede standard della piattaforma — stesso stile ovunque (Passaporto,
 * Governance, Activity, Workspace): pillola neutra, attiva bianca con ombra.
 */
export function Tabs({ items, active }: { items: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <div className="inline-flex gap-1 bg-ink rounded-lg p-1 w-fit">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`text-sm px-3.5 py-1.5 rounded-md transition-colors ${
            active === t.key ? "bg-panel text-ink-100 font-medium shadow-card" : "text-ink-400 hover:text-ink-100"
          }`}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-ink-400 tabular">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}

/** Avviso standard (errore, conferma, informazione) — stessa grafica ovunque. */
const NOTICE_TONE = {
  error: "rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm",
  success: "rounded-xl bg-steady/10 px-4 py-3 text-sm text-steady",
  info: "rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-100",
} as const;

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: React.ReactNode }) {
  return <div className={NOTICE_TONE[tone]}>{children}</div>;
}

/**
 * Riga informativa della home (Saved so far, Benchmark…): stessa grafica per
 * tutte — riquadro icona, titolo, valore opzionale, testo, azione o freccia.
 */
export function InfoStrip({
  icon,
  tone = "accent",
  title,
  value,
  text,
  href,
  action,
}: {
  icon: React.ReactNode;
  tone?: "accent" | "steady";
  title: string;
  value?: React.ReactNode;
  text?: React.ReactNode;
  href?: string;
  action?: React.ReactNode;
}) {
  const inner = (
    <>
      <span className={`h-8 w-8 shrink-0 rounded-lg border border-line bg-ink-100/[0.04] flex items-center justify-center ${tone === "steady" ? "text-steady" : "text-accent"}`}>{icon}</span>
      <span className="flex-1 min-w-0 flex items-baseline gap-2 text-sm">
        <span className="font-medium text-ink-100 shrink-0">{title}</span>
        {value && <span className="font-display font-semibold tabular text-ink-100 shrink-0">{value}</span>}
        {text && <span className="text-ink-400 truncate">{text}</span>}
      </span>
      {action ?? (href ? <span className="text-sm text-ink-400 shrink-0">→</span> : null)}
    </>
  );
  const cls = "rounded-xl border border-line bg-panel px-4 py-3 flex items-center gap-3 animate-rise";
  return href && !action ? (
    <Link href={href} className={`${cls} hover:border-ink-400 transition-colors`}>
      {inner}
    </Link>
  ) : (
    <section className={cls}>{inner}</section>
  );
}

import Link from "next/link";
import AreaTabs from "./AreaTabs";

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
  tone?: "signal" | "alarm" | "warn";
}) {
  // Stile Exein: etichetta in mono maiuscolo, numero grande e sottile. L'arancio
  // compare solo come segnale ("warn" = da guardare): riquadro arancio leggero.
  const warn = tone === "warn" || tone === "signal";
  const dot = tone === "alarm" ? "bg-alarm" : null;
  const inner = (
    <>
      <div className={`eyebrow flex items-center gap-2 ${warn ? "!text-accent" : ""}`}>
        {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />}
        {label}
      </div>
      <div>
        <div className={`font-display text-[30px] leading-none font-light tracking-[-0.03em] tabular ${warn ? "text-accent" : "text-ink-100"}`}>{value}</div>
        {hint && <div className="text-xs text-ink-400 mt-2 truncate">{hint}</div>}
      </div>
    </>
  );
  const cls = `rounded-xl border border-line bg-panel p-5 min-h-[112px] flex flex-col justify-between gap-4 animate-rise ${warn ? "tile-warn" : ""}`;
  return href ? (
    <Link href={href} className={`${cls} hover:border-ink-400 transition-colors`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/**
 * Barre grigie della piattaforma — regola della casa: ogni tabella o blocco ha
 * una barra grigia in alto (titolo) o in basso (azioni, totali, link), come il
 * piè della card angar Score e l'intestazione delle tabelle.
 */
export const BAR_HEAD = "bg-ink border-b border-line px-5 py-3 text-sm bar-head";
export const BAR_FOOT = "bg-ink border-t border-line px-5 py-3 text-sm bar-foot";

/** Barra grigia in alto: titolo a sinistra, nota/legenda e azione a destra. */
export function BlockHead({
  title,
  note,
  action,
  id,
  className = "",
  rounded = "rounded-t-xl",
}: {
  title: React.ReactNode;
  note?: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  className?: string;
  rounded?: string;
}) {
  return (
    <div className={`${BAR_HEAD} ${rounded} flex flex-wrap items-center justify-between gap-x-4 gap-y-1 ${className}`}>
      <h2 id={id} className="text-sm font-bold text-ink-100 min-w-0">
        {title}
      </h2>
      {(note || action) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          {note && <span className="eyebrow min-w-0">{note}</span>}
          {action}
        </div>
      )}
    </div>
  );
}

/** Barra grigia in basso: link, totali, pulsanti. */
export function BlockFoot({ children, className = "", rounded = "rounded-b-xl" }: { children: React.ReactNode; className?: string; rounded?: string }) {
  return <div className={`${BAR_FOOT} ${rounded} flex flex-wrap items-center gap-x-4 gap-y-2 ${className}`}>{children}</div>;
}

/**
 * Contenitore per grafici e sezioni — barra grigia col titolo, corpo, piè opzionale.
 * Con `flush` il corpo non ha margini interni (elenchi a tutta larghezza).
 */
export function Panel({
  title,
  subtitle,
  action,
  children,
  footer,
  flush,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-panel animate-rise flex flex-col ${className}`}>
      <BlockHead title={title} note={subtitle} action={action} />
      <div className={`flex-1 ${flush ? "" : "p-5"}`}>{children}</div>
      {footer && <BlockFoot>{footer}</BlockFoot>}
    </div>
  );
}

/**
 * Intestazione standard di ogni pagina, in stile Exa: una barra in alto a tutta
 * larghezza (bordo sotto, appiccicosa durante lo scroll da tablet in su) con titolo piccolo,
 * sottotitolo tenue sulla stessa riga e azioni a destra. I pulsanti fissi del
 * layout (avvisi, voce, documentazione) stanno nella stessa barra, all'estrema
 * destra: qui si lascia loro lo spazio (--hdr-tools). Sotto la barra, le schede
 * dell'area corrente. Il contenuto parte sotto.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  crumbs,
  icon,
  meta,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  crumbs?: { label: string; href?: string }[];
  /** Piccolo elemento prima del titolo (es. logo del fornitore). */
  icon?: React.ReactNode;
  /** Controllo accanto al titolo (es. stato dell'AI). */
  meta?: React.ReactNode;
}) {
  // Nel percorso solo i livelli superiori (con link): l'ultimo è già il titolo.
  const parents = (crumbs ?? []).filter((c) => c.href);
  return (
    <>
      <header
        className={`page-bar relative sm:sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-10 px-4 sm:px-6 lg:px-10 print:static print:mx-0 print:px-0
          before:content-[''] before:absolute before:inset-y-0 before:-left-[100vw] before:-right-[100vw] before:-z-10 before:bg-panel before:border-b before:border-line print:before:hidden`}
      >
        {/* Spazio a destra per i pulsanti fissi del layout (--hdr-tools) più un piccolo respiro. */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:gap-6 lg:pr-[calc(var(--hdr-tools,7rem)+0.75rem)]">
          <div className="h-14 flex items-center gap-2.5 min-w-0 lg:flex-1 pr-[calc(var(--hdr-tools,7rem)+0.75rem)] lg:pr-0">
            {icon && <span className="shrink-0 flex items-center">{icon}</span>}
            {parents.length > 0 && (
              <nav className="hidden sm:flex items-center gap-2 text-[14px] text-ink-400 shrink-0">
                {parents.map((c, i) => (
                  <span key={i} className="flex items-center gap-2">
                    <Link href={c.href!} className="hover:text-ink-100 transition-colors">{c.label}</Link>
                    <span aria-hidden className="text-ink-400/60">/</span>
                  </span>
                ))}
              </nav>
            )}
            <h1 className="text-[15px] leading-tight font-semibold tracking-[-0.01em] text-ink-100 truncate min-w-0 shrink">{title}</h1>
            {meta && <span className="shrink-0 hidden sm:flex items-center">{meta}</span>}
            {subtitle && <p className="hidden sm:block ml-1 pl-3.5 border-l border-line text-[13px] leading-5 text-ink-400 truncate min-w-0">{subtitle}</p>}
          </div>
          {(subtitle || meta) && (
            <div className="sm:hidden -mt-2 pb-3 flex flex-col items-start gap-2 text-sm text-ink-400 min-w-0">
              {subtitle && <p className="truncate max-w-full">{subtitle}</p>}
              {meta}
            </div>
          )}
          {action && <div className="flex flex-wrap items-center gap-2 shrink-0 pb-3 lg:pb-0 lg:h-14 [&_.btn]:h-8 [&_.btn-icon]:w-8">{action}</div>}
        </div>
      </header>
      <AreaTabs />
    </>
  );
}

/**
 * Tabella standard della piattaforma — stessa grafica di AI Passports ovunque:
 * contenitore bordato, intestazione grigia, righe divise, prima colonna con logo.
 * Opzionali: barra grigia col titolo (con nota e azione), una riga di filtri
 * sotto il titolo e una barra grigia in basso (note, totali, link).
 */
export function Table({
  columns,
  children,
  empty,
  footer,
  title,
  note,
  action,
  toolbar,
  id,
  band = false,
}: {
  columns: (string | { label: string; className?: string })[];
  children: React.ReactNode;
  empty?: string | false;
  footer?: React.ReactNode;
  title?: React.ReactNode;
  note?: React.ReactNode;
  action?: React.ReactNode;
  toolbar?: React.ReactNode;
  id?: string;
  /** Titolo, ricerca, filtri e azione in un'unica fascia (trasparente, vedi globals.css), fusa con la riga delle colonne. */
  band?: boolean;
}) {
  const top = title || toolbar;
  return (
    <div id={id} className="rounded-xl border border-line bg-panel animate-rise scroll-mt-6">
      {band ? (
        <div className="bg-ink bar-head rounded-t-xl px-5 pt-3 pb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {title && <h2 className="text-sm font-bold text-ink-100 shrink-0">{title}</h2>}
          {action && <div className="shrink-0 flex items-center gap-2 ml-auto sm:order-last">{action}</div>}
          {toolbar && <div className="w-full sm:w-auto sm:flex-1 min-w-0">{toolbar}</div>}
        </div>
      ) : (
        <>
          {title && <BlockHead title={title} note={note} action={action} />}
          {toolbar && <div className={`px-5 py-3 border-b border-line ${title ? "" : "rounded-t-xl"}`}>{toolbar}</div>}
        </>
      )}
      <div className={`overflow-x-auto ${top ? "" : "rounded-t-xl"} ${footer ? "" : "rounded-b-xl"}`}>
      <table className="w-full text-sm">
        <thead>
          {/* La riga delle colonne è la fascia grigia della tabella: titolo e piede restano chiari (globals.css). */}
          <tr className="bar-thead text-left font-mono uppercase text-[11px] tracking-[0.04em] text-ink-400 bg-ink border-b border-line">
            {columns.map((c, i) => {
              const col = typeof c === "string" ? { label: c } : c;
              return (
                <th key={i} className={`px-5 py-2.5 font-normal ${col.className ?? ""}`}>
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
      {footer && <BlockFoot>{footer}</BlockFoot>}
    </div>
  );
}

export const td = "px-5 py-3";

/** Stato vuoto standard: una riga breve e (al massimo) un pulsante. */
export function EmptyState({ text, action, className = "" }: { text: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-panel px-5 py-8 flex flex-col items-center gap-3 text-center ${className}`}>
      <p className="text-sm text-ink-400">{text}</p>
      {action}
    </div>
  );
}

/**
 * Schede standard della piattaforma — stesso stile ovunque (Passaporto,
 * Governance, Activity, Workspace): pillola neutra, attiva bianca con ombra.
 */
export function Tabs({ items, active }: { items: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <div className="inline-flex gap-1 bg-ink-100/[0.06] dark:bg-ink rounded-lg p-1 w-fit max-w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`shrink-0 whitespace-nowrap text-sm px-3.5 py-1.5 rounded-md transition-colors ${
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
  info: "rounded-xl border border-line bg-panel dark:bg-ink px-4 py-3 text-sm text-ink-100",
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
      <span className={`h-8 w-8 shrink-0 rounded-lg border border-line bg-ink-100/[0.04] flex items-center justify-center ${tone === "steady" ? "text-steady" : "text-ink-100"}`}>{icon}</span>
      <span className="flex-1 min-w-0 flex items-baseline gap-2 text-sm">
        <span className="font-bold text-ink-100 shrink-0">{title}</span>
        {value && <span className="font-display font-light tabular text-ink-100 shrink-0">{value}</span>}
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

/**
 * Mattoni comuni delle pagine di impostazioni (Settings, Workspace, Plan &
 * billing, Account): un blocco bordato con la barra grigia del titolo in alto
 * (come le intestazioni delle tabelle) e righe "etichetta · controllo"
 * separate da una linea. Poche parole, un blocco per argomento.
 */

/** Blocco con barra del titolo grigia (bg-ink); barra grigia in fondo opzionale per l'azione del blocco. */
export function Section({
  title,
  action,
  footer,
  id,
  children,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
}) {
  // Niente overflow-hidden: i menu a comparsa (details) devono poter uscire dal blocco.
  return (
    <section id={id} className="scroll-mt-6 rounded-xl border border-line bg-panel">
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 min-h-11 px-5 py-2 bg-ink border-b border-line rounded-t-xl bar-head">
          {title && <h2 className="text-sm font-bold text-ink-100 min-w-0 truncate">{title}</h2>}
          {action && <div className="flex items-center gap-2 shrink-0 text-xs text-ink-400">{action}</div>}
        </div>
      )}
      <div className="divide-y divide-line">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-3 bg-ink border-t border-line rounded-b-xl bar-foot">{footer}</div>}
    </section>
  );
}

/** Riga: etichetta e suggerimento di una riga a sinistra, controllo a destra (sotto, su mobile). */
export function Row({ title, hint, id, children }: { title: React.ReactNode; hint?: React.ReactNode; id?: string; children?: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-6 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-2.5 md:gap-8 items-start md:items-center px-5 py-3.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink-100 break-words">{title}</div>
        {hint && <div className="text-xs text-ink-400 mt-0.5 break-words">{hint}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 md:justify-end min-w-0">{children}</div>}
    </div>
  );
}

/** Riga vuota dentro un blocco (lista senza elementi). */
export function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-6 text-center text-sm text-ink-400">{children}</div>;
}

/** Stato con pallino: verde se attivo, ambra se no. */
export function Status({ on, yes, no }: { on: boolean; yes: string; no?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-100">
      <span className={`h-2 w-2 rounded-full ${on ? "bg-steady" : "bg-signal"}`} />
      {on ? yes : no}
    </span>
  );
}

/**
 * Mattoni comuni delle pagine di impostazioni (Settings, Workspace, Plan &
 * billing, Account): un blocco bordato con righe "etichetta · controllo"
 * separate da una linea. Poche parole, un blocco per argomento.
 */

/** Blocco unico con righe separate da una linea; titolo breve opzionale sopra. */
export function Section({ title, action, id, children }: { title?: string; action?: React.ReactNode; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-2 scroll-mt-6">
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 min-h-8 px-1">
          {title && <h2 className="text-sm font-semibold text-ink-100">{title}</h2>}
          {action}
        </div>
      )}
      <div className="rounded-xl border border-line bg-panel divide-y divide-line">{children}</div>
    </section>
  );
}

/** Riga: etichetta e suggerimento di una riga a sinistra, controllo a destra (sotto, su mobile). */
export function Row({ title, hint, id, children }: { title: React.ReactNode; hint?: React.ReactNode; id?: string; children?: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-6 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3 md:gap-8 items-start md:items-center px-5 py-4">
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

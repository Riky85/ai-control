// Scheletro mentre la pagina carica: stessa struttura delle pagine (intestazione,
// riga di numeri, pannelli), con una pulsazione leggera.
export default function Loading() {
  const block = "rounded-xl border border-line bg-panel";
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2 lg:pr-[var(--hdr-tools,8.25rem)]">
        <div className="h-7 w-56 max-w-full rounded-md bg-ink-100/[0.07]" />
        <div className="h-4 w-96 max-w-full rounded bg-ink-100/[0.05]" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-[92px] p-5 flex flex-col gap-3`}>
            <div className="h-3 w-20 rounded bg-ink-100/[0.06]" />
            <div className="h-6 w-24 rounded bg-ink-100/[0.08]" />
          </div>
        ))}
      </div>
      <div className={`${block} h-64`} />
      <div className={`${block} overflow-hidden`}>
        <div className="h-9 bg-ink border-b border-line" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-line last:border-0">
            <div className="h-7 w-7 rounded-lg bg-ink-100/[0.07]" />
            <div className="h-3.5 flex-1 max-w-xs rounded bg-ink-100/[0.06]" />
            <div className="h-3.5 w-16 rounded bg-ink-100/[0.05] ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

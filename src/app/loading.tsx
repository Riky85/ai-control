// Scheletro mentre la pagina carica: stessa struttura delle pagine (barra del titolo,
// riga di numeri, pannelli), con una pulsazione leggera.
export default function Loading() {
  const block = "rounded-xl border border-line bg-panel";
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-busy="true" aria-label="Loading">
      {/* Barra del titolo come PageHeader (stessa altezza, bordo sotto, a tutta larghezza). */}
      <div className="page-bar relative -mx-4 sm:-mx-6 lg:-mx-10 px-4 sm:px-6 lg:px-10 h-14 flex items-center gap-3 before:content-[''] before:absolute before:inset-y-0 before:-left-[100vw] before:-right-[100vw] before:-z-10 before:bg-panel before:border-b before:border-line">
        <div className="h-4 w-32 max-w-full rounded bg-ink-100/[0.08]" />
        <div className="hidden sm:block h-3.5 w-56 max-w-full rounded bg-ink-100/[0.05]" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-[92px] p-5 flex flex-col gap-3`}>
            <div className="h-3 w-20 rounded bg-ink-100/[0.06]" />
            <div className="h-6 w-24 rounded bg-ink-100/[0.08]" />
          </div>
        ))}
      </div>
      <div className={`${block} h-64`} />
      <div className={`${block} overflow-hidden`}>
        <div className="h-9 bg-ink border-b border-line bar-head" />
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

// Anteprime illustrative per i riquadri della pagina Connect: finte schermate
// (numeri d'esempio) che salgono dal bordo inferiore. Toni neutri, al massimo un dettaglio arancione.

const frame = "rounded-t-xl border border-b-0 border-line bg-sidebar select-none";

/** Estratto conto: le righe AI evidenziate, le altre spente. */
export function BankPreview() {
  const rows: [string, string, boolean][] = [
    ["OpenAI · ChatGPT Team", "€305", true],
    ["Office supplies", "€84", false],
    ["Anthropic · Claude", "€150", true],
    ["Cursor Business", "€96", true],
  ];
  return (
    <div className={`w-[270px] ${frame}`} aria-hidden>
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <span className="text-[10px] text-ink-400">Bank statement · March</span>
        <span className="text-[10px] text-ink-100 font-medium">3 AI found</span>
      </div>
      <div className="mx-3 mb-3 rounded-lg border border-line bg-panel divide-y divide-line">
        {rows.map(([n, eur, ai]) => (
          <div key={n} className={`flex items-center gap-2 px-3 py-1.5 ${ai ? "bg-ink-100/[0.04]" : "opacity-40"}`}>
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${ai ? "bg-ink-100" : "bg-ink-400"}`} />
            <span className="flex-1 min-w-0 truncate text-[11px] text-ink-100">{n}</span>
            <span className="text-[11px] tabular text-ink-100">{eur}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Account aziendali: due riquadri (Microsoft 365, Google) con chi usa quale AI. */
export function AccountsPreview() {
  const tiles: [string, [string, string][]][] = [
    ["Microsoft 365", [["Anna", "Copilot"], ["Marco", "ChatGPT"]]],
    ["Google", [["Luca", "Gemini"], ["Sara", "Claude"]]],
  ];
  return (
    <div className={`w-[270px] p-3 grid grid-cols-2 gap-2 ${frame}`} aria-hidden>
      {tiles.map(([name, people]) => (
        <div key={name} className="rounded-lg border border-line bg-panel px-2.5 py-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="h-4 w-4 rounded bg-ink-100/[0.08] text-[9px] font-semibold text-ink-100 flex items-center justify-center">{name[0]}</span>
            <span className="text-[10px] text-ink-100 font-medium truncate">{name}</span>
          </div>
          {people.map(([who, ai]) => (
            <div key={who} className="flex items-center justify-between gap-1 py-0.5">
              <span className="text-[10px] text-ink-400">{who}</span>
              <span className="text-[10px] text-ink-100">{ai}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** App desktop: piccola finestra con le AI usate oggi e i minuti. */
export function DesktopPreview() {
  const rows: [string, number][] = [
    ["ChatGPT", 40],
    ["Claude", 25],
    ["Copilot", 12],
  ];
  return (
    <div className={`w-[270px] ${frame}`} aria-hidden>
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-line">
        <span className="h-2 w-2 rounded-full bg-ink-100/20" />
        <span className="h-2 w-2 rounded-full bg-ink-100/20" />
        <span className="h-2 w-2 rounded-full bg-ink-100/20" />
        <span className="ml-2 text-[10px] text-ink-400">angar · today</span>
      </div>
      <div className="px-3 py-2.5 flex flex-col gap-2">
        {rows.map(([n, min], i) => (
          <div key={n} className="flex items-center gap-2">
            <span className="w-14 text-[11px] text-ink-100">{n}</span>
            <span className="flex-1 h-1.5 rounded-full bg-ink-100/[0.07] overflow-hidden">
              {/* un solo dettaglio arancione: la prima barra */}
              <span className={`block h-full rounded-full ${i === 0 ? "bg-accent" : "bg-ink-400"}`} style={{ width: `${(min / 40) * 100}%` }} />
            </span>
            <span className="w-10 text-right text-[10px] tabular text-ink-400">{min} min</span>
          </div>
        ))}
      </div>
    </div>
  );
}

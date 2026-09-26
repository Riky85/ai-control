"use client";

// Pulsante documentazione in alto a destra di ogni pagina: icona a libro,
// etichetta "View documentation" al passaggio del mouse, apre il pannello
// di aiuto (AskDocs, montato una sola volta nel layout).
export default function DocsButton() {
  return (
    <span className="relative group/docs">
      <button
        type="button"
        aria-label="View documentation"
        onClick={(e) => {
          e.currentTarget.blur();
          window.dispatchEvent(new CustomEvent("angar:toggle-docs"));
        }}
        className="btn btn-secondary btn-icon"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M8 3.5C6.6 2.6 4.9 2.3 2.5 2.5v9.8c2.4-.2 4.1.1 5.5 1 1.4-.9 3.1-1.2 5.5-1V2.5c-2.4-.2-4.1.1-5.5 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M8 3.5v9.8" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap rounded-md bg-ink-100 px-2 py-1 text-xs text-panel opacity-0 translate-y-[-2px] transition-all group-hover/docs:opacity-100 group-hover/docs:translate-y-0 group-has-[:focus-visible]/docs:opacity-100 z-50"
      >
        View documentation
      </span>
    </span>
  );
}

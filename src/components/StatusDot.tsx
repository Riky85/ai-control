/**
 * Icona di stato a cerchio colorato — stile OneTrust (pallino verde/giallo/
 * rosso con simbolo dentro) invece del semplice carattere ✓/!/✕ in testo.
 * Usata ovunque mostriamo l'esito di un controllo (Assurance, Evidence).
 */
export default function StatusDot({ status, size = 16 }: { status: "PASSED" | "WARNING" | "FAILED"; size?: number }) {
  const color = status === "PASSED" ? "#1F9254" : status === "WARNING" ? "#B7791F" : "#C4433B";
  const symbol = status === "PASSED" ? "M4 8l2.5 2.5L12 5" : status === "WARNING" ? "M8 5v4M8 11h.01" : "M5.5 5.5l5 5M10.5 5.5l-5 5";
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="shrink-0">
      <circle cx="8" cy="8" r="7.5" fill={color} />
      <path d={symbol} stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

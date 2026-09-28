/**
 * Logo angar — due chevron ai lati di una barra centrale, in un solo colore
 * (currentColor: bianco sulla sidebar scura e sul tema scuro).
 */
export const LOGO_VIEWBOX = "35 8 424 370";
export const LOGO_PATHS = [
  "M152,28 L212,28 L212,92 L188,92 L128.6,193 L188,294 L212,294 L212,358 L152,358 L55,193 Z",
  "M212,92 L282,92 L282,294 L212,294 Z",
  "M342,28 L282,28 L282,92 L306,92 L365.4,193 L306,294 L282,294 L282,358 L342,358 L439,193 Z",
];

export default function Logo({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={Math.round((size * 424) / 370)} height={size} viewBox={LOGO_VIEWBOX} aria-label="angar" fill="currentColor" className={className}>
      {LOGO_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/**
 * Logo + nome: usato nelle intestazioni. `size` è l'altezza del logo; il nome
 * è sempre al 90% e centrato sul logo, con le stesse proporzioni della sidebar
 * aperta, in ogni pagina (login, pricing, check, condivisioni…).
 */
export function Wordmark({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center align-middle ${className}`} style={{ gap: Math.round(size * 0.4) }}>
      <Logo size={size} />
      {/* Space Grotesk ha il centro delle minuscole ~0,09em sotto il centro della riga: si alza di tanto così "angar" è al centro del logo. */}
      <span className="font-brand leading-none tracking-tight relative" style={{ fontSize: Math.round(size * 0.9), top: "-0.09em" }}>angar</span>
    </span>
  );
}

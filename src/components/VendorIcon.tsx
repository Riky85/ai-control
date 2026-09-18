/**
 * Marchi identificativi dei vendor rilevati, in stile monolineare coerente
 * col resto dell'iconografia dell'app (non loghi ufficiali a colori — sagome
 * semplificate, uso puramente identificativo di un prodotto di terzi
 * all'interno del nostro inventario, come fa qualunque directory di
 * integrazioni/SSO: Okta, Zapier ecc. mostrano tutti le controparti così).
 */
const COMMON = { width: 15, height: 15, viewBox: "0 0 16 16", fill: "none" as const };
const STROKE = { stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export default function VendorIcon({ vendor, size = 15 }: { vendor: string; size?: number }) {
  const common = { ...COMMON, width: size, height: size };
  switch (vendor.toUpperCase()) {
    case "MICROSOFT_365":
    case "MICROSOFT":
      return (
        <svg {...common}>
          <rect x="1.5" y="1.5" width="5.5" height="5.5" fill="currentColor" />
          <rect x="9" y="1.5" width="5.5" height="5.5" fill="currentColor" opacity="0.7" />
          <rect x="1.5" y="9" width="5.5" height="5.5" fill="currentColor" opacity="0.7" />
          <rect x="9" y="9" width="5.5" height="5.5" fill="currentColor" opacity="0.4" />
        </svg>
      );
    case "GOOGLE_WORKSPACE":
    case "GOOGLE":
      return (
        <svg {...common} viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6" {...STROKE} />
          <path {...STROKE} d="M8 8h5.2" />
          <path {...STROKE} d="M8 2c2 1.8 2 10.2 0 12" />
        </svg>
      );
    case "GITHUB":
      return (
        <svg {...common} viewBox="0 0 16 16">
          <path
            {...STROKE}
            fill="currentColor"
            fillRule="evenodd"
            d="M8 1.3c-3.7 0-6.7 3-6.7 6.7 0 3 1.9 5.5 4.6 6.3.3.1.5-.1.5-.4v-1.5c-1.9.4-2.3-.9-2.3-.9-.3-.8-.7-1-.7-1-.6-.4 0-.4 0-.4.7 0 1.1.7 1.1.7.6 1.1 1.7.8 2.1.6.1-.5.3-.8.5-1-1.5-.2-3.1-.8-3.1-3.4 0-.8.3-1.4.7-1.9-.1-.2-.3-.9.1-1.9 0 0 .6-.2 1.9.7.6-.2 1.1-.2 1.7-.2s1.2.1 1.7.2c1.3-.9 1.9-.7 1.9-.7.4 1 .1 1.7.1 1.9.4.5.7 1.1.7 1.9 0 2.6-1.6 3.2-3.1 3.4.2.2.5.6.5 1.3v2c0 .3.2.5.5.4 2.7-.9 4.6-3.4 4.6-6.3 0-3.7-3-6.7-6.7-6.7z"
          />
        </svg>
      );
    case "ANTHROPIC":
      return (
        <svg {...common} viewBox="0 0 16 16">
          {Array.from({ length: 8 }).map((_, i) => (
            <rect
              key={i}
              x="7.4"
              y="1.2"
              width="1.2"
              height="4.6"
              rx="0.6"
              fill="currentColor"
              transform={`rotate(${i * 45} 8 8)`}
            />
          ))}
        </svg>
      );
    case "OPENAI":
      return (
        <svg {...common} viewBox="0 0 16 16">
          <circle cx="6" cy="6" r="3.4" {...STROKE} />
          <circle cx="10.5" cy="6" r="3.4" {...STROKE} />
          <circle cx="8.2" cy="10.5" r="3.4" {...STROKE} />
        </svg>
      );
    default:
      return (
        <svg {...common} viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6" {...STROKE} />
        </svg>
      );
  }
}

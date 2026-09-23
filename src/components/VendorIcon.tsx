/**
 * Colore identificativo di ciascun vendor, per lo sfondo del badge
 * circolare — non inventato: preso dal colore dominante del marchio reale
 * (il coral di Anthropic, il verde-menta di OpenAI, ecc.), sempre in tinta
 * pastello tenue per restare nella palette minimale del prodotto.
 */
export function vendorTint(vendor: string): { bg: string; fg: string } {
  const v = vendor.toUpperCase();
  if (v.includes("ANTHROPIC")) return { bg: "#F3E3DC", fg: "#C15F3C" };
  if (v.includes("OPENAI")) return { bg: "#E4F5EF", fg: "#0F8A6C" };
  if (v.includes("GITHUB")) return { bg: "#EDEDEF", fg: "#16161A" };
  if (v.includes("MICROSOFT")) return { bg: "#EEF4FB", fg: "#3B3564" };
  if (v.includes("GOOGLE")) return { bg: "#EAF2FE", fg: "#3B3564" };
  return { bg: "#EEECF6", fg: "#3B3564" };
}

/** Badge pronto all'uso — icona + sfondo colorato del vendor. Per i brand
 * con un vero "app icon" a tinta piena (Anthropic, OpenAI) uso un quadrato
 * arrotondato con simbolo bianco dentro, come appare davvero ovunque
 * (favicon, app iOS/macOS) — non un cerchio con tinta tenue generica. */
export function VendorBadge({ vendor, size = 36 }: { vendor: string; size?: number }) {
  const v = vendor.toUpperCase();
  const { bg, fg } = vendorTint(vendor);

  if (v.includes("ANTHROPIC")) {
    return (
      <span className="rounded-[28%] flex items-center justify-center shrink-0 text-white" style={{ width: size, height: size, backgroundColor: "#D97757" }}>
        <VendorIcon vendor={vendor} size={Math.round(size * 0.5)} />
      </span>
    );
  }
  if (v.includes("OPENAI")) {
    return (
      <span className="rounded-[28%] flex items-center justify-center shrink-0 text-white border border-line" style={{ width: size, height: size, backgroundColor: "#20232B" }}>
        <VendorIcon vendor={vendor} size={Math.round(size * 0.52)} />
      </span>
    );
  }

  return (
    <span
      className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: size, height: size, backgroundColor: bg, color: fg }}
    >
      <VendorIcon vendor={vendor} size={Math.round(size * 0.48)} />
    </span>
  );
}

/**
 * Marchi identificativi dei vendor rilevati — ricostruzioni indipendenti
 * fedeli all'aspetto reale, non file ufficiali copiati. Uso puramente
 * identificativo di un prodotto di terzi nel nostro inventario, come fa
 * qualunque directory di integrazioni (Okta, Zapier, 1Password...).
 *
 * IMPORTANTE: confronto per sottostringa (.includes), non uguaglianza
 * esatta — un valore composito come "GitHub / Microsoft" (usato per
 * GitHub Copilot) o "GitHub, Microsoft" deve comunque riconoscere il
 * vendor giusto invece di cadere nel cerchio generico di fallback.
 * GitHub va controllato PRIMA di Microsoft perché una stringa come
 * "GitHub / Microsoft" contiene entrambe le parole.
 */
export default function VendorIcon({ vendor, size = 15 }: { vendor: string; size?: number }) {
  const v = vendor.toUpperCase();
  const box = { width: size, height: size, viewBox: "0 0 16 16" };

  if (v.includes("GITHUB")) {
    return (
      <svg {...box} fill="currentColor">
        <path d="M8 .3a8 8 0 00-2.5 15.6c.4.1.5-.2.5-.4v-1.5c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.3.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.7 7.7 0 014 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.5.8 1.3.8 2.1 0 3-1.8 3.7-3.6 3.9.3.2.5.7.5 1.5v2.2c0 .2.1.5.6.4A8 8 0 008 .3z" />
      </svg>
    );
  }

  if (v.includes("ANTHROPIC")) {
    // Stella/asterisco connesso al centro (non trattini separati) — la
    // forma reale è un unico "fiore" continuo, non 6 segmenti isolati.
    return (
      <svg {...box} viewBox="0 0 16 16" fill="currentColor">
        {Array.from({ length: 6 }).map((_, i) => (
          <path key={i} d="M8 8L6.7 2.6a1.4 1.4 0 012.6 0z" transform={`rotate(${i * 60} 8 8)`} />
        ))}
        <circle cx="8" cy="8" r="1.3" />
      </svg>
    );
  }

  if (v.includes("OPENAI")) {
    return (
      <svg {...box} viewBox="0 0 16 16" fill="currentColor">
        {Array.from({ length: 6 }).map((_, i) => (
          <rect key={i} x="6.9" y="1.3" width="2.2" height="5.4" rx="1.1" transform={`rotate(${i * 60} 8 8)`} />
        ))}
      </svg>
    );
  }

  if (v.includes("MICROSOFT")) {
    return (
      <svg {...box}>
        <rect x="1" y="1" width="6.5" height="6.5" fill="#F25022" />
        <rect x="8.5" y="1" width="6.5" height="6.5" fill="#7FBA00" />
        <rect x="1" y="8.5" width="6.5" height="6.5" fill="#00A4EF" />
        <rect x="8.5" y="8.5" width="6.5" height="6.5" fill="#FFB900" />
      </svg>
    );
  }

  if (v.includes("GOOGLE")) {
    return (
      <svg {...box} viewBox="0 0 18 18">
        <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.4h4.8c-.2 1.1-.8 2.1-1.8 2.7v2.3h2.9c1.7-1.6 2.7-3.9 2.7-6.6z" />
        <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.3c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.7H.9v2.3C2.4 15.9 5.5 18 9 18z" />
        <path fill="#FBBC05" d="M3.9 10.7c-.2-.5-.3-1.1-.3-1.7s.1-1.2.3-1.7V4.9H.9C.3 6.2 0 7.6 0 9s.3 2.8.9 4.1l3-2.4z" />
        <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6C13.4.9 11.4 0 9 0 5.5 0 2.4 2.1.9 4.9l3 2.3C4.6 5.2 6.6 3.6 9 3.6z" />
      </svg>
    );
  }

  // Generico — cerchio semplice, per vendor non ancora mappati.
  return (
    <svg {...box}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" fill="none" />
    </svg>
  );
}

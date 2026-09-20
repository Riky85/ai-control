/**
 * Marchi identificativi dei vendor rilevati — ricostruzioni indipendenti
 * fedeli all'aspetto reale (geometria e colori dove il marchio stesso è
 * cromatico, es. Microsoft/Google), non file ufficiali copiati. Uso
 * puramente identificativo di un prodotto di terzi nel nostro inventario,
 * come fa qualunque directory di integrazioni (Okta, Zapier, 1Password...).
 */
export default function VendorIcon({ vendor, size = 15 }: { vendor: string; size?: number }) {
  const v = vendor.toUpperCase();
  const box = { width: size, height: size, viewBox: "0 0 16 16" };

  if (v === "MICROSOFT_365" || v === "MICROSOFT") {
    return (
      <svg {...box}>
        <rect x="1" y="1" width="6.5" height="6.5" fill="#F25022" />
        <rect x="8.5" y="1" width="6.5" height="6.5" fill="#7FBA00" />
        <rect x="1" y="8.5" width="6.5" height="6.5" fill="#00A4EF" />
        <rect x="8.5" y="8.5" width="6.5" height="6.5" fill="#FFB900" />
      </svg>
    );
  }

  if (v === "GOOGLE_WORKSPACE" || v === "GOOGLE") {
    return (
      <svg {...box} viewBox="0 0 18 18">
        <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.4h4.8c-.2 1.1-.8 2.1-1.8 2.7v2.3h2.9c1.7-1.6 2.7-3.9 2.7-6.6z" />
        <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.3c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.7H.9v2.3C2.4 15.9 5.5 18 9 18z" />
        <path fill="#FBBC05" d="M3.9 10.7c-.2-.5-.3-1.1-.3-1.7s.1-1.2.3-1.7V4.9H.9C.3 6.2 0 7.6 0 9s.3 2.8.9 4.1l3-2.4z" />
        <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6C13.4.9 11.4 0 9 0 5.5 0 2.4 2.1.9 4.9l3 2.3C4.6 5.2 6.6 3.6 9 3.6z" />
      </svg>
    );
  }

  if (v === "GITHUB") {
    return (
      <svg {...box} fill="currentColor">
        <path d="M8 .3a8 8 0 00-2.5 15.6c.4.1.5-.2.5-.4v-1.5c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.3.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.7 7.7 0 014 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.5.8 1.3.8 2.1 0 3-1.8 3.7-3.6 3.9.3.2.5.7.5 1.5v2.2c0 .2.1.5.6.4A8 8 0 008 .3z" />
      </svg>
    );
  }

  if (v === "ANTHROPIC") {
    return (
      <svg {...box} viewBox="0 0 16 16" fill="currentColor">
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={i} x="7.4" y="1.2" width="1.2" height="4.6" rx="0.6" transform={`rotate(${i * 45} 8 8)`} />
        ))}
      </svg>
    );
  }

  if (v === "OPENAI") {
    return (
      <svg {...box} viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1.2a2.4 2.4 0 00-2.3 1.6A2.6 2.6 0 003.8 6a2.5 2.5 0 000 4 2.6 2.6 0 002 3.2 2.4 2.4 0 004.4 0 2.6 2.6 0 002-3.2 2.5 2.5 0 000-4A2.6 2.6 0 0010.3 2.8 2.4 2.4 0 008 1.2zm0 2a1 1 0 01.9.6l.1.3-.1.1a4.3 4.3 0 00-1.8 0l-.1-.1.1-.3a1 1 0 01.9-.6zM4.8 6.4a1 1 0 011-.9h.3l.1.1a4.3 4.3 0 00-.9 1.6l-.2.1H5A1 1 0 014.8 6.4zm6.4 0a1 1 0 01-.2 1l-.2-.1a4.3 4.3 0 00-.9-1.6l.1-.1h.3a1 1 0 011 .8zM8 9.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm-2.3 2a1 1 0 01-.9-.6l-.1-.3.1-.1a4.3 4.3 0 001.8 0l.1.1-.1.3a1 1 0 01-.9.6zm5.4-.9a1 1 0 01-1 .9h-.3l-.1-.1a4.3 4.3 0 00.9-1.6l.2-.1h.1a1 1 0 01.2 1z" />
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

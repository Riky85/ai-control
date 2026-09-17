/**
 * Simbolo originale per AI Control — una raggiera minimale a 12 raggi.
 * Non è il logo Claude/Anthropic (marchio registrato, non riutilizzabile):
 * disegno distinto, stessa famiglia concettuale di "segnale/scansione"
 * coerente con cosa fa il prodotto (scoprire cio' che e' nascosto).
 */
export default function Logo({ size = 18 }: { size?: number }) {
  const rays = 12;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {Array.from({ length: rays }).map((_, i) => {
        const angle = (i * 360) / rays;
        return (
          <rect
            key={i}
            x="11.25"
            y="1.5"
            width="1.5"
            height="7"
            rx="0.75"
            fill="currentColor"
            transform={`rotate(${angle} 12 12)`}
          />
        );
      })}
    </svg>
  );
}

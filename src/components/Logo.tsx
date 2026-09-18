/**
 * Simbolo di AI Control — stessa geometria a cerchi del logo Angar (l'altro
 * prodotto dell'utente: un cerchio grande + una fila di cerchi più piccoli),
 * riadattata alla palette di AI Control per coerenza visiva nel portfolio,
 * ma non identica: qui è resa in monotono con l'accento di brand.
 */
export default function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size * (144 / 256)} viewBox="0 0 256 144" fill="none">
      <circle cx="65" cy="73" r="60" fill="currentColor" />
      <circle cx="140" cy="73" r="25" fill="currentColor" />
      <circle cx="190" cy="73" r="25" fill="currentColor" />
      <circle cx="230" cy="73" r="18" fill="currentColor" />
    </svg>
  );
}

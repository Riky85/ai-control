/**
 * Simbolo di AI Control — stessa geometria a cerchi del logo Angar (l'altro
 * prodotto dell'utente: un cerchio grande + una fila di cerchi più piccoli),
 * riadattata alla palette di AI Control per coerenza visiva nel portfolio,
 * ma non identica: qui è resa in monotono con l'accento di brand.
 */
export default function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="38" cy="50" r="32" fill="currentColor" />
      <circle cx="80" cy="50" r="16" fill="currentColor" />
    </svg>
  );
}

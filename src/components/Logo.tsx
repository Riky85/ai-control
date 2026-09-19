/**
 * Logo Angar — riproduzione fedele della scacchiera a colonne sfalsate
 * condivisa dall'utente: colonna 1 sempre nera, colonne 2-4 alternate
 * bianco/nero con lo spartiacque sfalsato tra la riga superiore/inferiore
 * e le due righe centrali (che restano unite).
 */
export default function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 400 400" fill="none">
      <rect x="0" y="0" width="200" height="100" fill="currentColor" />
      <rect x="300" y="0" width="100" height="100" fill="currentColor" />
      <rect x="0" y="100" width="100" height="200" fill="currentColor" />
      <rect x="200" y="100" width="100" height="200" fill="currentColor" />
      <rect x="0" y="300" width="200" height="100" fill="currentColor" />
      <rect x="300" y="300" width="100" height="100" fill="currentColor" />
    </svg>
  );
}

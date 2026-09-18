/**
 * Simbolo di AI Control — reinterpretazione del logo Angar (scacchiera
 * dinamica a colonne sfalsate), riadattato in monotono per il nostro
 * accento di brand. Non è una copia pixel-per-pixel del file originale,
 * ma la stessa famiglia geometrica: colonne verticali con lo spartiacque
 * bianco/nero sfalsato invece di una scacchiera regolare.
 */
export default function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <rect x="0" y="0" width="25" height="62.5" fill="currentColor" />
      <rect x="25" y="25" width="25" height="75" fill="currentColor" />
      <rect x="50" y="0" width="25" height="75" fill="currentColor" />
      <rect x="75" y="37.5" width="25" height="62.5" fill="currentColor" />
    </svg>
  );
}

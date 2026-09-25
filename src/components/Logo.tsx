/**
 * Logo angar — la forma originale del marchio (colonne sfalsate su griglia
 * 4×4) costruita a quadratini come il marchio Mistral, in un solo colore
 * (currentColor: bianco sulla sidebar scura).
 */
export const LOGO_CELLS: [number, number][] = [
  [0, 0], [1, 0], [3, 0],
  [0, 1], [2, 1],
  [0, 2], [2, 2],
  [0, 3], [1, 3], [3, 3],
];

export default function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 4 4" shapeRendering="crispEdges" aria-label="angar" fill="currentColor">
      {LOGO_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
      ))}
    </svg>
  );
}

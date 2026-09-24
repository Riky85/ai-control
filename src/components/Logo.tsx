/**
 * Logo Angar — la forma originale del marchio (colonne sfalsate su griglia
 * 4×4) resa a quadratini colorati, alla maniera del marchio Mistral: righe
 * che sfumano dal giallo al rosso con l'arancio di brand Exein (#FF7323).
 */
export const LOGO_ROWS: { color: string; cells: number[] }[] = [
  { color: "#FFC93C", cells: [0, 1, 3] },
  { color: "#FF9A2E", cells: [0, 2] },
  { color: "#FF7323", cells: [0, 2] },
  { color: "#E8431A", cells: [0, 1, 3] },
];

export default function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 4 4" shapeRendering="crispEdges" aria-label="Angar">
      {LOGO_ROWS.flatMap((row, y) => row.cells.map((x) => <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={row.color} />))}
    </svg>
  );
}

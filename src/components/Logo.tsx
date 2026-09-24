/**
 * Logo Angar — una "A" fatta di quadratini su griglia 6×5 con la punta a gradini, ispirata al
 * principio del marchio Mistral (lettera pixel, righe a colori caldi) ma
 * con forma e scala proprie: le righe sfumano dal giallo al rosso con
 * l'arancio di brand (Exein #FF7323) sulla traversa centrale della A.
 */
export const LOGO_ROWS: { color: string; cells: number[] }[] = [
  { color: "#FFD23F", cells: [2, 3] },
  { color: "#FFAE2B", cells: [1, 2, 3, 4] },
  { color: "#FF7323", cells: [0, 1, 4, 5] },
  { color: "#F4501E", cells: [0, 1, 2, 3, 4, 5] },
  { color: "#DB2F14", cells: [0, 1, 4, 5] },
];

export default function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 -0.5 6 6" shapeRendering="crispEdges" aria-label="Angar">
      {LOGO_ROWS.flatMap((row, y) => row.cells.map((x) => <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={row.color} />))}
    </svg>
  );
}

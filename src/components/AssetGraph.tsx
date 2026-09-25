import { Edge, Node, GraphColumns, GRAPH_PAD, curve, G, type NodeKind } from "@/components/graph-parts";

/**
 * Dependency graph del passaporto: chi lo usa → il sistema → da cosa
 * dipende. Solo dati reali del dettaglio asset.
 */
export interface GraphNode {
  label: string;
  sublabel?: string;
  tone?: "default" | "alarm";
  kind?: NodeKind;
}

export interface AssetGraphProps {
  center: string;
  centerVendor?: string | null;
  left: GraphNode[];
  right: GraphNode[];
}

const W = 760;
const ROW = 46;
const COL = 220;

export default function AssetGraph({ center, centerVendor, left, right }: AssetGraphProps) {
  const rows = Math.max(left.length, right.length, 1);
  const H = rows * ROW + 16;
  const x = [0, W / 2 - COL / 2, W - COL];
  const y = (i: number, n: number) => (H - n * ROW) / 2 + i * ROW + ROW / 2;
  const cy = H / 2;

  return (
    <GraphColumns W={W} COL={COL} xs={x} columns={[{ label: "Used by", count: left.length, hint: "People using it" }, { label: "AI system", hint: "This passport" }, { label: "Depends on", count: right.length, hint: "Systems and data" }]}>
    <svg width="100%" viewBox={`${-GRAPH_PAD} 0 ${W + 2 * GRAPH_PAD} ${H}`}>
      <g>
        {left.map((_, i) => (
          <Edge key={`le${i}`} d={curve(x[0] + COL, y(i, left.length), x[1], cy)} />
        ))}
        {right.map((n, i) => (
          <Edge key={`re${i}`} d={curve(x[1] + COL, cy, x[2], y(i, right.length))} alarm={n.tone === "alarm"} />
        ))}
        {left.map((n, i) => (
          <Node key={`ln${i}`} x={x[0]} y={y(i, left.length)} w={COL} label={n.label} sublabel={n.sublabel} kind={n.kind ?? "user"} />
        ))}
        <Node x={x[1]} y={cy} w={COL} label={center} kind="system" vendor={centerVendor ?? ""} name={center} emphasis />
        {right.map((n, i) => (
          <Node key={`rn${i}`} x={x[2]} y={y(i, right.length)} w={COL} label={n.label} sublabel={n.sublabel} kind={n.kind ?? "data"} tone={n.tone} />
        ))}
        {left.length === 0 && <text x={x[0]} y={cy + 4} fontSize="12" fill={G.muted}>No known users yet</text>}
        {right.length === 0 && <text x={x[2]} y={cy + 4} fontSize="12" fill={G.muted}>No dependencies declared</text>}
      </g>
    </svg>
    </GraphColumns>
  );
}

/**
 * Grafo dell'asset — sostituisce la vecchia lista testuale indentata con
 * un vero grafo a nodi: chi lo usa a sinistra, l'asset al centro, cosa
 * tocca (sistemi, asset collegati, dati) a destra. Costruito solo dai
 * dati reali già presenti nel dettaglio asset — nessun nodo inventato.
 */
export interface GraphNode {
  label: string;
  sublabel?: string;
  tone?: "default" | "alarm";
}

export interface AssetGraphProps {
  center: string;
  left: GraphNode[];
  right: GraphNode[];
}

const ROW_H = 34;
const NODE_W_SIDE = 168;
const NODE_W_CENTER = 176;
const PAD_TOP = 20;

export default function AssetGraph({ center, left, right }: AssetGraphProps) {
  const rows = Math.max(left.length, right.length, 1);
  const height = rows * ROW_H + PAD_TOP * 2;
  const width = 620;
  const xLeft = 16;
  const xCenter = width / 2 - NODE_W_CENTER / 2;
  const xRight = width - NODE_W_SIDE - 16;
  const centerY = height / 2;

  const colY = (i: number, count: number) => {
    const blockH = count * ROW_H;
    const start = (height - blockH) / 2 + ROW_H / 2;
    return start + i * ROW_H;
  };

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* Connettori: da ogni nodo sinistro al centro */}
      {left.map((_, i) => {
        const y = colY(i, left.length);
        return (
          <path
            key={`l-${i}`}
            d={`M ${xLeft + NODE_W_SIDE} ${y} C ${xCenter - 30} ${y}, ${xCenter - 30} ${centerY}, ${xCenter} ${centerY}`}
            fill="none"
            stroke="#EAE8E3"
            strokeWidth={1.5}
          />
        );
      })}
      {/* Connettori: dal centro a ogni nodo destro */}
      {right.map((_, i) => {
        const y = colY(i, right.length);
        return (
          <path
            key={`r-${i}`}
            d={`M ${xCenter + NODE_W_CENTER} ${centerY} C ${xRight - 30} ${centerY}, ${xRight - 30} ${y}, ${xRight} ${y}`}
            fill="none"
            stroke="#EAE8E3"
            strokeWidth={1.5}
          />
        );
      })}

      {/* Nodo centrale */}
      <g transform={`translate(${xCenter}, ${centerY - 16})`}>
        <rect width={NODE_W_CENTER} height={32} rx={7} fill="#1A1A18" />
        <text x={NODE_W_CENTER / 2} y={20} textAnchor="middle" fontSize="12" fontWeight={600} fill="#FFFFFF">
          {center.length > 24 ? center.slice(0, 23) + "…" : center}
        </text>
      </g>

      {/* Nodi a sinistra (chi usa) */}
      {left.map((n, i) => (
        <Node key={`ln-${i}`} x={xLeft} y={colY(i, left.length) - 14} node={n} />
      ))}
      {/* Nodi a destra (cosa tocca) */}
      {right.map((n, i) => (
        <Node key={`rn-${i}`} x={xRight} y={colY(i, right.length) - 14} node={n} />
      ))}

      {left.length === 0 && (
        <text x={xLeft} y={centerY} fontSize="11" fill="#8C8A83">
          No known users
        </text>
      )}
      {right.length === 0 && (
        <text x={xRight} y={centerY} fontSize="11" fill="#8C8A83">
          Nothing declared
        </text>
      )}
    </svg>
  );
}

function Node({ x, y, node }: { x: number; y: number; node: GraphNode }) {
  const stroke = node.tone === "alarm" ? "#D1453B" : "#EAE8E3";
  const label = node.label.length > 22 ? node.label.slice(0, 21) + "…" : node.label;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width={NODE_W_SIDE} height={28} rx={6} fill="#FFFFFF" stroke={stroke} strokeWidth={1.3} />
      <text x={10} y={17.5} fontSize="11.5" fontWeight={500} fill="#1A1A18">
        {label}
      </text>
      {node.sublabel && (
        <text x={NODE_W_SIDE - 8} y={17.5} textAnchor="end" fontSize="10" fill="#8C8A83">
          {node.sublabel}
        </text>
      )}
    </g>
  );
}

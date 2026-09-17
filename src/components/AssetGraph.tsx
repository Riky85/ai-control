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

const NODE_H = 38; // fissa per tutti i nodi laterali, con o senza sublabel,
// cosi' l'etichetta secondaria va su una seconda riga e non puo' mai
// sovrapporsi al testo principale (bug osservato con label lunghe tipo
// "repo:production-api (production)").
const ROW_H = 50;
const NODE_W_SIDE = 176;
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

      <g transform={`translate(${xCenter}, ${centerY - 16})`}>
        <rect width={NODE_W_CENTER} height={32} rx={7} fill="#1A1A18" />
        <text x={NODE_W_CENTER / 2} y={20} textAnchor="middle" fontSize="12" fontWeight={600} fill="#FFFFFF">
          {truncate(center, 24)}
        </text>
      </g>

      {left.map((n, i) => (
        <Node key={`ln-${i}`} x={xLeft} y={colY(i, left.length) - NODE_H / 2} node={n} />
      ))}
      {right.map((n, i) => (
        <Node key={`rn-${i}`} x={xRight} y={colY(i, right.length) - NODE_H / 2} node={n} />
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

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function Node({ x, y, node }: { x: number; y: number; node: GraphNode }) {
  const stroke = node.tone === "alarm" ? "#D1453B" : "#EAE8E3";
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width={NODE_W_SIDE} height={NODE_H} rx={6} fill="#FFFFFF" stroke={stroke} strokeWidth={1.3} />
      <text x={10} y={node.sublabel ? 16 : 23} fontSize="11.5" fontWeight={500} fill="#1A1A18">
        {truncate(node.label, 26)}
      </text>
      {node.sublabel && (
        <text x={10} y={29} fontSize="9.5" fill="#8C8A83">
          {truncate(node.sublabel, 32)}
        </text>
      )}
    </g>
  );
}

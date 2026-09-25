import VendorIcon, { resolveBrand } from "@/components/VendorIcon";

// Primitivi condivisi da AssetGraph (dettaglio passaporto) ed EstateGraph
// (Home), così i due grafi hanno esattamente lo stesso aspetto.
export const G = {
  line: "#E6E6EB",
  text: "#141418",
  muted: "#6E6E78",
  accent: "#FF7323",
  accentSoft: "#FFF1E8",
  alarm: "#C4433B",
  alarmSoft: "#FDF1F0",
  edge: "#C9C9D6",
  edgeAlarm: "#E7A9A4",
};

export type NodeKind = "user" | "system" | "data" | "provider" | "external";

export function curve(x1: number, y1: number, x2: number, y2: number) {
  const m = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${m} ${y1}, ${m} ${y2}, ${x2} ${y2}`;
}

export function cut(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function Edge({ d, alarm }: { d: string; alarm?: boolean }) {
  return (
    <g>
      <path d={d} fill="none" stroke={G.line} strokeWidth={2} />
      <path d={d} fill="none" stroke={G.accent} strokeOpacity={alarm ? 0.5 : 0.3} strokeWidth={1.4} className="edge-flow" />
    </g>
  );
}

function KindGlyph({ kind, color }: { kind: NodeKind; color: string }) {
  const s = { fill: "none", stroke: color, strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "user")
    return (
      <g>
        <circle cx="8" cy="5.5" r="2.6" {...s} />
        <path d="M3 14c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" {...s} />
      </g>
    );
  if (kind === "data")
    return (
      <g>
        <ellipse cx="8" cy="4" rx="5" ry="2" {...s} />
        <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" {...s} />
      </g>
    );
  return (
    <g>
      <rect x="2.5" y="3" width="11" height="10" rx="2" {...s} />
      <path d="M2.5 7h11" {...s} />
    </g>
  );
}

export function Node({
  x,
  y,
  w,
  label,
  sublabel,
  kind,
  vendor,
  name,
  tone = "default",
  emphasis = false,
  href,
}: {
  x: number;
  y: number;
  w: number;
  label: string;
  sublabel?: string;
  kind: NodeKind;
  vendor?: string | null;
  name?: string;
  tone?: "default" | "alarm";
  emphasis?: boolean;
  href?: string;
}) {
  const h = 36;
  const alarm = tone === "alarm";
  // Riempimento sempre bianco: il significato sta solo nel bordo (arancio =
  // sistema AI, rosso = rischio/dato sensibile), niente campiture colorate
  // che si scontrano tra arancio e rosso.
  const fill = "#FFFFFF";
  // Un solo linguaggio visivo: bordi neutri (più scuri per i sistemi AI),
  // il rischio è un pallino rosso — niente bordi rossi e arancioni mischiati.
  const stroke = emphasis ? "#BDBDC6" : G.line;
  const textColor = G.text;
  const externalBrand = kind === "external" && resolveBrand(label) ? label : null;
  const showBrand = (vendor !== undefined && (kind === "provider" || kind === "system")) || externalBrand !== null;
  const body = (
    <g transform={`translate(${x}, ${y - h / 2})`}>
      <rect width={w} height={h} rx={12} fill={fill} stroke={stroke} strokeWidth={1.2} />
      {alarm && <circle cx={w - 14} cy={h / 2} r={3.5} fill={G.alarm} />}
      <g transform="translate(12, 12)">
        {showBrand ? <VendorIcon vendor={externalBrand ?? vendor ?? ""} name={name} size={16} /> : <KindGlyph kind={kind} color={G.muted} />}
      </g>
      <text x={36} y={sublabel ? 17 : 24} fontSize="12" fontWeight={emphasis ? 600 : 500} fill={textColor}>
        {cut(label, Math.floor((w - (alarm ? 60 : 44)) / 6.6))}
      </text>
      {sublabel && (
        <text x={36} y={31} fontSize="10" fill={G.muted}>
          {cut(sublabel, Math.floor((w - 44) / 5.6))}
        </text>
      )}
    </g>
  );
  return href ? <a href={href}>{body}</a> : body;
}

export function ColumnTitle({ x, text }: { x: number; text: string }) {
  return (
    <text x={x} y={12} fontSize="11" fontWeight={500} letterSpacing="0.6" fill={G.muted} fontFamily="var(--font-sans), ui-sans-serif, system-ui">
      {text}
    </text>
  );
}

/**
 * Intestazioni delle colonne del grafo, in HTML sopra il disegno (non testo
 * SVG): stesso font dell'app, leggibili e con il conteggio. Allineate alle
 * tre colonne di nodi (sinistra, centro, destra).
 */
export function GraphHeader({ columns }: { columns: { label: string; count?: number; hint?: string }[] }) {
  const align = ["text-left", "text-center", "text-right"];
  return (
    <div className="grid grid-cols-3 pb-3 mb-2 border-b border-line">
      {columns.map((c, i) => (
        <div key={c.label} className={align[i]}>
          <span className="text-sm font-medium text-ink-100">{c.label}</span>
          {c.count !== undefined && <span className="ml-1.5 text-sm text-ink-400 tabular">{c.count}</span>}
          {c.hint && <span className="block text-xs text-ink-400">{c.hint}</span>}
        </div>
      ))}
    </div>
  );
}

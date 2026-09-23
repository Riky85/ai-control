import VendorIcon from "@/components/VendorIcon";

/**
 * Mappa dell'AI estate a tre colonne: Provider → Sistema AI → Dati.
 * Solo relazioni reali dal database (vendor dell'asset, dataAccess).
 * SVG scritto a mano, nessuna libreria.
 */
export interface EstateSystem {
  id: string;
  name: string;
  vendor: string | null;
  risky: boolean;
  data: { name: string; sensitive: boolean }[];
}

const W = 900;
const ROW = 46;
const NODE_H = 32;
const COL_W = 210;
const X = [20, W / 2 - COL_W / 2, W - COL_W - 20];

export default function EstateGraph({ systems }: { systems: EstateSystem[] }) {
  const providers = Array.from(new Set(systems.map((s) => s.vendor ?? "Unknown vendor")));
  const dataMap = new Map<string, boolean>();
  systems.forEach((s) => s.data.forEach((d) => dataMap.set(d.name, (dataMap.get(d.name) ?? false) || d.sensitive)));
  const data = Array.from(dataMap.entries());

  const rows = Math.max(providers.length, systems.length, data.length, 1);
  const H = rows * ROW + 40;
  const y = (i: number, n: number) => (H - n * ROW) / 2 + i * ROW + ROW / 2;
  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const m = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${m} ${y1}, ${m} ${y2}, ${x2} ${y2}`;
  };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 24}`}>
      {["PROVIDERS", "AI SYSTEMS", "DATA"].map((t, i) => (
        <text key={t} x={X[i]} y={12} fontSize="10" letterSpacing="1" fill="#6E6E78" fontFamily="ui-monospace, monospace">
          {t}
        </text>
      ))}
      <g transform="translate(0,24)">
        {systems.map((s, si) => {
          const pi = providers.indexOf(s.vendor ?? "Unknown vendor");
          return (
            <g key={s.id}>
              <path d={curve(X[0] + COL_W, y(pi, providers.length), X[1], y(si, systems.length))} fill="none" stroke="#D5D5DE" strokeWidth={1.4} />
              {s.data.map((d) => {
                const di = data.findIndex(([n]) => n === d.name);
                return (
                  <path
                    key={d.name}
                    d={curve(X[1] + COL_W, y(si, systems.length), X[2], y(di, data.length))}
                    fill="none"
                    stroke={d.sensitive ? "#E7A9A4" : "#D5D5DE"}
                    strokeWidth={1.4}
                  />
                );
              })}
            </g>
          );
        })}

        {providers.map((p, i) => (
          <g key={p} transform={`translate(${X[0]}, ${y(i, providers.length) - NODE_H / 2})`}>
            <rect width={COL_W} height={NODE_H} rx={16} fill="#FFFFFF" stroke="#E6E6EB" />
            <g transform="translate(12, 8)">
              <VendorIcon vendor={p} size={16} />
            </g>
            <text x={36} y={20} fontSize="12" fill="#141418">{cut(p, 24)}</text>
          </g>
        ))}

        {systems.map((s, i) => (
          <a key={s.id} href={`/assets/${s.id}`}>
            <g transform={`translate(${X[1]}, ${y(i, systems.length) - NODE_H / 2})`}>
              <rect width={COL_W} height={NODE_H} rx={16} fill={s.risky ? "#FDF1F0" : "#ECECFC"} stroke={s.risky ? "#C4433B" : "#3D3FD9"} />
              <text x={COL_W / 2} y={20} fontSize="12" fontWeight={600} textAnchor="middle" fill={s.risky ? "#C4433B" : "#3D3FD9"}>
                {cut(s.name, 26)}
              </text>
            </g>
          </a>
        ))}

        {data.map(([name, sensitive], i) => (
          <g key={name} transform={`translate(${X[2]}, ${y(i, data.length) - NODE_H / 2})`}>
            <rect width={COL_W} height={NODE_H} rx={16} fill="#FFFFFF" stroke={sensitive ? "#C4433B" : "#E6E6EB"} />
            <text x={14} y={20} fontSize="12" fill={sensitive ? "#C4433B" : "#141418"}>{cut(name, 26)}</text>
          </g>
        ))}
        {data.length === 0 && (
          <text x={X[2]} y={H / 2} fontSize="12" fill="#6E6E78">No data sources declared yet</text>
        )}
      </g>
    </svg>
  );
}

function cut(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

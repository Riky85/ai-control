import { Edge, Node, ColumnTitle, curve, G } from "@/components/graph-parts";

/**
 * Mappa dell'AI estate: Provider → Sistema AI → Dati. Solo relazioni
 * reali dal database (vendor dell'asset, dataAccess).
 */
export interface EstateSystem {
  id: string;
  name: string;
  vendor: string | null;
  risky: boolean;
  data: { name: string; sensitive: boolean }[];
}

const W = 900;
const ROW = 52;
const COL = 230;

export default function EstateGraph({ systems }: { systems: EstateSystem[] }) {
  const providers = Array.from(new Set(systems.map((s) => s.vendor ?? "Unknown vendor")));
  const dataMap = new Map<string, boolean>();
  systems.forEach((s) => s.data.forEach((d) => dataMap.set(d.name, (dataMap.get(d.name) ?? false) || d.sensitive)));
  const data = Array.from(dataMap.entries());

  const rows = Math.max(providers.length, systems.length, data.length, 1);
  const H = rows * ROW + 16;
  const x = [0, W / 2 - COL / 2, W - COL];
  const y = (i: number, n: number) => (H - n * ROW) / 2 + i * ROW + ROW / 2;

  return (
    <svg width="100%" viewBox={`-4 0 ${W + 8} ${H + 28}`}>
      <ColumnTitle x={x[0]} text="PROVIDERS" />
      <ColumnTitle x={x[1]} text="AI SYSTEMS" />
      <ColumnTitle x={x[2]} text="DATA" />
      <g transform="translate(0,26)">
        {systems.map((s, si) => {
          const pi = providers.indexOf(s.vendor ?? "Unknown vendor");
          return (
            <g key={s.id}>
              <Edge d={curve(x[0] + COL, y(pi, providers.length), x[1], y(si, systems.length))} />
              {s.data.map((d) => {
                const di = data.findIndex(([n]) => n === d.name);
                return <Edge key={d.name} d={curve(x[1] + COL, y(si, systems.length), x[2], y(di, data.length))} alarm={d.sensitive} />;
              })}
            </g>
          );
        })}
        {providers.map((p, i) => (
          <Node key={p} x={x[0]} y={y(i, providers.length)} w={COL} label={p} kind="provider" vendor={p} />
        ))}
        {systems.map((s, i) => (
          <Node
            key={s.id}
            x={x[1]}
            y={y(i, systems.length)}
            w={COL}
            label={s.name}
            kind="system"
            vendor={s.vendor}
            name={s.name}
            emphasis
            tone={s.risky ? "alarm" : "default"}
            href={`/assets/${s.id}`}
          />
        ))}
        {data.map(([name, sensitive], i) => (
          <Node key={name} x={x[2]} y={y(i, data.length)} w={COL} label={name} sublabel={sensitive ? "Sensitive" : undefined} kind="data" tone={sensitive ? "alarm" : "default"} />
        ))}
        {data.length === 0 && <text x={x[2]} y={H / 2 + 4} fontSize="12" fill={G.muted}>No data sources declared yet</text>}
      </g>
    </svg>
  );
}

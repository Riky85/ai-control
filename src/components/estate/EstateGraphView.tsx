"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fromParts, impactOf, dependenciesOf, type GraphParts, type GNode, type NodeType } from "@/lib/estate/graph-core";

/**
 * Vista "Graph" dell'AI estate: layout a colonne (chi dipende a sinistra, fornitori a
 * destra), clic su un nodo per metterlo a fuoco, ricerca "What depends on…".
 * SVG semplice, nessuna libreria: i nodi sono poche centinaia al massimo.
 */

const COLS: NodeType[][] = [["process", "team"], ["application"], ["system"], ["model", "product", "data", "person"], ["deployment"], ["provider"]];
const TYPE_LABEL: Record<NodeType, string> = { process: "Process", team: "Team", application: "Application", system: "AI system", model: "Model", product: "Product", data: "Data", person: "Owner", deployment: "Deployment", provider: "Provider" };
// Toni neutri per tipo (opacità del testo sul fondo): nessun colore d'accento.
const TONE: Record<NodeType, number> = { process: 0.95, team: 0.55, application: 0.8, system: 1, model: 0.7, product: 0.7, data: 0.45, person: 0.45, deployment: 0.6, provider: 0.9 };

const NW = 144;
const NH = 26;
const GAP_Y = 8;
const GAP_X = 36;

const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export default function EstateGraphView({ parts, concentration }: { parts: GraphParts; concentration: { label: string; share: number } | null }) {
  const g = useMemo(() => fromParts(parts), [parts]);
  const [focus, setFocus] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Posizioni: colonne fisse, ordine nella colonna per baricentro dei vicini a sinistra.
  const layout = useMemo(() => {
    const cols = COLS.map((types) => parts.nodes.filter((n) => types.includes(n.type))).filter((c) => c.length);
    const pos = new Map<string, { x: number; y: number }>();
    cols.forEach((col, ci) => {
      const ordered = [...col].sort((a, b) => {
        const bary = (n: GNode) => {
          const ys = [...(g.in.get(n.key) ?? []).map((e) => pos.get(e.from)?.y), ...(g.out.get(n.key) ?? []).map((e) => pos.get(e.to)?.y)].filter((y): y is number => y != null);
          return ys.length ? ys.reduce((t, y) => t + y, 0) / ys.length : Infinity;
        };
        return bary(a) - bary(b) || a.type.localeCompare(b.type) || a.label.localeCompare(b.label);
      });
      ordered.forEach((n, i) => pos.set(n.key, { x: ci * (NW + GAP_X), y: i * (NH + GAP_Y) }));
    });
    const rows = Math.max(1, ...cols.map((c) => c.length));
    return { pos, width: cols.length * (NW + GAP_X) - GAP_X, height: rows * (NH + GAP_Y) - GAP_Y, cols };
  }, [parts, g]);

  const impact = useMemo(() => (focus ? impactOf(g, focus) : null), [g, focus]);
  const lit = useMemo(() => {
    if (!focus) return null;
    const s = new Set<string>([focus, ...dependenciesOf(g, focus)]);
    for (const k of [...(impact?.systems.map((x) => x.node.key) ?? []), ...(impact?.applications.map((x) => x.key) ?? []), ...(impact?.processes.map((x) => x.key) ?? []), ...(impact?.teams.map((x) => x.key) ?? [])]) s.add(k);
    // Tutto ciò che dipende dal nodo (anche i nodi intermedi, es. il modello sopra un fornitore).
    const stack = [focus];
    while (stack.length) {
      const k = stack.pop()!;
      for (const e of g.in.get(k) ?? []) if (e.relation !== "owned_by" && !s.has(e.from)) (s.add(e.from), stack.push(e.from));
    }
    return s;
  }, [g, focus, impact]);

  const pick = (label: string) => {
    setQuery(label);
    const n = parts.nodes.find((x) => x.label.toLowerCase() === label.trim().toLowerCase());
    if (n) setFocus(n.key);
  };

  const focused = focus ? g.nodes.get(focus) ?? null : null;

  if (!parts.nodes.length) return <p className="text-sm text-ink-400">No AI yet.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          list="estate-nodes"
          value={query}
          onChange={(e) => pick(e.target.value)}
          placeholder="What depends on… (OpenAI, a model, a dataset)"
          className="field w-full sm:w-80"
          aria-label="What depends on"
        />
        <datalist id="estate-nodes">
          {parts.nodes.map((n) => <option key={n.key} value={n.label}>{TYPE_LABEL[n.type]}</option>)}
        </datalist>
        {focus && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setFocus(null), setQuery(""))}>
            Clear
          </button>
        )}
        {concentration && concentration.share > 0 && (
          <span className="text-sm text-ink-400 sm:ml-auto">
            <span className="text-ink-100 font-medium tabular">{Math.round(concentration.share * 100)}%</span> of AI spend depends on {concentration.label}
          </span>
        )}
      </div>

      {focused && impact && (
        <div className="rounded-xl border border-line bg-panel px-5 py-4 flex flex-col gap-2">
          <div className="text-sm">
            <span className="font-bold text-ink-100">{focused.label}</span>
            <span className="text-ink-400"> · {TYPE_LABEL[focused.type]}</span>
            {focused.href && <Link href={focused.href} className="ml-3 text-xs text-ink-400 hover:text-ink-100 underline">Open</Link>}
          </div>
          <div className="text-sm text-ink-400">
            {[
              `${impact.systems.length} AI system${impact.systems.length === 1 ? "" : "s"}`,
              `${impact.applications.length} application${impact.applications.length === 1 ? "" : "s"}`,
              `${impact.processes.length} process${impact.processes.length === 1 ? "" : "es"}`,
              `${impact.teams.length} team${impact.teams.length === 1 ? "" : "s"}`,
              `${impact.data.length} data source${impact.data.length === 1 ? "" : "s"}`,
            ].join(" · ")}{" "}
            depend on it.
          </div>
          <div className="text-sm text-ink-100 tabular">
            {eur(impact.monthly.actualEur)} a month actual · {eur(impact.monthly.estimatedEur)} a month estimated · {eur(impact.annual.actualEur + impact.annual.estimatedEur)} a year
            {impact.monthly.unknown > 0 && <span className="text-ink-400"> · {impact.monthly.unknown} with no cost</span>}
          </div>
          {impact.systems.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {impact.systems.slice(0, 12).map((s) => (
                <Link key={s.node.key} href={s.node.href ?? "#"} className="text-xs rounded-full border border-line px-2 py-0.5 text-ink-400 hover:text-ink-100">
                  {s.node.label}{s.fraction < 1 ? ` · ${Math.round(s.fraction * 100)}%` : ""}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-line bg-panel p-4 overflow-x-auto">
        <svg width="100%" viewBox={`0 -24 ${layout.width} ${layout.height + 24}`} style={{ minWidth: Math.min(layout.width, 760) }} role="img" aria-label="AI estate graph" className="block">
          {layout.cols.map((c, ci) => (
            <text key={ci} x={ci * (NW + GAP_X)} y={-10} fontSize="11" fill="rgb(var(--c-muted))">
              {[...new Set(c.map((n) => TYPE_LABEL[n.type]))].join(" · ")}
            </text>
          ))}
          {parts.edges.map((e) => {
            const a = layout.pos.get(e.from);
            const b = layout.pos.get(e.to);
            if (!a || !b) return null;
            const on = !lit || (lit.has(e.from) && lit.has(e.to));
            const x1 = a.x + NW;
            const y1 = a.y + NH / 2;
            const x2 = b.x;
            const y2 = b.y + NH / 2;
            const back = x2 <= x1;
            const d = back ? `M ${a.x + NW / 2} ${a.y + NH} C ${a.x + NW / 2} ${y2 + 40}, ${b.x + NW / 2} ${y2 + 40}, ${b.x + NW / 2} ${b.y + NH}` : `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
            return <path key={e.id} d={d} fill="none" stroke={on && lit ? "rgb(var(--c-text))" : "rgb(var(--c-edge))"} strokeOpacity={on ? (lit ? 0.55 : 0.9) : 0.15} strokeWidth={1.2} strokeDasharray={e.source === "inferred" && e.status !== "confirmed" ? "4 3" : undefined} />;
          })}
          {parts.nodes.map((n) => {
            const p = layout.pos.get(n.key);
            if (!p) return null;
            const on = !lit || lit.has(n.key);
            const isFocus = n.key === focus;
            return (
              <g key={n.key} transform={`translate(${p.x},${p.y})`} opacity={on ? 1 : 0.25} className="cursor-pointer" onClick={() => (setFocus(isFocus ? null : n.key), setQuery(isFocus ? "" : n.label))}>
                <title>{`${TYPE_LABEL[n.type]}: ${n.label}${n.sub ? ` · ${n.sub}` : ""}`}</title>
                <rect width={NW} height={NH} rx={6} fill="rgb(var(--c-panel))" stroke={isFocus ? "rgb(var(--c-text))" : "rgb(var(--c-line))"} strokeWidth={isFocus ? 1.5 : 1} />
                <rect x={0} y={0} width={4} height={NH} rx={2} fill="rgb(var(--c-text))" fillOpacity={TONE[n.type] * 0.6} />
                <text x={12} y={NH / 2 + 4} fontSize="12" fill="rgb(var(--c-text))" fillOpacity={0.4 + TONE[n.type] * 0.6} fontWeight={n.type === "system" ? 600 : 400}>
                  {cut(n.label, 19)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-xs text-ink-400">Solid lines are observed, declared or from the catalog; dashed lines are inferred and wait for confirmation. Click a node to see what depends on it.</p>
    </div>
  );
}

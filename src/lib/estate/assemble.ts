/**
 * AI estate — assemblaggio puro (nessun database): dal materiale già letto (graph.ts)
 * a grafo, valutazioni, concentrazione, archi da rivedere e metriche dell'Overview.
 * Separato dal caricamento così si prova e si mostra con dati di esempio.
 */
import { buildGraph, providerConcentration, dependenciesOf, nodeKey, LIVE, type EstateGraph, type EstateInput } from "./graph-core";
import { assessSystem, type Assessment, type AssessContext, type SystemRow } from "./assess";

export interface PendingEdge {
  table: "dependency" | "model_use";
  id: string;
  from: string;
  to: string;
  relation: string;
  evidence: string | null;
  confidence: string;
}

export interface EstateData {
  graph: EstateGraph;
  rows: SystemRow[];
  assessments: Map<string, Assessment>;
  concentration: ReturnType<typeof providerConcentration>;
  processes: { id: string; name: string; criticality: string }[];
  applications: { id: string; name: string; vendor: string | null; kind: string; source: string }[];
  pending: PendingEdge[];
  /** Metriche dell'Overview (spec §15). */
  metrics: { providerConcentration: { label: string; share: number } | null; unowned: number; highDependencies: number; systems: number };
}

export function assembleEstate(a: { input: EstateInput; rows: SystemRow[]; ctx: AssessContext; applications: EstateData["applications"] }): EstateData {
  const { input, rows, ctx } = a;
  const graph = buildGraph(input);
  const assessments = new Map(rows.map((r) => [r.id, assessSystem(r, ctx)]));
  const concentration = providerConcentration(graph);

  // Archi dedotti ancora da confermare o rifiutare.
  const label = (k: string) => graph.nodes.get(k)?.label ?? k;
  const pending: PendingEdge[] = graph.edges
    .filter((e) => e.source === "inferred" && e.status === "active" && e.rowId && !e.id.startsWith("mud:"))
    .map((e) => ({ table: e.table as "dependency" | "model_use", id: e.rowId!, from: label(e.from), to: label(e.to), relation: e.relation, evidence: e.evidence, confidence: e.confidence }));

  // Metriche: concentrazione, AI senza owner, dipendenze alte (non pronte a uscire e con spesa o processi critici).
  const ownedSystems = new Set(graph.edges.filter((e) => e.relation === "owned_by" && LIVE(e.status)).map((e) => e.from));
  const critical = new Set<string>();
  for (const p of input.processes.filter((p) => p.criticality === "high" || p.criticality === "critical")) for (const k of dependenciesOf(graph, nodeKey("process", p.id))) critical.add(k);
  const highDependencies = rows.filter((r) => {
    const x = assessments.get(r.id)!;
    const spend = (r.cost.actualEur ?? r.cost.estimatedEur ?? 0) > 0;
    return x.exit.status === "Not ready" && (x.repl.applicable || r.uses.length > 0) && (spend || critical.has(nodeKey("system", r.id)));
  }).length;
  const top = concentration.rows[0];
  return {
    graph,
    rows,
    assessments,
    concentration,
    processes: input.processes,
    applications: a.applications,
    pending,
    metrics: {
      providerConcentration: top && concentration.total > 0 ? { label: top.label, share: top.share } : null,
      unowned: rows.filter((r) => !ownedSystems.has(nodeKey("system", r.id))).length,
      highDependencies,
      systems: rows.length,
    },
  };
}

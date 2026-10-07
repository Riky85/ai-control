/**
 * Grafo dell'AI estate — parte pura (nessun database): costruzione, attraversamento
 * in avanti e all'indietro, insiemi d'impatto e concentrazione della spesa.
 *
 * Convenzione: un arco va da chi dipende a ciò da cui dipende
 * (processo → applicazione → AI system → modello → fornitore; AI system → dati;
 * AI system → team "owned_by"). "Cosa dipende da X?" = chiusura all'indietro da X.
 *
 * Gli archi arrivano da tre fonti, sempre visibili: observed / declared / inferred
 * (tabelle Dependency e AiAssetModelUse) e "catalog" (modello → fornitore,
 * deployment → fornitore, prodotto → fornitore, dal catalogo globale).
 */

export type NodeType = "process" | "application" | "system" | "model" | "provider" | "deployment" | "data" | "team" | "person" | "product";
export type EdgeSource = "observed" | "declared" | "inferred" | "catalog";

export interface GNode {
  key: string;
  type: NodeType;
  id: string;
  label: string;
  sub?: string | null;
  href?: string | null;
}

export interface GEdge {
  id: string;
  from: string;
  to: string;
  relation: string;
  source: EdgeSource;
  origin: string;
  confidence: string;
  /** Quota di traffico/spesa dell'AI system su questo arco (solo uso di modelli). */
  share: number | null;
  /** Archi dello stesso uso di modello (modello + deployment) contano una volta sola. */
  useId: string | null;
  status: string;
  evidence: string | null;
  /** Riga d'origine, per confermare / rifiutare. */
  table: "dependency" | "model_use" | "catalog";
  rowId: string | null;
}

export interface SystemCost {
  actualEur: number | null;
  estimatedEur: number | null;
  actualSource?: string | null;
  estimatedBasis?: string | null;
}

export interface EstateInput {
  systems: { id: string; name: string; vendor: string | null; type: string; cost: SystemCost }[];
  modelUses: {
    id: string;
    aiAssetId: string;
    rawModel: string;
    modelId: string | null;
    modelName: string | null;
    providerId: string | null;
    deploymentId: string | null;
    deploymentName: string | null;
    deploymentHostId: string | null;
    share: number | null;
    source: string;
    origin: string;
    confidence: string;
    status: string;
    evidence: string | null;
  }[];
  deps: { id: string; fromType: string; fromId: string; toType: string; toId: string; relation: string; source: string; origin: string; confidence: string; status: string; evidence: string | null }[];
  processes: { id: string; name: string; criticality: string }[];
  applications: { id: string; name: string; vendor: string | null; kind: string }[];
  data: { id: string; name: string; sensitivity: string }[];
  persons: { id: string; label: string }[];
  /** Nomi dei fornitori e dei prodotti del catalogo (id → nome) e prodotto → fornitore. */
  providerNames: Record<string, string>;
  products: Record<string, { name: string; providerId: string }>;
}

export interface EstateGraph {
  nodes: Map<string, GNode>;
  edges: GEdge[];
  out: Map<string, GEdge[]>;
  in: Map<string, GEdge[]>;
  cost: Map<string, SystemCost>;
}

export const nodeKey = (type: NodeType, id: string) => `${type}:${id}`;

/** Archi che contano per l'attraversamento (rifiutati e superati esclusi). */
export const LIVE = (status: string) => status !== "rejected" && status !== "stale";

/** Relazioni di proprietà: non propagano l'impatto (un team non "dipende" dal sistema che possiede). */
const OWNERSHIP = new Set(["owned_by"]);

export function buildGraph(input: EstateInput): EstateGraph {
  const nodes = new Map<string, GNode>();
  const edges: GEdge[] = [];
  const add = (n: GNode) => {
    if (!nodes.has(n.key)) nodes.set(n.key, n);
    return n.key;
  };
  const providerNode = (id: string) => add({ key: nodeKey("provider", id), type: "provider", id, label: input.providerNames[id] ?? (id.startsWith("name:") ? id.slice(5) : id) });

  const systemIds = new Set(input.systems.map((s) => s.id));
  const cost = new Map<string, SystemCost>();
  for (const s of input.systems) {
    add({ key: nodeKey("system", s.id), type: "system", id: s.id, label: s.name, sub: s.vendor, href: `/assets/${s.id}` });
    cost.set(nodeKey("system", s.id), s.cost);
  }
  for (const p of input.processes) add({ key: nodeKey("process", p.id), type: "process", id: p.id, label: p.name, sub: `${p.criticality} criticality` });
  for (const a of input.applications) add({ key: nodeKey("application", a.id), type: "application", id: a.id, label: a.name, sub: a.vendor ?? (a.kind === "saas" ? "SaaS" : "Internal") });
  for (const d of input.data) add({ key: nodeKey("data", d.id), type: "data", id: d.id, label: d.name, sub: d.sensitivity === "PII" ? "PII" : d.sensitivity.charAt(0) + d.sensitivity.slice(1).toLowerCase().replace(/_/g, " ") });
  for (const p of input.persons) add({ key: nodeKey("person", p.id), type: "person", id: p.id, label: p.label });

  // Uso dei modelli: AI system → modello (+ deployment), modello → fornitore (catalogo).
  for (const u of input.modelUses) {
    if (!systemIds.has(u.aiAssetId)) continue;
    const sys = nodeKey("system", u.aiAssetId);
    const mKey = add({ key: nodeKey("model", u.modelId ?? `raw:${u.rawModel}`), type: "model", id: u.modelId ?? `raw:${u.rawModel}`, label: u.modelName ?? u.rawModel, sub: u.modelId ? null : "Not in the catalog" });
    const base = { source: u.source as EdgeSource, origin: u.origin, confidence: u.confidence, share: u.share, useId: u.id, status: u.status, evidence: u.evidence, table: "model_use" as const, rowId: u.id };
    edges.push({ ...base, id: `mu:${u.id}`, from: sys, to: mKey, relation: "uses" });
    if (u.providerId) edges.push({ id: `cat:${mKey}>${u.providerId}`, from: mKey, to: providerNode(u.providerId), relation: "made_by", source: "catalog", origin: "catalog", confidence: "HIGH", share: null, useId: null, status: "active", evidence: "angar model catalog", table: "catalog", rowId: null });
    if (u.deploymentId) {
      const dKey = add({ key: nodeKey("deployment", u.deploymentId), type: "deployment", id: u.deploymentId, label: u.deploymentName ?? u.deploymentId });
      edges.push({ ...base, id: `mud:${u.id}`, from: sys, to: dKey, relation: "runs_on" });
      if (u.deploymentHostId) edges.push({ id: `cat:${dKey}>${u.deploymentHostId}`, from: dKey, to: providerNode(u.deploymentHostId), relation: "hosted_by", source: "catalog", origin: "catalog", confidence: "HIGH", share: null, useId: null, status: "active", evidence: "angar deployment catalog", table: "catalog", rowId: null });
    }
  }

  // Archi generici.
  const ensure = (type: string, id: string): string | null => {
    const t = type as NodeType;
    const k = nodeKey(t, id);
    if (nodes.has(k)) return k;
    if (t === "team") return add({ key: k, type: "team", id, label: id });
    if (t === "provider") return providerNode(id);
    if (t === "product") {
      const p = input.products[id];
      const pk = add({ key: k, type: "product", id, label: p?.name ?? id });
      if (p) edges.push({ id: `cat:${pk}>${p.providerId}`, from: pk, to: providerNode(p.providerId), relation: "sold_by", source: "catalog", origin: "catalog", confidence: "HIGH", share: null, useId: null, status: "active", evidence: "angar product catalog", table: "catalog", rowId: null });
      return pk;
    }
    // Entità sparita (es. AI eliminata): l'arco si ignora.
    return null;
  };
  for (const d of input.deps) {
    const from = ensure(d.fromType, d.fromId);
    const to = ensure(d.toType, d.toId);
    if (!from || !to) continue;
    edges.push({ id: `dep:${d.id}`, from, to, relation: d.relation, source: d.source as EdgeSource, origin: d.origin, confidence: d.confidence, share: null, useId: null, status: d.status, evidence: d.evidence, table: "dependency", rowId: d.id });
  }

  // Archi del catalogo duplicati (stesso modello usato da più sistemi): uno solo.
  const seen = new Set<string>();
  const unique = edges.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  const out = new Map<string, GEdge[]>();
  const inn = new Map<string, GEdge[]>();
  for (const e of unique) {
    if (!LIVE(e.status)) continue;
    out.set(e.from, [...(out.get(e.from) ?? []), e]);
    inn.set(e.to, [...(inn.get(e.to) ?? []), e]);
  }
  return { nodes, edges: unique, out, in: inn, cost };
}

/** Tutto ciò da cui X dipende (in avanti), proprietà comprese. */
export function dependenciesOf(g: EstateGraph, key: string): Set<string> {
  const seen = new Set<string>();
  const stack = [key];
  while (stack.length) {
    const k = stack.pop()!;
    for (const e of g.out.get(k) ?? []) if (!seen.has(e.to)) (seen.add(e.to), stack.push(e.to));
  }
  seen.delete(key);
  return seen;
}

/** Tutto ciò che dipende da X (all'indietro), senza passare per gli archi di proprietà. */
export function dependentsOf(g: EstateGraph, key: string): Set<string> {
  const seen = new Set<string>();
  const stack = [key];
  while (stack.length) {
    const k = stack.pop()!;
    for (const e of g.in.get(k) ?? []) {
      if (OWNERSHIP.has(e.relation)) continue;
      if (!seen.has(e.from)) (seen.add(e.from), stack.push(e.from));
    }
  }
  seen.delete(key);
  return seen;
}

/** true se da `from` si arriva a `target` in avanti (senza proprietà). */
function reaches(g: EstateGraph, from: string, target: string, memo: Map<string, boolean>, path = new Set<string>()): boolean {
  if (from === target) return true;
  const m = memo.get(from);
  if (m !== undefined) return m;
  if (path.has(from)) return false;
  path.add(from);
  let r = false;
  for (const e of g.out.get(from) ?? []) {
    if (OWNERSHIP.has(e.relation)) continue;
    if (reaches(g, e.to, target, memo, path)) {
      r = true;
      break;
    }
  }
  path.delete(from);
  memo.set(from, r);
  return r;
}

/**
 * Quota (0..1) del lavoro di un AI system che dipende da X.
 * Uso di modelli con quota nota: somma delle quote dei modelli che portano a X (un uso conta
 * una volta anche se modello e deployment portano entrambi a X). Uso senza quota o arco
 * diverso (prodotto, fornitore dichiarato…): 1, prudente. Massimo 1.
 */
export function dependencyFraction(g: EstateGraph, systemKey: string, target: string, memo = new Map<string, boolean>()): number {
  if (systemKey === target) return 1;
  const uses = new Map<string, { share: number | null; hit: boolean }>();
  let other = 0;
  for (const e of g.out.get(systemKey) ?? []) {
    if (OWNERSHIP.has(e.relation)) continue;
    const hit = reaches(g, e.to, target, memo);
    if (e.useId) {
      const u = uses.get(e.useId) ?? { share: e.share, hit: false };
      u.hit ||= hit;
      uses.set(e.useId, u);
    } else if (hit) other = 1;
  }
  let f = other;
  for (const u of uses.values()) if (u.hit) f += u.share ?? 1;
  return Math.min(1, f);
}

export interface Money {
  /** Somma dei costi reali (fatturati) delle AI coinvolte, per la quota che dipende da X. */
  actualEur: number;
  /** Somma dei costi stimati delle AI senza un costo reale. */
  estimatedEur: number;
  /** AI coinvolte senza nessun costo noto. */
  unknown: number;
}

export interface ImpactSet {
  target: GNode;
  systems: { node: GNode; fraction: number; cost: SystemCost }[];
  applications: GNode[];
  processes: GNode[];
  teams: GNode[];
  data: GNode[];
  monthly: Money;
  annual: Money;
}

/** Insieme d'impatto: cosa si ferma o cambia se X sparisce, e quanta spesa mensile/annua ne dipende. */
export function impactOf(g: EstateGraph, key: string): ImpactSet | null {
  const target = g.nodes.get(key);
  if (!target) return null;
  const dep = dependentsOf(g, key);
  if (target.type === "system") dep.add(key);
  const memo = new Map<string, boolean>();
  const pick = (t: NodeType) => [...dep].map((k) => g.nodes.get(k)!).filter((n) => n && n.type === t).sort((a, b) => a.label.localeCompare(b.label));
  const systems = pick("system").map((node) => ({ node, fraction: dependencyFraction(g, node.key, key, memo), cost: g.cost.get(node.key) ?? { actualEur: null, estimatedEur: null } }));
  const teams = new Map<string, GNode>();
  for (const n of pick("team")) teams.set(n.key, n);
  const data = new Map<string, GNode>();
  // Team proprietari e dati letti dalle AI e dalle applicazioni coinvolte.
  for (const k of [...systems.map((s) => s.node.key), ...pick("application").map((a) => a.key)]) {
    for (const e of g.out.get(k) ?? []) {
      const n = g.nodes.get(e.to);
      if (!n) continue;
      if (e.relation === "owned_by" && n.type === "team") teams.set(n.key, n);
      if (n.type === "data") data.set(n.key, n);
    }
  }
  const monthly: Money = { actualEur: 0, estimatedEur: 0, unknown: 0 };
  for (const s of systems) {
    if (s.cost.actualEur != null) monthly.actualEur += s.cost.actualEur * s.fraction;
    else if (s.cost.estimatedEur != null) monthly.estimatedEur += s.cost.estimatedEur * s.fraction;
    else monthly.unknown++;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  monthly.actualEur = r2(monthly.actualEur);
  monthly.estimatedEur = r2(monthly.estimatedEur);
  const annual: Money = { actualEur: r2(monthly.actualEur * 12), estimatedEur: r2(monthly.estimatedEur * 12), unknown: monthly.unknown };
  return {
    target,
    systems,
    applications: pick("application"),
    processes: pick("process"),
    teams: [...teams.values()].sort((a, b) => a.label.localeCompare(b.label)),
    data: [...data.values()].sort((a, b) => a.label.localeCompare(b.label)),
    monthly,
    annual,
  };
}

/** Costo mensile più affidabile di un AI system: reale se c'è, altrimenti stimato. */
export const bestCost = (c: SystemCost | undefined) => c?.actualEur ?? c?.estimatedEur ?? 0;

export interface Concentration {
  providerKey: string;
  label: string;
  /** Quota (0..1) della spesa AI che dipende da questo fornitore. */
  share: number;
  spendEur: number;
  systems: number;
}

/** Quota della spesa AI che dipende da ciascun fornitore (le quote possono sommare oltre 1: un'AI su Azure dipende da Microsoft e da OpenAI). */
export function providerConcentration(g: EstateGraph): { total: number; rows: Concentration[] } {
  const systems = [...g.nodes.values()].filter((n) => n.type === "system");
  const total = systems.reduce((t, s) => t + bestCost(g.cost.get(s.key)), 0);
  const rows: Concentration[] = [];
  const memo = new Map<string, Map<string, boolean>>();
  for (const p of g.nodes.values()) {
    if (p.type !== "provider") continue;
    const m = memo.get(p.key) ?? new Map<string, boolean>();
    memo.set(p.key, m);
    let spend = 0;
    let n = 0;
    for (const s of systems) {
      const f = dependencyFraction(g, s.key, p.key, m);
      if (f > 0) {
        n++;
        spend += bestCost(g.cost.get(s.key)) * f;
      }
    }
    if (n) rows.push({ providerKey: p.key, label: p.label, share: total > 0 ? spend / total : 0, spendEur: Math.round(spend * 100) / 100, systems: n });
  }
  rows.sort((a, b) => b.share - a.share || b.systems - a.systems);
  return { total, rows };
}

/** Catena compatta a monte / a valle di un nodo, per la pagina dell'AI system. */
export function chainOf(g: EstateGraph, key: string) {
  const upstream = (g.in.get(key) ?? []).map((e) => ({ edge: e, node: g.nodes.get(e.from)! })).filter((x) => x.node);
  const downstream = (g.out.get(key) ?? []).map((e) => ({ edge: e, node: g.nodes.get(e.to)! })).filter((x) => x.node);
  // Secondo livello a valle: modello/deployment/prodotto → fornitore.
  const providers = new Map<string, { node: GNode; via: GNode; edge: GEdge }>();
  for (const d of downstream)
    for (const e of g.out.get(d.node.key) ?? []) {
      const n = g.nodes.get(e.to);
      if (n?.type === "provider" && !providers.has(`${n.key}|${e.relation}`)) providers.set(`${n.key}|${e.relation}`, { node: n, via: d.node, edge: e });
    }
  return { upstream, downstream, providers: [...providers.values()] };
}

/** Forma serializzabile del grafo (per il componente client della vista "Graph"). */
export interface GraphParts {
  nodes: GNode[];
  edges: GEdge[];
  cost: [string, SystemCost][];
}

export const toParts = (g: EstateGraph): GraphParts => ({ nodes: [...g.nodes.values()], edges: g.edges.filter((e) => LIVE(e.status)), cost: [...g.cost.entries()] });

export function fromParts(p: GraphParts): EstateGraph {
  const out = new Map<string, GEdge[]>();
  const inn = new Map<string, GEdge[]>();
  for (const e of p.edges) {
    if (!LIVE(e.status)) continue;
    out.set(e.from, [...(out.get(e.from) ?? []), e]);
    inn.set(e.to, [...(inn.get(e.to) ?? []), e]);
  }
  return { nodes: new Map(p.nodes.map((n) => [n.key, n])), edges: p.edges, out, in: inn, cost: new Map(p.cost) };
}

/**
 * Replaceability Score (0–100) di un AI system: deterministico e spiegabile.
 *
 * Due varianti:
 * - API (modelli): portabilità API, capacità, strumenti, contesto, modalità, dati
 *   (residenza), contratto; prova di comportamento (se manca, tetto al punteggio).
 * - Posti (ChatGPT Business, Claude Team…): sovrapposizione funzioni, numero di persone,
 *   export dei dati, contratto; pilota (se manca, tetto al punteggio).
 *
 * Le alternative vengono dal catalogo (AiModel / AiProduct). Il costo dell'alternativa è
 * sempre una STIMA del servizio prezzi; la classifica è per punteggio, compatibilità e
 * uso già presente in azienda, MAI per prezzo (il prezzo si mostra, non decide).
 *
 * Puro: nessun accesso al database (i dati arrivano da estate/graph.ts).
 */
import { catalog, resolveModel, getPrice, estimateTokenCost, estimateSeatCost, deploymentOf, providerNameOf } from "@/lib/pricing/service";
import type { CatModel, CatProduct, Capabilities } from "@/lib/pricing/catalog-data";
import { SERVICE_CATEGORY } from "@/lib/pricing/catalog";
import { toEur } from "@/lib/spend/fx";
import { surfaceOf, apiPortability, providerSpecificFromEndpoints, type ApiSurface } from "./portability";
import type { SystemCost } from "./graph-core";

// ───────────────────────── tipi ─────────────────────────

export type Effort = "Low" | "Medium" | "High";
export type Conf = "HIGH" | "MEDIUM" | "LOW";

export interface ModelUseIn {
  modelId: string | null;
  rawModel: string;
  deploymentId: string | null;
  region: string | null;
  share: number | null;
  inputTokens30d: number | null;
  outputTokens30d: number | null;
  spendEur30d: number | null;
  /** "actual" = dalla fatturazione; "estimated" = token × listino (Gateway). */
  spendKind: "actual" | "estimated" | null;
  endpoints: string[];
  maxPromptTokens: number | null;
  match: string | null;
}

export interface ProfileIn {
  requiredCapabilities: string[];
  notRequired: string[];
  minContextTokens: number | null;
  providerSpecific: string[];
  euResidencyRequired: boolean | null;
  dataExport: boolean | null;
}

export interface ContractIn {
  billingCycle: string | null;
  renewalDate: Date | null;
  source: string | null;
}

export interface EvaluationIn {
  candidateType: string;
  candidateId: string;
  tasks: number;
  passRate: number;
  passed: boolean;
  evaluatedAt: Date;
}

export interface ReplInput {
  system: { id: string; name: string; type: string; serviceId: string | null; users: number };
  uses: ModelUseIn[];
  /** Prodotto a posti attuale (abbonamento o servizio), per la variante posti. */
  seatProductId: string | null;
  paidSeats: number | null;
  profile: ProfileIn | null;
  /** Modalità solo UE dell'azienda o del Gateway. */
  orgEuOnly: boolean;
  contract: ContractIn | null;
  cost: SystemCost;
  evaluations: EvaluationIn[];
  /** Modelli e prodotti del catalogo già usati da altri AI system dell'azienda (migrazione più facile). */
  inUse?: string[];
  now: Date;
}

export interface Component {
  key: string;
  label: string;
  weight: number;
  /** 0..100; null = non provato (prova di comportamento). */
  score: number | null;
  /** Punti nel totale (somma dei punti = punteggio prima del tetto). */
  points: number;
  reason: string;
}

export interface Alternative {
  type: "model" | "product";
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  score: number;
  uncapped: number;
  compatibility: number;
  confidence: Conf;
  components: Component[];
  tested: boolean;
  /** Già usato in azienda da un altro AI system. */
  inUse: boolean;
  gaps: string[];
  effort: Effort;
  estimatedMonthlyEur: number | null;
  estimateBasis: string;
  savingEur: number | null;
}

export interface Replaceability {
  applicable: boolean;
  kind: "api" | "seat";
  reason: string | null;
  score: number | null;
  uncapped: number | null;
  /** Limiti che abbassano o fermano il punteggio (es. "Not tested"). */
  limiters: string[];
  components: Component[];
  effort: Effort | null;
  best: Alternative | null;
  /** Migliore alternativa di un ALTRO fornitore (per Exit readiness). */
  bestOtherProvider: Alternative | null;
  alternatives: Alternative[];
  /** Tutte le alternative valutate, in ordine. */
  all: Alternative[];
  current: { label: string; costEur: number | null; costKind: "actual" | "estimated" | null; surface: ApiSurface | null; providerSpecific: string[] };
  required: { capabilities: string[]; assumed: boolean; context: number | null; contextAssumed: boolean; modalitiesIn: string[]; euResidency: boolean };
}

/** Tetto del punteggio senza una prova di comportamento. */
export const UNTESTED_CAP = 60;
/** Peso della prova di comportamento quando c'è (il resto pesa 1 − questo). */
export const BEHAVIOUR_WEIGHT = 0.2;

export const API_WEIGHTS = { api: 20, capability: 20, tools: 15, context: 10, modality: 10, data: 10, contract: 15 } as const;
export const SEAT_WEIGHTS = { overlap: 35, users: 20, export: 15, contract: 30 } as const;

const TOOL_KEYS: (keyof Capabilities)[] = ["toolCalling", "structuredOutput", "mcp"];
const CAP_KEYS: (keyof Capabilities)[] = ["reasoning", "streaming", "caching", "batch", "embeddings", "fineTuning"];
const CAP_LABEL: Record<string, string> = {
  toolCalling: "tool calling",
  structuredOutput: "structured output",
  mcp: "MCP",
  reasoning: "reasoning",
  streaming: "streaming",
  caching: "prompt caching",
  batch: "batch",
  embeddings: "embeddings",
  fineTuning: "fine-tuning",
  vision: "vision",
  audio: "audio",
};
export const capLabel = (k: string) => CAP_LABEL[k] ?? k;

const CONF_RANK: Record<Conf, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 };
const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number) => (b === 0 ? 100 : Math.round((a / b) * 100));

// ───────────────────────── contratto ─────────────────────────

/** Contratto / lock-in (0–100): impegno annuale e distanza dal rinnovo. */
export function contractScore(c: ContractIn | null, kind: "api" | "seat", now: Date): { score: number; reason: string } {
  if (!c) return kind === "api" ? { score: 100, reason: "Pay as you go, no commitment recorded" } : { score: 70, reason: "Contract terms unknown" };
  let score = 100;
  const why: string[] = [];
  const annual = c.billingCycle === "annual";
  if (annual) {
    score -= 30;
    why.push("annual commitment");
  }
  if (c.renewalDate) {
    const days = Math.round((c.renewalDate.getTime() - now.getTime()) / 86400000);
    if (days > 180) {
      score -= 30;
      why.push(`renews in ${Math.round(days / 30)} months`);
    } else if (days > 90) {
      score -= 15;
      why.push(`renews in ${Math.round(days / 30)} months`);
    } else if (days >= 0) why.push(`renews in ${days} days`);
  } else if (annual) {
    score -= 15;
    why.push("renewal date unknown");
  }
  if (!annual && !c.renewalDate) why.push(c.billingCycle === "usage" ? "usage billing, no commitment" : "monthly, no commitment");
  return { score: Math.max(0, score), reason: why.join(" · ") };
}

// ───────────────────────── catalogo ─────────────────────────

const TIER_RANK: Record<string, number> = { light: 0, balanced: 1, frontier: 2 };
/** Quanti livelli si scende (frontier → balanced → light); 0 se si sale o non è noto. */
const tierDrop = (cur: string | null, alt: string | null) => (cur && alt && TIER_RANK[cur] != null && TIER_RANK[alt] != null ? Math.max(0, TIER_RANK[cur] - TIER_RANK[alt]) : 0);

const generativeClass = (m: CatModel) => (m.capabilities.embeddings || m.modalitiesOut.includes("embedding") ? "embedding" : "generative");

/** Deployment del catalogo con un prezzo per questo modello. */
export function deploymentsOfModel(modelId: string): string[] {
  return catalog()
    .rules.filter((r) => r.modelId === modelId && r.deploymentId && r.deploymentId !== "angar-estimate")
    .map((r) => r.deploymentId!);
}

/** Il modello si può usare in una regione UE (un deployment del catalogo con regione "eu"). */
export function euDeployment(modelId: string): string | null {
  for (const d of deploymentsOfModel(modelId)) {
    const dep = deploymentOf(d);
    if (dep?.regions.includes("eu")) return dep.name;
  }
  return null;
}

/** Prezzo medio "3 input + 1 output" per 1M token in EUR (solo per i rapporti tra modelli). */
export function blendedEur(modelId: string, deploymentId: string | null, at: Date): number | null {
  const i = getPrice(modelId, deploymentId, null, "input", at, { earliestIfBefore: true }) ?? (deploymentId ? getPrice(modelId, null, null, "input", at, { earliestIfBefore: true }) : null);
  if (!i) return null;
  const o = getPrice(modelId, i.deploymentId, null, "output", at, { earliestIfBefore: true });
  const inE = toEur(i.price, i.currency).eur;
  const outE = o ? toEur(o.price, o.currency).eur : null;
  return outE == null ? inE : (inE * 3 + outE) / 4;
}

function coverage(required: string[], caps: Capabilities): { covered: string[]; missing: string[]; unknown: string[] } {
  const covered: string[] = [];
  const missing: string[] = [];
  const unknown: string[] = [];
  for (const k of required) {
    const v = caps[k as keyof Capabilities];
    if (v === true) covered.push(k);
    else if (v === false) missing.push(k);
    else unknown.push(k);
  }
  return { covered, missing, unknown };
}

function effortApi(s: Record<string, number>): Effort {
  if (s.api < 50 || s.capability < 70 || s.tools < 70 || s.contract < 50) return "High";
  if (s.api >= 80 && s.capability >= 90 && s.tools >= 90 && s.context >= 90 && s.modality >= 90 && s.data >= 90) return "Low";
  return "Medium";
}

/** Somma pesata dei componenti, prova di comportamento e tetto: stessa regola per le due varianti. */
function finish(parts: Omit<Component, "points">[], behaviour: EvaluationIn | null): { components: Component[]; score: number; uncapped: number; tested: boolean } {
  const tested = !!behaviour;
  const scale = tested ? 1 - BEHAVIOUR_WEIGHT : 1;
  const components: Component[] = parts.map((p) => ({ ...p, points: r1(((p.score ?? 0) * p.weight * scale) / 100) }));
  if (tested) {
    const b = Math.round(behaviour!.passRate * 100);
    components.push({ key: "behaviour", label: "Behavioural validation", weight: BEHAVIOUR_WEIGHT * 100, score: b, points: r1(b * BEHAVIOUR_WEIGHT), reason: `${behaviour!.tasks} tasks, ${b}% passed${behaviour!.passed ? "" : " · marked failed"}` });
  } else {
    components.push({ key: "behaviour", label: "Behavioural validation", weight: 0, score: null, points: 0, reason: `Not tested · score capped at ${UNTESTED_CAP}` });
  }
  const uncapped = Math.round(components.reduce((t, c) => t + c.points, 0));
  // Una prova fallita non può dare un punteggio alto: stesso tetto di "non provato".
  const score = !tested || !behaviour!.passed ? Math.min(uncapped, UNTESTED_CAP) : uncapped;
  return { components, score, uncapped, tested };
}

const latestEval = (evals: EvaluationIn[], type: string, id: string) =>
  evals.filter((e) => e.candidateType === type && e.candidateId === id).sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime())[0] ?? null;

const bestCostOf = (c: SystemCost) => (c.actualEur != null ? { eur: c.actualEur, kind: "actual" as const } : c.estimatedEur != null ? { eur: c.estimatedEur, kind: "estimated" as const } : null);

// ───────────────────────── variante API ─────────────────────────

function apiReplaceability(i: ReplInput): Replaceability {
  const resolved = i.uses
    .map((u) => ({ u, m: u.modelId ? catalog().models.find((m) => m.id === u.modelId) ?? null : resolveModel(u.rawModel)?.model ?? null }))
    .filter((x): x is { u: ModelUseIn; m: CatModel } => !!x.m && x.m.providerId !== "angar");
  const cur = bestCostOf(i.cost);
  const base: Replaceability = {
    applicable: false,
    kind: "api",
    reason: null,
    score: null,
    uncapped: null,
    limiters: [],
    components: [],
    effort: null,
    best: null,
    bestOtherProvider: null,
    alternatives: [],
    all: [],
    current: { label: i.uses.map((u) => u.rawModel).join(", ") || "—", costEur: cur?.eur ?? null, costKind: cur?.kind ?? null, surface: null, providerSpecific: [] },
    required: { capabilities: [], assumed: true, context: null, contextAssumed: true, modalitiesIn: [], euResidency: false },
  };
  if (!resolved.length) return { ...base, reason: i.uses.length ? "The models this AI uses are not in the angar catalog yet" : "No model seen for this AI yet" };

  // Classe principale (generativa o embedding): quella con la quota più grande.
  const byClass = new Map<string, number>();
  for (const x of resolved) byClass.set(generativeClass(x.m), (byClass.get(generativeClass(x.m)) ?? 0) + (x.u.share ?? 1 / resolved.length));
  const cls = [...byClass.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const uses = resolved.filter((x) => generativeClass(x.m) === cls);
  const includedShare = Math.min(1, uses.reduce((t, x) => t + (x.u.share ?? 1 / resolved.length), 0));
  const limiters: string[] = [];
  if (uses.length < resolved.length) limiters.push(`${cls === "embedding" ? "Generative" : "Embeddings"} use scored separately`);

  // Requisiti: dichiarati, altrimenti tutto ciò che il modello attuale sa fare (prudente).
  const p = i.profile;
  const notReq = new Set(p?.notRequired ?? []);
  const declared = (p?.requiredCapabilities ?? []).filter((k) => k !== "vision" && k !== "audio");
  const fromModels = new Set<string>();
  for (const x of uses) for (const k of [...TOOL_KEYS, ...CAP_KEYS]) if (x.m.capabilities[k] === true) fromModels.add(k);
  const endpoints = [...new Set(uses.flatMap((x) => x.u.endpoints))];
  if (endpoints.includes("embeddings")) fromModels.add("embeddings");
  const assumed = declared.length === 0;
  const required = (assumed ? [...fromModels] : declared).filter((k) => !notReq.has(k)).sort();
  const toolsReq = required.filter((k) => (TOOL_KEYS as string[]).includes(k));
  const capsReq = required.filter((k) => !(TOOL_KEYS as string[]).includes(k));

  // Modalità: quelle del modello attuale (immagini → vision), salvo "non richiesto".
  const modIn = new Set<string>();
  for (const x of uses) for (const m of x.m.modalitiesIn) modIn.add(m);
  if (notReq.has("vision")) modIn.delete("image");
  if (notReq.has("audio")) modIn.delete("audio");
  const modsReq = [...modIn].sort();

  // Contesto: dichiarato o il prompt più lungo visto; altrimenti la finestra del modello attuale (prudente).
  const observedCtx = Math.max(0, ...uses.map((x) => x.u.maxPromptTokens ?? 0));
  const declaredCtx = p?.minContextTokens ?? 0;
  const contextAssumed = !observedCtx && !declaredCtx;
  const ctxReq = contextAssumed ? Math.max(0, ...uses.map((x) => x.m.contextWindow ?? 0)) || null : Math.max(observedCtx, declaredCtx);

  // Residenza dei dati.
  const euRequired = p?.euResidencyRequired ?? (i.orgEuOnly || uses.some((x) => x.u.region === "eu"));

  // API attuale e funzioni proprie del fornitore.
  const primary = [...uses].sort((a, b) => (b.u.share ?? 0) - (a.u.share ?? 0))[0];
  const surface = surfaceOf(primary.u.deploymentId ?? (primary.m.providerId === "openai" ? "openai-direct" : null) ?? `${primary.m.providerId}-direct`).surface;
  const providerSpecific = [...new Set([...providerSpecificFromEndpoints(endpoints), ...(p?.providerSpecific ?? [])])].sort();
  const contract = contractScore(i.contract, "api", i.now);

  const currentIds = new Set(uses.map((x) => x.m.id));
  const inUse = new Set(i.inUse ?? []);
  const candidates = catalog().models.filter((m) => m.providerId !== "angar" && !currentIds.has(m.id) && (m.lifecycle === "active") && generativeClass(m) === cls && deploymentsOfModel(m.id).length > 0);

  const alts: Alternative[] = [];
  for (const m of candidates) {
    const deps = deploymentsOfModel(m.id);
    // Deployment dell'alternativa: con la stessa API se c'è, altrimenti il diretto.
    const sameSurface = deps.find((d) => surfaceOf(d).surface === surface);
    const depId = sameSurface ?? deps.find((d) => surfaceOf(d).accepts.includes(surface)) ?? deps[0];
    const api = apiPortability(surface, surfaceOf(depId), providerSpecific);

    const capCov = coverage(capsReq, m.capabilities);
    const toolCov = coverage(toolsReq, m.capabilities);
    // Livello del modello: un livello più leggero non è equivalente finché non è provato.
    const steps = tierDrop(primary.m.tier, m.tier);
    const capScore = Math.max(0, pct(capCov.covered.length, capsReq.length) - 25 * steps);
    const toolScore = pct(toolCov.covered.length, toolsReq.length);
    const gapText = (c: ReturnType<typeof coverage>) => [...c.missing.map((k) => `no ${capLabel(k)}`), ...c.unknown.map((k) => `${capLabel(k)} unknown`)];

    const ctxScore = ctxReq && m.contextWindow ? Math.min(100, Math.round((m.contextWindow / ctxReq) * 100)) : ctxReq ? 0 : 100;
    const modCovered = modsReq.filter((x) => m.modalitiesIn.includes(x));
    const modScore = pct(modCovered.length, modsReq.length);
    const eu = euDeployment(m.id);
    const dataScore = !euRequired ? 100 : eu ? 100 : 0;

    const parts: Omit<Component, "points">[] = [
      { key: "api", label: "API portability", weight: API_WEIGHTS.api, score: api.score, reason: api.reason },
      { key: "capability", label: "Capability compatibility", weight: API_WEIGHTS.capability, score: capScore, reason: [steps ? `Lighter tier (${m.tier} vs ${primary.m.tier})` : null, capsReq.length ? gapText(capCov).join(", ") || `Covers ${capsReq.map(capLabel).join(", ")}` : "No special capability required"].filter(Boolean).join(" · ") },
      { key: "tools", label: "Tool compatibility", weight: API_WEIGHTS.tools, score: toolScore, reason: toolsReq.length ? (gapText(toolCov).join(", ") || `Covers ${toolsReq.map(capLabel).join(", ")}`) : "No tools required" },
      { key: "context", label: "Context", weight: API_WEIGHTS.context, score: ctxScore, reason: ctxReq ? `${m.contextWindow ? `${Math.round(m.contextWindow / 1000)}K` : "Unknown"} window for ${Math.round(ctxReq / 1000)}K needed${contextAssumed ? " (assumed)" : ""}` : "No context need known" },
      { key: "modality", label: "Modalities", weight: API_WEIGHTS.modality, score: modScore, reason: modsReq.length ? (modCovered.length === modsReq.length ? `Accepts ${modsReq.join(", ")}` : `Missing ${modsReq.filter((x) => !modCovered.includes(x)).join(", ")} input`) : "Text only" },
      { key: "data", label: "Data portability", weight: API_WEIGHTS.data, score: dataScore, reason: euRequired ? (eu ? `EU region on ${eu}` : "No EU region in the catalog") : "No residency constraint" },
      { key: "contract", label: "Contract / lock-in", weight: API_WEIGHTS.contract, score: contract.score, reason: contract.reason },
    ];
    const ev = latestEval(i.evaluations, "model", m.id);
    const fin = finish(parts, ev);
    const scores = Object.fromEntries(parts.map((x) => [x.key, x.score ?? 0]));
    const compatibility = Math.round((capScore * API_WEIGHTS.capability + toolScore * API_WEIGHTS.tools + ctxScore * API_WEIGHTS.context + modScore * API_WEIGHTS.modality) / (API_WEIGHTS.capability + API_WEIGHTS.tools + API_WEIGHTS.context + API_WEIGHTS.modality));

    // Costo stimato dell'alternativa sullo stesso lavoro.
    let alt = 0;
    let known = 0;
    let byTokens = 0;
    for (const x of uses) {
      const tin = x.u.inputTokens30d ?? 0;
      const tout = x.u.outputTokens30d ?? 0;
      if (tin + tout > 0) {
        const e = estimateTokenCost({ model: m.id, deployment: depId, inputTokens: tin, outputTokens: tout, at: i.now });
        if (e.known) {
          alt += e.eur;
          known++;
          byTokens++;
          continue;
        }
      }
      const spend = x.u.spendEur30d ?? (cur && x.u.share != null ? cur.eur * x.u.share : uses.length === 1 && cur ? cur.eur : null);
      const a = blendedEur(m.id, depId, i.now);
      const c = blendedEur(x.m.id, x.u.deploymentId, i.now);
      if (spend != null && a != null && c != null && c > 0) {
        alt += spend * (a / c);
        known++;
      }
    }
    const estimatedMonthlyEur = known === uses.length ? Math.round(alt * 100) / 100 : null;
    const estimateBasis =
      estimatedMonthlyEur == null
        ? "Not enough usage data to estimate"
        : byTokens === uses.length
          ? "Same tokens as the last 30 days × list price"
          : "Same token volume assumed (list price ratio)";
    const currentForUses = cur ? cur.eur * includedShare : null;
    const savingEur = estimatedMonthlyEur != null && currentForUses != null ? Math.round((currentForUses - estimatedMonthlyEur) * 100) / 100 : null;

    const anyUnknown = capCov.unknown.length + toolCov.unknown.length > 0;
    const confidence: Conf = anyUnknown || steps > 0 || primary.u.match === "family" || m.confidence === "LOW" ? "LOW" : assumed || contextAssumed || m.confidence === "MEDIUM" || estimateBasis.startsWith("Same token volume") ? "MEDIUM" : "HIGH";
    alts.push({
      type: "model",
      id: m.id,
      name: m.name,
      providerId: m.providerId,
      providerName: providerNameOf(m.providerId),
      score: fin.score,
      uncapped: fin.uncapped,
      compatibility,
      confidence,
      components: fin.components,
      tested: fin.tested,
      inUse: inUse.has(m.id),
      gaps: [...(steps ? ["lighter tier"] : []), ...gapText(capCov), ...gapText(toolCov), ...(ctxScore < 100 ? ["smaller context"] : []), ...(modScore < 100 ? ["fewer input types"] : []), ...(dataScore < 100 ? ["no EU region"] : [])],
      effort: effortApi(scores),
      estimatedMonthlyEur,
      estimateBasis,
      savingEur,
    });
  }
  // Classifica: punteggio, compatibilità, già in uso, confidenza. Il costo stimato NON entra
  // (un modello non si raccomanda perché costa meno); a parità decide l'id, per stabilità.
  alts.sort((a, b) => b.score - a.score || b.uncapped - a.uncapped || b.compatibility - a.compatibility || Number(b.inUse) - Number(a.inUse) || CONF_RANK[b.confidence] - CONF_RANK[a.confidence] || a.id.localeCompare(b.id));
  const best = alts[0] ?? null;
  if (best && !best.tested) limiters.push(`Not tested: capped at ${UNTESTED_CAP}`);
  if (best?.tested && !latestEval(i.evaluations, "model", best.id)!.passed) limiters.push(`Test failed: capped at ${UNTESTED_CAP}`);
  if (assumed) limiters.push("Requirements assumed from the current model");
  if (providerSpecific.length) limiters.push(`Provider-specific: ${providerSpecific.join(", ")}`);
  return {
    ...base,
    applicable: !!best,
    reason: best ? null : "No active alternative in the catalog",
    score: best?.score ?? null,
    uncapped: best?.uncapped ?? null,
    limiters,
    components: best?.components ?? [],
    effort: best?.effort ?? null,
    best,
    bestOtherProvider: alts.find((a) => !uses.some((x) => x.m.providerId === a.providerId)) ?? null,
    alternatives: alts.slice(0, 3),
    all: alts,
    current: { ...base.current, label: uses.map((x) => x.m.name).join(", "), surface, providerSpecific },
    required: { capabilities: required, assumed, context: ctxReq, contextAssumed, modalitiesIn: modsReq, euResidency: euRequired },
  };
}

// ───────────────────────── variante posti ─────────────────────────

/** Tipo di posto business predefinito di un prodotto a posti (per stimare il costo dell'alternativa). */
export function defaultSeatOf(productId: string) {
  const c = catalog();
  const plans = c.plans.filter((p) => p.productId === productId && p.status === "active" && p.audience !== "personal" && p.billingModel !== "CUSTOM");
  for (const pl of plans.sort((a, b) => (a.audience === "business" ? -1 : 1) - (b.audience === "business" ? -1 : 1))) {
    const st = c.seatTypes.find((s) => s.planId === pl.id && s.isDefault) ?? c.seatTypes.find((s) => s.planId === pl.id);
    if (st) return { plan: pl, seatType: st };
  }
  return null;
}

function usersScore(n: number): { score: number; reason: string } {
  if (n <= 0) return { score: 70, reason: "No usage data" };
  if (n <= 10) return { score: 100, reason: `${n} people to move` };
  if (n <= 50) return { score: 80, reason: `${n} people to move` };
  if (n <= 200) return { score: 60, reason: `${n} people to move` };
  return { score: 40, reason: `${n} people to move` };
}

function seatReplaceability(i: ReplInput, product: CatProduct): Replaceability {
  const cur = bestCostOf(i.cost);
  const cat = product.serviceId ? SERVICE_CATEGORY[product.serviceId] : undefined;
  const contract = contractScore(i.contract, "seat", i.now);
  const users = usersScore(i.system.users);
  const exp = i.profile?.dataExport;
  const exportPart = exp === true ? { score: 100, reason: "Data export available (declared)" } : exp === false ? { score: 0, reason: "No data export (declared)" } : { score: 50, reason: "Data export not known" };
  const seats = i.paidSeats ?? (i.system.users > 0 ? i.system.users : null);
  const base: Replaceability = {
    applicable: false,
    kind: "seat",
    reason: null,
    score: null,
    uncapped: null,
    limiters: [],
    components: [],
    effort: null,
    best: null,
    bestOtherProvider: null,
    alternatives: [],
    all: [],
    current: { label: product.name, costEur: cur?.eur ?? null, costKind: cur?.kind ?? null, surface: null, providerSpecific: [] },
    required: { capabilities: [], assumed: true, context: null, contextAssumed: true, modalitiesIn: [], euResidency: false },
  };
  if (!cat) return { ...base, reason: "Category of this product not known" };
  const inUse = new Set(i.inUse ?? []);
  const candidates = catalog().products.filter((p) => p.id !== product.id && p.kind !== "api" && p.serviceId && SERVICE_CATEGORY[p.serviceId] === cat && p.providerId !== product.providerId && defaultSeatOf(p.id));
  const alts: Alternative[] = [];
  for (const p of candidates) {
    const ds = defaultSeatOf(p.id)!;
    const parts: Omit<Component, "points">[] = [
      { key: "overlap", label: "Feature overlap", weight: SEAT_WEIGHTS.overlap, score: inUse.has(p.id) ? 80 : 70, reason: inUse.has(p.id) ? "Same category · already used in your company" : "Same category · feature parity not verified" },
      { key: "users", label: "Users", weight: SEAT_WEIGHTS.users, score: users.score, reason: users.reason },
      { key: "export", label: "Data export", weight: SEAT_WEIGHTS.export, score: exportPart.score, reason: exportPart.reason },
      { key: "contract", label: "Contract / lock-in", weight: SEAT_WEIGHTS.contract, score: contract.score, reason: contract.reason },
    ];
    const ev = latestEval(i.evaluations, "product", p.id);
    const fin = finish(parts, ev);
    const est = seats ? estimateSeatCost([{ seatType: ds.seatType.id, seats, cycle: i.contract?.billingCycle === "annual" ? "annual" : "monthly" }], i.now) : null;
    const estimatedMonthlyEur = est && est.known ? Math.round(est.eur * 100) / 100 : null;
    const effort: Effort = i.system.users > 200 || exp === false || contract.score < 50 ? "High" : i.system.users <= 10 && exp === true && contract.score >= 80 ? "Low" : "Medium";
    alts.push({
      type: "product",
      id: p.id,
      name: `${p.name} · ${ds.plan.name}`,
      providerId: p.providerId,
      providerName: providerNameOf(p.providerId),
      score: fin.score,
      uncapped: fin.uncapped,
      compatibility: inUse.has(p.id) ? 80 : 70,
      confidence: "LOW",
      components: fin.components,
      tested: fin.tested,
      inUse: inUse.has(p.id),
      gaps: ["feature parity not verified"],
      effort,
      estimatedMonthlyEur,
      estimateBasis: estimatedMonthlyEur != null ? `${seats} seats × list price` : "Seats or list price not known",
      savingEur: estimatedMonthlyEur != null && cur ? Math.round((cur.eur - estimatedMonthlyEur) * 100) / 100 : null,
    });
  }
  // Stessa regola della variante API: mai per prezzo.
  alts.sort((a, b) => b.score - a.score || b.uncapped - a.uncapped || Number(b.inUse) - Number(a.inUse) || a.id.localeCompare(b.id));
  const best = alts[0] ?? null;
  const limiters: string[] = [];
  if (best && !best.tested) limiters.push(`No pilot recorded: capped at ${UNTESTED_CAP}`);
  return { ...base, applicable: !!best, reason: best ? null : "No alternative in the catalog", score: best?.score ?? null, uncapped: best?.uncapped ?? null, limiters, components: best?.components ?? [], effort: best?.effort ?? null, best, bestOtherProvider: best, alternatives: alts.slice(0, 3), all: alts };
}

// ───────────────────────── ingresso ─────────────────────────

/** Replaceability di un AI system: variante API se usa modelli, variante posti se è un prodotto a posti. */
export function replaceability(i: ReplInput): Replaceability {
  if (i.uses.length) return apiReplaceability(i);
  const product = i.seatProductId ? catalog().products.find((p) => p.id === i.seatProductId) : null;
  if (product && product.kind !== "api") return seatReplaceability(i, product);
  return apiReplaceability(i);
}

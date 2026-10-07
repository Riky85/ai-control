/**
 * Impact Simulator — motore deterministico: "cosa succede se cambio questo?".
 *
 * Combina l'AI estate del cliente (grafo, uso dei modelli con token e quote, costi reali e
 * stimati, contratti, requisiti, prove) con il catalogo globale (prezzi versionati,
 * capability, deployment, regioni, ciclo di vita). Nessun LLM, nessun Date.now() qui:
 * stessi ingressi (estate + scenario + `now`) → stesso risultato.
 *
 * Regole della casa:
 * - ogni numero ha un tipo (observed / calculated / estimated / unknown) e una base di calcolo;
 * - reale e stimato restano separati;
 * - la compatibilità viene SOLO dai controlli di Replaceability e dai flag del catalogo:
 *   mai presunta. Un modello non si sceglie mai perché costa meno: costo e compatibilità insieme.
 *
 * Puro: nessun accesso al database (il caricamento sta in impact/index.ts).
 */
import { impactOf, nodeKey, dependencyFraction, type ImpactSet } from "@/lib/estate/graph-core";
import type { EstateData } from "@/lib/estate/assemble";
import type { SystemRow } from "@/lib/estate/assess";
import { replaceability, deploymentsOfModel, euDeployment, blendedEur, type Alternative, type ModelUseIn, type Replaceability } from "@/lib/estate/replaceability";
import { surfaceOf, apiPortability, providerSpecificFromEndpoints } from "@/lib/estate/portability";
import { catalog, modelById, deploymentOf, providerNameOf, resolveModel, estimateTokenCost, estimateSeatCost, getPrice, productByIdOf } from "@/lib/pricing/service";
import { SERVICE_CATEGORY } from "@/lib/pricing/catalog";
import { toEur } from "@/lib/spend/fx";
import type { Saving } from "@/lib/savings";
import type { BudgetAction, CalcLine, Compat, CompatStatus, Conf, ContractRow, Effort, ImpactResult, Kind, Named, PriceComponent, Risk, Scenario, SystemImpact, Val } from "./types";

// ───────────────────────── regole esplicite (mostrate in "Show calculation") ─────────────────────────

/** Costo di cambio: giorni di lavoro per livello di sforzo × tariffa giornaliera, più un'ora per persona da spostare. È una STIMA di angar, non un preventivo. */
export const SWITCHING_RULE = { dayRateEur: 800, days: { Low: 2, Medium: 8, High: 20 } as Record<Effort, number>, hoursEachPerson: 1 } as const;

/** Rischio: punti sommati; ≥4 alto, ≥2 medio. */
export const RISK_RULE = { criticalProcess: 2, sensitiveData: 1, compatNotProven: 2, notTested: 1, highEffort: 1, noFallback: 2, soonRetirement: 2, high: 4, medium: 2 } as const;

/** Classifica delle azioni per l'obiettivo di budget: risparmio annuo × peso confidenza ÷ peso sforzo. */
export const BUDGET_RANK = { conf: { HIGH: 1, MEDIUM: 0.7, LOW: 0.4 } as Record<Conf, number>, effort: { Low: 1, Medium: 1.5, High: 2.5 } as Record<Effort, number>, minCompatibility: 70 } as const;

const SENSITIVE_DATA = new Set(["PII", "Confidential", "Financial", "Source code"]);
const CONF_RANK: Record<Conf, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 };
const EFFORT_RANK: Record<Effort, number> = { Low: 0, Medium: 1, High: 2 };
const RISK_RANK: Record<Risk, number> = { Low: 0, Medium: 1, High: 2 };
const KIND_RANK: Record<Kind, number> = { observed: 0, calculated: 1, estimated: 2, unknown: 3 };
const DAY = 86400000;

// ───────────────────────── contesto ─────────────────────────

export interface ImpactContext {
  est: EstateData;
  /** Modalità solo UE dell'azienda o del Gateway. */
  orgEuOnly: boolean;
  now: Date;
  /** Suggerimenti del motore dei risparmi (solo per l'obiettivo di budget). */
  savings?: Saving[] | null;
}

interface Env {
  ctx: ImpactContext;
  rows: Map<string, SystemRow>;
  impact: (key: string) => ImpactSet | null;
  criticality: Map<string, string>;
}

function envOf(ctx: ImpactContext): Env {
  const memo = new Map<string, ImpactSet | null>();
  return {
    ctx,
    rows: new Map(ctx.est.rows.map((r) => [r.id, r])),
    impact: (key) => {
      if (!memo.has(key)) memo.set(key, impactOf(ctx.est.graph, key));
      return memo.get(key)!;
    },
    criticality: new Map(ctx.est.processes.map((p) => [p.id, p.criticality])),
  };
}

// ───────────────────────── numeri ─────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;
export function money(n: number | null | undefined): string {
  if (n == null) return "Unknown";
  const v = r2(n);
  const d = Math.abs(v) < 100 && Math.abs(v % 1) >= 0.01;
  return (v < 0 ? "−€" : "€") + Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: d ? 2 : 0, maximumFractionDigits: d ? 2 : 0 });
}
const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const pctText = (f: number) => `${Math.round(f * 100)}%`;

const V = (eur: number | null, kind: Kind, basis: string): Val => ({ eur: eur == null ? null : r2(eur), kind: eur == null ? "unknown" : kind, basis });
const UNKNOWN = (basis: string): Val => ({ eur: null, kind: "unknown", basis });
const worst = (...k: Kind[]): Kind => k.reduce((a, b) => (KIND_RANK[b] > KIND_RANK[a] ? b : a), "observed" as Kind);
const minConf = (...c: Conf[]): Conf => c.reduce((a, b) => (CONF_RANK[b] < CONF_RANK[a] ? b : a), "HIGH" as Conf);
const confOfKind = (k: Kind): Conf => (k === "observed" || k === "calculated" ? "HIGH" : k === "estimated" ? "MEDIUM" : "LOW");

// ───────────────────────── catalogo ─────────────────────────

const modelIdOf = (u: ModelUseIn): string | null => u.modelId ?? resolveModel(u.rawModel)?.model.id ?? null;
const modelName = (id: string | null) => (id ? modelById(id)?.name ?? id : "Unknown model");
const directDeployment = (providerId: string | null | undefined) => (providerId && deploymentOf(`${providerId}-direct`) ? `${providerId}-direct` : null);
const deploymentOfUse = (u: ModelUseIn): string | null => u.deploymentId ?? directDeployment(modelById(modelIdOf(u) ?? "")?.providerId);
/** Chi fissa il prezzo di un uso: chi ospita il deployment (Azure, Bedrock…) o il fornitore del modello. */
const publisherOf = (u: ModelUseIn): string | null => {
  const dep = u.deploymentId ? deploymentOf(u.deploymentId) : null;
  return dep?.hostProviderId ?? modelById(modelIdOf(u) ?? "")?.providerId ?? null;
};
const generativeClass = (id: string) => {
  const m = modelById(id);
  return m && (m.capabilities.embeddings || m.modalitiesOut.includes("embedding")) ? "embedding" : "generative";
};

/** Deployment dell'alternativa: stessa API se c'è, altrimenti uno che la accetta, altrimenti il primo (stessa regola di Replaceability). */
export function chooseDeployment(targetId: string, currentDeployment: string | null): string | null {
  const deps = deploymentsOfModel(targetId);
  if (!deps.length) return null;
  const surface = surfaceOf(currentDeployment).surface;
  return deps.find((d) => surfaceOf(d).surface === surface) ?? deps.find((d) => surfaceOf(d).accepts.includes(surface)) ?? deps[0];
}

// ───────────────────────── costo attuale ─────────────────────────

/** Quota del sistema toccata da alcuni dei suoi usi di modelli. */
export function useFraction(row: SystemRow, uses: ModelUseIn[]): { f: number; note: string; assumed: boolean } {
  if (!row.uses.length) return { f: 1, note: "whole system", assumed: false };
  if (uses.length >= row.uses.length) return { f: 1, note: "all of its model use", assumed: false };
  const known = row.uses.filter((u) => u.share != null);
  const unknownAll = row.uses.length - known.length;
  const rest = Math.max(0, 1 - known.reduce((t, u) => t + u.share!, 0));
  let f = 0;
  let assumed = false;
  for (const u of uses) {
    if (u.share != null) f += u.share;
    else {
      f += unknownAll ? rest / unknownAll : 0;
      assumed = true;
    }
  }
  return { f: Math.min(1, f), note: assumed ? "share not observed: equal split of the rest assumed" : "observed share of its traffic", assumed };
}

/** Costo mensile attuale di un sistema (o della sua quota): reale e stimato separati, base = reale se c'è. */
export function currentOf(row: SystemRow, f: number, why: string): SystemImpact["current"] {
  const c = row.cost;
  const part = f < 1 ? ` × ${pctText(f)} (${why})` : "";
  const actual = c.actualEur != null ? V(c.actualEur * f, f === 1 ? "observed" : "calculated", `${c.actualSource ?? "Billed"}: ${money(c.actualEur)} a month${part}`) : null;
  const estimated = c.estimatedEur != null ? V(c.estimatedEur * f, "estimated", `${c.estimatedBasis ?? "List price"}${part}`) : null;
  return { actual, estimated, base: actual ?? estimated ?? UNKNOWN("No billed amount and no estimate for this AI system") };
}

/** Costo attuale di alcuni usi: la fatturazione cloud del modello se c'è, altrimenti la quota del sistema. */
function useCurrent(row: SystemRow, uses: ModelUseIn[], f: number, why: string): SystemImpact["current"] {
  if (uses.length && uses.every((u) => u.spendKind === "actual" && u.spendEur30d != null)) {
    const sum = uses.reduce((t, u) => t + u.spendEur30d!, 0);
    const actual = V(sum, "observed", `Cloud billing for ${uses.map((u) => u.rawModel).join(", ")}, last 30 days`);
    const est = row.cost.estimatedEur != null ? V(row.cost.estimatedEur * f, "estimated", `${row.cost.estimatedBasis ?? "List price"}${f < 1 ? ` × ${pctText(f)}` : ""}`) : null;
    return { actual, estimated: est, base: actual };
  }
  return currentOf(row, f, why);
}

/** Costo di listino degli stessi token su un altro modello / deployment / regione. */
function listCost(modelId: string, deployment: string | null, region: string | null, tin: number, tout: number, at: Date) {
  const e = estimateTokenCost({ model: modelId, deployment, region, inputTokens: tin, outputTokens: tout, at });
  return e.known ? { eur: e.eur, basis: e.basis } : null;
}

interface SwapTarget {
  model: string;
  deployment: string | null;
  region?: string | null;
}

/**
 * Costo proiettato spostando alcuni usi su un altro modello/deployment.
 * Con i token osservati: attuale × (listino nuovo ÷ listino attuale) sugli stessi token (così
 * gli sconti già ottenuti restano nel conto); senza costo attuale, token × listino nuovo.
 * Senza token: rapporto dei listini (3 input : 1 output), confidenza bassa.
 */
function swapProjected(uses: ModelUseIn[], current: Val, target: (u: ModelUseIn) => SwapTarget | null, at: Date): { projected: Val; current: Val; method: "tokens" | "ratio" | "none" } {
  let lf = 0;
  let lt = 0;
  let tin = 0;
  let tout = 0;
  let tokensOk = uses.length > 0;
  for (const u of uses) {
    const mid = modelIdOf(u);
    const t = target(u);
    const i = u.inputTokens30d ?? 0;
    const o = u.outputTokens30d ?? 0;
    if (!mid || !t || i + o <= 0) {
      tokensOk = false;
      break;
    }
    const a = listCost(mid, deploymentOfUse(u), u.region, i, o, at);
    const b = listCost(t.model, t.deployment, t.region ?? u.region, i, o, at);
    if (!a || !b) {
      tokensOk = false;
      break;
    }
    lf += a.eur;
    lt += b.eur;
    tin += i;
    tout += o;
  }
  const names = [...new Set(uses.map((u) => target(u)).filter((x): x is SwapTarget => !!x).map((t) => `${modelName(t.model)}${t.deployment ? ` on ${deploymentOf(t.deployment)?.name ?? t.deployment}` : ""}${t.region === "eu" ? " (EU)" : ""}`))].join(", ");
  if (tokensOk && lf > 0) {
    const same = `${tokens(tin)} input + ${tokens(tout)} output tokens of the last 30 days`;
    if (current.eur != null) {
      const ratio = lt / lf;
      return {
        current,
        projected: V(current.eur * ratio, "estimated", `${money(current.eur)} × (${money(lt)} ÷ ${money(lf)}): ${names} vs current list price on the same ${same}`),
        method: "tokens",
      };
    }
    const cur = V(lf, "estimated", `Current models at list price on the same ${same}`);
    return { current: cur, projected: V(lt, "estimated", `${names} at list price on the same ${same}`), method: "tokens" };
  }
  // Senza token: rapporto dei listini pesato sulle quote.
  if (current.eur == null) return { current, projected: UNKNOWN("No current cost and no token counts: cannot project"), method: "none" };
  let w = 0;
  let acc = 0;
  for (const u of uses) {
    const mid = modelIdOf(u);
    const t = target(u);
    if (!mid || !t) return { current, projected: UNKNOWN("Target not known for every use"), method: "none" };
    const c = blendedEur(mid, deploymentOfUse(u), at);
    const a = blendedEur(t.model, t.deployment, at);
    if (c == null || a == null || c <= 0) return { current, projected: UNKNOWN(`No list price for ${modelName(c == null ? mid : t.model)}`), method: "none" };
    const weight = u.share ?? 1;
    w += weight;
    acc += weight * (a / c);
  }
  const ratio = w > 0 ? acc / w : 1;
  return { current, projected: V(current.eur * ratio, "estimated", `${money(current.eur)} × ${ratio.toFixed(3)}: list price ratio of ${names} (3 input : 1 output), same token volume assumed`), method: "ratio" };
}

// ───────────────────────── compatibilità ─────────────────────────

const NA: Compat = { status: "n/a", label: "No change to the model", score: null, gaps: [], checks: [], tested: false, target: null };
const compatOf = (status: CompatStatus, label: string, target: string | null, extra: Partial<Compat> = {}): Compat => ({ status, label, score: null, gaps: [], checks: [], tested: false, target, ...extra });

/** Compatibilità da un'alternativa valutata da Replaceability (capability, strumenti, contesto, modalità, dati, API). */
export function compatFromAlt(a: Alternative): Compat {
  const unknown = a.gaps.filter((g) => g.endsWith(" unknown"));
  const missing = a.gaps.filter((g) => !g.endsWith(" unknown"));
  const status: CompatStatus = missing.length ? "gaps" : unknown.length ? "unknown" : "fits";
  const label =
    status === "fits"
      ? a.tested
        ? "Fits · tested"
        : "Fits on paper · not tested"
      : status === "gaps"
        ? missing.slice(0, 2).join(", ").replace(/^./, (c) => c.toUpperCase()) + (missing.length > 2 ? ` +${missing.length - 2}` : "")
        : `Not known: ${unknown.join(", ")}`;
  return {
    status,
    label,
    score: a.compatibility,
    gaps: a.gaps,
    checks: a.components.filter((c) => c.key !== "contract").map((c) => ({ label: c.label, score: c.score, reason: c.reason })),
    tested: a.tested,
    target: a.name,
  };
}

function replFor(row: SystemRow, uses: ModelUseIn[], env: Env, orgEuOnly = env.ctx.orgEuOnly): Replaceability {
  return replaceability({
    system: { id: row.id, name: row.name, type: row.type, serviceId: row.serviceId, users: row.users },
    uses,
    seatProductId: uses.length ? null : row.seatProductId,
    paidSeats: row.paidSeats,
    profile: row.profile,
    orgEuOnly,
    contract: row.contract,
    cost: row.cost,
    evaluations: row.evaluations,
    now: env.ctx.now,
  });
}

/** Compatibilità di un modello di destinazione per alcuni usi di un sistema. Se Replaceability non lo valuta, si dice perché. */
export function modelCompat(row: SystemRow, uses: ModelUseIn[], targetId: string, env: Env): { compat: Compat; alt: Alternative | null } {
  const m = modelById(targetId);
  if (!m) return { compat: compatOf("unknown", "Not in the angar catalog", targetId), alt: null };
  if (uses.some((u) => modelIdOf(u) === targetId)) return { compat: { ...NA, label: "Already on this model", target: m.name }, alt: null };
  const r = replFor(row, uses, env);
  const a = r.all.find((x) => x.id === targetId) ?? null;
  if (a) return { compat: compatFromAlt(a), alt: a };
  if (m.lifecycle !== "active") return { compat: compatOf("blocked", `${m.name} is ${m.lifecycle} in the catalog`, m.name), alt: null };
  if (!deploymentsOfModel(targetId).length) return { compat: compatOf("unknown", "No priced deployment in the catalog", m.name), alt: null };
  const cur = uses.map(modelIdOf).find((x): x is string => !!x);
  if (!cur) return { compat: compatOf("unknown", "Current model not in the catalog: needs cannot be checked", m.name), alt: null };
  if (generativeClass(cur) !== generativeClass(targetId)) return { compat: compatOf("blocked", generativeClass(cur) === "embedding" ? "Not an embedding model" : "Embedding model, not generative", m.name), alt: null };
  return { compat: compatOf("unknown", r.reason ?? "Not evaluated", m.name), alt: null };
}

/** Stesso modello su un altro deployment: API, funzioni proprie del fornitore, disponibilità nel catalogo. */
function deploymentCompat(row: SystemRow, u: ModelUseIn, toDep: string): { compat: Compat; effort: Effort | null } {
  const mid = modelIdOf(u);
  const dep = deploymentOf(toDep);
  const name = dep?.name ?? toDep;
  if (!mid) return { compat: compatOf("unknown", "Current model not in the catalog", name), effort: null };
  if (!deploymentsOfModel(mid).includes(toDep)) return { compat: compatOf("blocked", `${modelName(mid)} is not offered on ${name} in the catalog`, name), effort: null };
  const specific = [...new Set([...providerSpecificFromEndpoints(u.endpoints), ...(row.profile?.providerSpecific ?? [])])].sort();
  const api = apiPortability(surfaceOf(deploymentOfUse(u)).surface, surfaceOf(toDep), specific);
  const status: CompatStatus = api.score >= 80 ? "fits" : "gaps";
  const effort: Effort = api.score >= 80 ? "Low" : api.score >= 50 ? "Medium" : "High";
  return {
    compat: {
      status,
      label: status === "fits" ? "Same model · same API format" : api.reason,
      score: api.score,
      gaps: status === "fits" ? [] : [api.reason],
      checks: [
        { label: "Model", score: 100, reason: `Same model (${modelName(mid)})` },
        { label: "API portability", score: api.score, reason: api.reason },
      ],
      tested: false,
      target: `${modelName(mid)} on ${name}`,
    },
    effort,
  };
}

const worstCompat = (list: Compat[]): Compat => {
  const order: CompatStatus[] = ["blocked", "unknown", "gaps", "fits", "n/a"];
  return [...list].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))[0] ?? NA;
};
const maxEffort = (list: (Effort | null)[]): Effort | null => {
  const k = list.filter((x): x is Effort => !!x);
  return k.length ? k.reduce((a, b) => (EFFORT_RANK[b] > EFFORT_RANK[a] ? b : a)) : null;
};

// ───────────────────────── costo di cambio, rischio, confidenza ─────────────────────────

export function switchingCost(effort: Effort | null, people = 0): Val {
  if (!effort) return UNKNOWN("Migration effort not known");
  const days = SWITCHING_RULE.days[effort];
  const labour = days * SWITCHING_RULE.dayRateEur;
  const onboarding = people > 0 ? (people * SWITCHING_RULE.hoursEachPerson * SWITCHING_RULE.dayRateEur) / 8 : 0;
  return V(labour + onboarding, "estimated", `${effort} effort = ${days} engineer days × ${money(SWITCHING_RULE.dayRateEur)} a day${people > 0 ? ` + ${people} people × ${SWITCHING_RULE.hoursEachPerson} hour to move` : ""} (angar rule, not a quote)`);
}

function riskOf(env: Env, row: SystemRow, compat: Compat, effort: Effort | null, extra: { noFallback?: boolean; retiresInDays?: number | null } = {}): { risk: Risk; why: string[] } {
  const why: string[] = [];
  let p = 0;
  const imp = env.impact(nodeKey("system", row.id));
  const critical = (imp?.processes ?? []).filter((n) => ["high", "critical"].includes(env.criticality.get(n.id) ?? ""));
  if (critical.length) {
    p += RISK_RULE.criticalProcess;
    why.push(`Critical process: ${critical.map((n) => n.label).join(", ")}`);
  }
  const sensitive = (imp?.data ?? []).filter((d) => SENSITIVE_DATA.has(d.sub ?? ""));
  if (sensitive.length) {
    p += RISK_RULE.sensitiveData;
    why.push(`Sensitive data: ${sensitive.map((d) => d.label).join(", ")}`);
  }
  if (compat.status === "gaps" || compat.status === "blocked" || compat.status === "unknown") {
    p += RISK_RULE.compatNotProven;
    why.push(compat.status === "gaps" ? "Capability gaps" : compat.status === "blocked" ? "Target not usable" : "Compatibility not known");
  } else if (compat.status === "fits" && !compat.tested) {
    p += RISK_RULE.notTested;
    why.push("Not tested on real tasks");
  }
  if (effort === "High") {
    p += RISK_RULE.highEffort;
    why.push("High migration effort");
  }
  if (extra.noFallback) {
    p += RISK_RULE.noFallback;
    why.push("No fallback configured");
  }
  if (extra.retiresInDays != null && extra.retiresInDays < 90) {
    p += RISK_RULE.soonRetirement;
    why.push(extra.retiresInDays < 0 ? "Already retired" : `Retires in ${extra.retiresInDays} days`);
  }
  return { risk: p >= RISK_RULE.high ? "High" : p >= RISK_RULE.medium ? "Medium" : "Low", why };
}

interface Draft {
  row: SystemRow;
  fraction: number | null;
  fractionNote: string;
  change: string;
  current: SystemImpact["current"];
  projected: Val;
  compat: Compat;
  effort: Effort | null;
  /** Confidenza della compatibilità (dall'alternativa) se c'è. */
  compatConf?: Conf | null;
  people?: number;
  status?: string | null;
  alternatives?: SystemImpact["alternatives"];
  noFallback?: boolean;
  retiresInDays?: number | null;
  method?: "tokens" | "ratio" | "none";
  assumedShare?: boolean;
  /** Nessuna migrazione (prezzo, guasto): costo di cambio 0. */
  noMigration?: boolean;
}

function finish(env: Env, d: Draft): SystemImpact {
  const base = d.current.base;
  const delta = base.eur != null && d.projected.eur != null ? V(d.projected.eur - base.eur, worst(base.kind === "observed" ? "calculated" : base.kind, d.projected.kind), `Projected ${money(d.projected.eur)} − current ${money(base.eur)}`) : UNKNOWN("Current or projected cost not known");
  const { risk, why } = riskOf(env, d.row, d.compat, d.effort, { noFallback: d.noFallback, retiresInDays: d.retiresInDays });
  const reasons: string[] = [];
  const costConf = d.method === "ratio" ? "LOW" : minConf(confOfKind(base.kind), confOfKind(d.projected.kind));
  if (d.method === "ratio") reasons.push("no token counts: list price ratio");
  if (base.kind === "unknown") reasons.push("current cost not known");
  if (d.assumedShare) reasons.push("traffic share assumed");
  const compatConf: Conf = d.compat.status === "n/a" ? "HIGH" : d.compatConf ?? (d.compat.status === "fits" ? "MEDIUM" : "LOW");
  if (d.compat.status !== "n/a" && compatConf !== "HIGH") reasons.push(d.compat.tested ? "compatibility partly checked" : "compatibility not tested");
  const confidence = minConf(costConf as Conf, compatConf, d.assumedShare ? "MEDIUM" : "HIGH");
  return {
    id: d.row.id,
    name: d.row.name,
    href: `/assets/${d.row.id}`,
    fraction: d.fraction,
    fractionNote: d.fractionNote,
    change: d.change,
    current: d.current,
    projected: d.projected,
    delta,
    compat: d.compat,
    effort: d.effort,
    switching: d.noMigration ? V(0, "calculated", "Nothing to migrate") : switchingCost(d.effort, d.people ?? 0),
    risk,
    riskWhy: why,
    confidence,
    confidenceWhy: reasons.length ? reasons.join(" · ") : base.kind === "observed" ? "Billed cost and catalog data" : "Catalog data",
    status: d.status ?? null,
    alternatives: d.alternatives,
  };
}

// ───────────────────────── assemblaggio del risultato ─────────────────────────

const named = (n: { key: string; id: string; label: string; sub?: string | null; href?: string | null }): Named => ({ id: n.id, label: n.label, sub: n.sub ?? null, href: n.href ?? null });

function contractsOf(env: Env, systems: SystemImpact[]): ContractRow[] {
  const now = env.ctx.now.getTime();
  const out: ContractRow[] = [];
  for (const s of systems) {
    const row = env.rows.get(s.id);
    const c = row?.contract;
    if (!row || !c) continue;
    const inDays = c.renewalDate ? Math.round((c.renewalDate.getTime() - now) / DAY) : null;
    const base = currentOf(row, 1, "").base;
    let committed: Val;
    if (c.billingCycle === "annual" && inDays != null && inDays > 0) {
      const months = Math.ceil(inDays / 30.4375);
      committed = base.eur != null ? V(base.eur * months, base.kind === "observed" ? "calculated" : base.kind, `${money(base.eur)} a month × ${months} months to renewal (annual commitment)`) : UNKNOWN("Annual commitment, monthly cost not known");
    } else if (c.billingCycle === "annual") committed = UNKNOWN("Annual commitment, renewal date not known");
    else committed = V(0, "calculated", c.billingCycle === "usage" ? "Usage billing, no commitment" : "Monthly, no commitment");
    out.push({ systemId: row.id, system: row.name, billingCycle: c.billingCycle, renewalDate: c.renewalDate ? c.renewalDate.toISOString().slice(0, 10) : null, inDays, source: c.source, committed });
  }
  return out.sort((a, b) => (a.inDays ?? 1e9) - (b.inDays ?? 1e9) || a.system.localeCompare(b.system));
}

function sumKind(vals: Val[]): Kind {
  if (!vals.length) return "calculated";
  const k = worst(...vals.map((v) => v.kind));
  return k === "observed" && vals.length > 1 ? "observed" : k;
}

interface Build {
  scenario: Scenario;
  title: string;
  question: string;
  systems: SystemImpact[];
  notes?: string[];
  exposedOnly?: boolean;
  budget?: ImpactResult["budget"];
  extraCalc?: CalcLine[];
  empty?: string | null;
}

function build(env: Env, b: Build): ImpactResult {
  const systems = [...b.systems].sort((x, y) => (y.current.base.eur ?? -1) - (x.current.base.eur ?? -1) || x.name.localeCompare(y.name));
  // Applicazioni, processi, team e dati: chi dipende dai sistemi toccati (stesso grafo di "What depends on…").
  const apps = new Map<string, Named>();
  const procs = new Map<string, Named>();
  const teams = new Map<string, Named>();
  const data = new Map<string, Named>();
  for (const s of systems) {
    const imp = env.impact(nodeKey("system", s.id));
    if (!imp) continue;
    for (const n of imp.applications) apps.set(n.key, named(n));
    for (const n of imp.processes) procs.set(n.key, named(n));
    for (const n of imp.teams) teams.set(n.key, named(n));
    for (const n of imp.data) data.set(n.key, named(n));
  }
  const sortN = (m: Map<string, Named>) => [...m.values()].sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));

  const actuals = systems.map((s) => s.current.actual).filter((v): v is Val => !!v && v.eur != null);
  const estOnly = systems.filter((s) => !s.current.actual && s.current.estimated?.eur != null).map((s) => s.current.estimated!);
  const unknown = systems.filter((s) => s.current.base.eur == null).length;
  const aSum = actuals.reduce((t, v) => t + v.eur!, 0);
  const eSum = estOnly.reduce((t, v) => t + v.eur!, 0);
  const currentActual = V(aSum, sumKind(actuals), actuals.length ? `Billed amounts of ${actuals.length} AI system${actuals.length === 1 ? "" : "s"} (affected share)` : "No billed amount");
  const currentEstimated = V(eSum, estOnly.length ? "estimated" : "calculated", estOnly.length ? `Estimates for ${estOnly.length} AI system${estOnly.length === 1 ? "" : "s"} with no billed amount` : "No estimate needed");
  const curKinds: Kind[] = [...(actuals.length ? [sumKind(actuals)] : []), ...(estOnly.length ? (["estimated"] as Kind[]) : [])];
  const current = V(aSum + eSum, curKinds.length ? worst(...curKinds) : "calculated", `Actual ${money(aSum)} + estimated ${money(eSum)}${unknown ? ` · ${unknown} with no cost` : ""}`);
  const deltas = systems.filter((s) => s.delta.eur != null);
  const unknownDelta = systems.length - deltas.length;
  const dSum = deltas.reduce((t, s) => t + s.delta.eur!, 0);
  const dKind = deltas.length ? worst(...deltas.map((s) => s.delta.kind)) : "calculated";
  const delta = b.exposedOnly ? V(0, "calculated", "Spend does not change: it is exposed") : V(dSum, dKind, `Sum of ${deltas.length} AI system${deltas.length === 1 ? "" : "s"} with a known projection${unknownDelta ? ` · ${unknownDelta} left unchanged (projection not known)` : ""}`);
  const projected = b.exposedOnly ? V(aSum + eSum, current.kind, "Unchanged") : V(aSum + eSum + dSum, worst(current.kind, dKind), `Current ${money(aSum + eSum)} ${dSum < 0 ? "−" : "+"} ${money(Math.abs(dSum))}`);
  const annualDelta = V(delta.eur! * 12, delta.kind, `${money(delta.eur)} a month × 12`);

  const sw = systems.filter((s) => s.switching.eur != null);
  const switching = systems.length && sw.length === systems.length ? V(sw.reduce((t, s) => t + s.switching.eur!, 0), sw.some((s) => s.switching.kind === "estimated") ? "estimated" : "calculated", `Sum of ${sw.length} AI systems · ${SWITCHING_RULE.days.Low}/${SWITCHING_RULE.days.Medium}/${SWITCHING_RULE.days.High} engineer days for Low/Medium/High effort × ${money(SWITCHING_RULE.dayRateEur)} a day`) : sw.length ? V(sw.reduce((t, s) => t + s.switching.eur!, 0), "estimated", `${sw.length} of ${systems.length} AI systems with a known effort`) : UNKNOWN("Migration effort not known");
  const risk = systems.reduce<Risk>((a, s) => (RISK_RANK[s.risk] > RISK_RANK[a] ? s.risk : a), "Low");
  const confidence = systems.length ? minConf(...systems.map((s) => s.confidence)) : "LOW";
  const lowest = systems.find((s) => s.confidence === confidence);

  const calc: CalcLine[] = [];
  for (const s of systems) {
    calc.push({ label: `${s.name} · current`, value: money(s.current.base.eur), kind: s.current.base.kind, basis: s.current.base.basis });
    if (s.current.actual && s.current.estimated) calc.push({ label: `${s.name} · estimated (for comparison)`, value: money(s.current.estimated.eur), kind: s.current.estimated.kind, basis: s.current.estimated.basis });
    if (!b.exposedOnly) calc.push({ label: `${s.name} · projected`, value: money(s.projected.eur), kind: s.projected.kind, basis: s.projected.basis });
    if (s.switching.eur) calc.push({ label: `${s.name} · switching cost`, value: money(s.switching.eur), kind: s.switching.kind, basis: s.switching.basis });
  }
  calc.push(...(b.extraCalc ?? []));
  calc.push({ label: "Risk rule", value: "Points", kind: "calculated", basis: `Critical process +${RISK_RULE.criticalProcess} · sensitive data +${RISK_RULE.sensitiveData} · compatibility not proven +${RISK_RULE.compatNotProven} · not tested +${RISK_RULE.notTested} · high effort +${RISK_RULE.highEffort} · no fallback +${RISK_RULE.noFallback} · retires within 90 days +${RISK_RULE.soonRetirement} · High from ${RISK_RULE.high}, Medium from ${RISK_RULE.medium}` });

  return {
    scenario: b.scenario,
    title: b.title,
    question: b.question,
    systems,
    applications: sortN(apps),
    processes: sortN(procs),
    teams: sortN(teams),
    data: sortN(data),
    contracts: contractsOf(env, systems),
    spend: { currentActual, currentEstimated, unknown, current, projected, delta, annualDelta, exposedOnly: b.exposedOnly },
    effort: maxEffort(systems.map((s) => s.effort)),
    switching,
    risk,
    confidence,
    confidenceWhy: lowest ? `${lowest.name}: ${lowest.confidenceWhy}` : "Nothing affected",
    budget: b.budget,
    notes: b.notes ?? [],
    calc,
    empty: b.empty ?? (systems.length ? null : "No AI system is affected."),
  };
}

// ───────────────────────── 1. sostituire un modello ─────────────────────────

export function replaceModel(ctx: ImpactContext, sc: Extract<Scenario, { s: "replace-model" }>): ImpactResult {
  const env = envOf(ctx);
  const fromName = modelName(sc.from);
  const toName = modelName(sc.to);
  const systems: SystemImpact[] = [];
  for (const row of ctx.est.rows) {
    if (sc.system && row.id !== sc.system) continue;
    const uses = row.uses.filter((u) => modelIdOf(u) === sc.from);
    if (!uses.length) continue;
    const fr = useFraction(row, uses);
    const cur = useCurrent(row, uses, fr.f, fr.note);
    const { compat, alt } = modelCompat(row, uses, sc.to, env);
    const sw = swapProjected(uses, cur.base, (u) => ({ model: sc.to, deployment: chooseDeployment(sc.to, deploymentOfUse(u)) }), ctx.now);
    systems.push(
      finish(env, {
        row,
        fraction: fr.f,
        fractionNote: fr.note,
        change: `${fromName} → ${toName}`,
        current: sw.current === cur.base ? cur : { ...cur, base: sw.current, estimated: cur.estimated ?? sw.current },
        projected: compat.status === "n/a" ? cur.base : sw.projected,
        compat,
        effort: alt?.effort ?? (compat.status === "blocked" ? "High" : null),
        compatConf: alt?.confidence ?? null,
        method: sw.method,
        assumedShare: fr.assumed,
      }),
    );
  }
  return build(env, {
    scenario: sc,
    title: `Replace ${fromName} with ${toName}`,
    question: `What happens if ${sc.system ? env.rows.get(sc.system)?.name ?? "this AI system" : "every AI system"} moves from ${fromName} to ${toName}?`,
    systems,
    notes: [
      "Costs use the same tokens as the last 30 days. A cheaper token price can still cost more if the model needs more tokens, retries or tool calls: test on real tasks before switching.",
      ...(modelById(sc.to)?.lifecycle && modelById(sc.to)!.lifecycle !== "active" ? [`${toName} is ${modelById(sc.to)!.lifecycle} in the catalog.`] : []),
    ],
    empty: systems.length ? null : `No AI system uses ${fromName}.`,
  });
}

// ───────────────────────── 2. sostituire un fornitore ─────────────────────────

/** Migliore alternativa di un fornitore: ordine di Replaceability; a pari punteggio, lo stesso livello del modello attuale. */
export function pickFromProvider(r: Replaceability, providerId: string, tier: string | null): Alternative | null {
  const list = r.all.filter((a) => a.providerId === providerId);
  if (!list.length) return null;
  const top = list.filter((a) => a.score === list[0].score && a.compatibility === list[0].compatibility);
  return top.find((a) => modelById(a.id)?.tier === tier) ?? list[0];
}

export function replaceProvider(ctx: ImpactContext, sc: Extract<Scenario, { s: "replace-provider" }>): ImpactResult {
  const env = envOf(ctx);
  const toDep = deploymentOf(sc.to) ? sc.to : null;
  const toLabel = toDep ? deploymentOf(toDep)!.name : providerNameOf(sc.to);
  const fromLabel = deploymentOf(sc.from)?.name ?? providerNameOf(sc.from);
  const systems: SystemImpact[] = [];
  for (const row of ctx.est.rows) {
    if (sc.system && row.id !== sc.system) continue;
    const uses = row.uses.filter((u) => {
      const m = modelById(modelIdOf(u) ?? "");
      const dep = deploymentOfUse(u);
      const hit = m?.providerId === sc.from || deploymentOf(dep ?? "")?.hostProviderId === sc.from || dep === sc.from;
      return hit && !(toDep && dep === toDep);
    });
    if (uses.length) {
      const fr = useFraction(row, uses);
      const cur = useCurrent(row, uses, fr.f, fr.note);
      if (toDep) {
        // Stesso modello su un altro deployment (es. OpenAI → Azure OpenAI).
        const per = uses.map((u) => deploymentCompat(row, u, toDep));
        const compat = worstCompat(per.map((p) => p.compat));
        const blocked = compat.status === "blocked";
        const sw = blocked ? null : swapProjected(uses, cur.base, (u) => ({ model: modelIdOf(u)!, deployment: toDep }), ctx.now);
        systems.push(
          finish(env, {
            row,
            fraction: fr.f,
            fractionNote: fr.note,
            change: `${[...new Set(uses.map((u) => modelName(modelIdOf(u))))].join(", ")} → ${toLabel}`,
            current: sw && sw.current !== cur.base ? { ...cur, base: sw.current } : cur,
            projected: sw ? sw.projected : UNKNOWN(compat.label),
            compat,
            effort: blocked ? "High" : maxEffort(per.map((p) => p.effort)),
            compatConf: blocked ? "LOW" : "MEDIUM",
            method: sw?.method ?? "none",
            assumedShare: fr.assumed,
          }),
        );
      } else {
        // Altro fornitore: per ogni classe d'uso (generativa / embedding) il modello più compatibile
        // di quel fornitore (classifica di Replaceability, a parità lo stesso livello): mai per prezzo.
        const groups = new Map<string, ModelUseIn[]>();
        for (const u of uses) {
          const id = modelIdOf(u);
          const k = id ? generativeClass(id) : "unknown";
          groups.set(k, [...(groups.get(k) ?? []), u]);
        }
        const parts = [...groups.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([cls, g]) => {
          const alt = cls === "unknown" ? null : pickFromProvider(replFor(row, g, env), sc.to, modelById(modelIdOf(g[0])!)?.tier ?? null);
          const gf = useFraction(row, g);
          const gc = useCurrent(row, g, gf.f, gf.note).base;
          const sw = alt ? swapProjected(g, gc, (u) => ({ model: alt.id, deployment: chooseDeployment(alt.id, deploymentOfUse(u)) }), ctx.now) : null;
          const compat = alt ? compatFromAlt(alt) : compatOf("blocked", cls === "unknown" ? "Current model not in the catalog" : `No active ${toLabel} ${cls === "embedding" ? "embedding " : ""}model fits in the catalog`, toLabel);
          return { g, alt, sw, compat };
        });
        const allSw = parts.every((x) => x.sw && x.sw.projected.eur != null);
        const proj = allSw ? V(parts.reduce((t, x) => t + x.sw!.projected.eur!, 0), "estimated", parts.map((x) => x.sw!.projected.basis).join(" + ")) : UNKNOWN(parts.filter((x) => !x.sw || x.sw.projected.eur == null).map((x) => (x.sw ? x.sw.projected.basis : x.compat.label)).join(" · "));
        const curSum = parts.every((x) => x.sw && x.sw.current.eur != null) && cur.base.eur == null ? V(parts.reduce((t, x) => t + x.sw!.current.eur!, 0), "estimated", "Current models at list price on the same tokens") : null;
        systems.push(
          finish(env, {
            row,
            fraction: fr.f,
            fractionNote: fr.note,
            change: parts.map((x) => `${[...new Set(x.g.map((u) => modelName(modelIdOf(u))))].join(", ")} → ${x.alt?.name ?? "none"}`).join(" · "),
            current: curSum ? { ...cur, base: curSum } : cur,
            projected: proj,
            compat: worstCompat(parts.map((x) => x.compat)),
            effort: maxEffort(parts.map((x) => x.alt?.effort ?? "High")),
            compatConf: minConf(...parts.map((x) => x.alt?.confidence ?? "LOW")),
            method: parts.some((x) => x.sw?.method === "ratio") ? "ratio" : parts.every((x) => x.sw?.method === "tokens") ? "tokens" : "none",
            assumedShare: fr.assumed,
          }),
        );
      }
      continue;
    }
    // Prodotti a posti del fornitore (ChatGPT, Copilot…): alternativa dello stesso tipo dall'altro fornitore.
    const product = row.uses.length ? null : productByIdOf(row.seatProductId);
    if (!toDep && product && product.providerId === sc.from) {
      const r = replFor(row, [], env);
      const alt = r.all.find((a) => a.providerId === sc.to) ?? null;
      const cur = currentOf(row, 1, "");
      const compat = alt ? compatFromAlt(alt) : compatOf("blocked", `No ${toLabel} product of the same kind in the catalog`, toLabel);
      systems.push(
        finish(env, {
          row,
          fraction: 1,
          fractionNote: "whole system",
          change: `${product.name} → ${alt?.name ?? toLabel}`,
          current: cur,
          projected: alt?.estimatedMonthlyEur != null ? V(alt.estimatedMonthlyEur, "estimated", alt.estimateBasis) : UNKNOWN(alt ? alt.estimateBasis : compat.label),
          compat,
          effort: alt?.effort ?? "High",
          compatConf: alt?.confidence ?? "LOW",
          people: row.paidSeats ?? row.users,
        }),
      );
    }
  }
  return build(env, {
    scenario: sc,
    title: `Move from ${fromLabel} to ${toLabel}`,
    question: `What happens if ${sc.system ? env.rows.get(sc.system)?.name ?? "this AI system" : "the company"} moves from ${fromLabel} to ${toLabel}?`,
    systems,
    notes: toDep
      ? [`Same models, served by ${toLabel}. Prices are ${toLabel} list prices from the catalog.`]
      : [`For each AI system the ${toLabel} model with the best compatibility is chosen (Replaceability ranking), never the cheapest.`],
    empty: systems.length ? null : `No AI system depends on ${fromLabel} through a model or a seat product.`,
  });
}

// ───────────────────────── 3. togliere un AI system ─────────────────────────

export function removeSystem(ctx: ImpactContext, sc: Extract<Scenario, { s: "remove-system" }>): ImpactResult {
  const env = envOf(ctx);
  const row = env.rows.get(sc.system);
  if (!row) return build(env, { scenario: sc, title: "Remove an AI system", question: "", systems: [], empty: "This AI system is not in the estate." });
  const imp = env.impact(nodeKey("system", row.id));
  const dependents = (imp?.applications.length ?? 0) + (imp?.processes.length ?? 0);
  const effort: Effort = dependents === 0 && row.users <= 10 ? "Low" : dependents <= 2 && row.users <= 50 ? "Medium" : "High";
  const cur = currentOf(row, 1, "");
  const c = row.contract;
  const renewal = c?.billingCycle === "annual" && c.renewalDate && c.renewalDate > ctx.now ? c.renewalDate.toISOString().slice(0, 10) : null;
  const a = env.ctx.est.assessments.get(row.id);
  const best = a?.repl.best ?? null;
  const notes = [
    renewal ? `Annual contract: the saving starts at renewal on ${renewal}. Until then the commitment is paid.` : "No annual commitment recorded: the saving starts when it is turned off.",
    dependents ? `${dependents} application${dependents === 1 ? "" : "s"} or process${dependents === 1 ? "" : "es"} depend on it: they stop or need another AI.` : "Nothing in the graph depends on it.",
    ...(best ? [`Closest alternative if the work must go on: ${best.name} (fit ${best.compatibility}%, ${best.effort} effort).`] : []),
  ];
  const sys = finish(env, {
    row,
    fraction: 1,
    fractionNote: "whole system",
    change: "Removed",
    current: cur,
    projected: V(0, "calculated", renewal ? `Nothing after renewal on ${renewal}` : "Turned off"),
    compat: { ...NA, label: "Not replaced" },
    effort,
    people: row.users,
  });
  return build(env, { scenario: sc, title: `Remove ${row.name}`, question: `What happens if ${row.name} is turned off?`, systems: [sys], notes, extraCalc: [{ label: "Effort rule", value: effort, kind: "calculated", basis: "Low: nothing depends on it and ≤10 people · Medium: ≤2 applications or processes and ≤50 people · High otherwise" }] });
}

// ───────────────────────── 4. cambio di prezzo ─────────────────────────

/** Quota del costo di listino di un uso dovuta alla voce che cambia (input o output). */
function componentShare(u: ModelUseIn, component: PriceComponent, at: Date): { share: number | null; basis: string } {
  if (component === "all") return { share: 1, basis: "all prices" };
  if (component === "seat") return { share: 0, basis: "token use, seat price not involved" };
  const mid = modelIdOf(u);
  if (!mid) return { share: null, basis: "model not in the catalog" };
  const dep = deploymentOfUse(u);
  const pi = getPrice(mid, dep, u.region, "input", at, { earliestIfBefore: true });
  const po = getPrice(mid, dep, u.region, "output", at, { earliestIfBefore: true });
  if (!pi || !po) return { share: null, basis: `no ${!pi ? "input" : "output"} list price for ${modelName(mid)}` };
  const pin = toEur(pi.price, pi.currency).eur;
  const pout = toEur(po.price, po.currency).eur;
  const tin = u.inputTokens30d ?? 0;
  const tout = u.outputTokens30d ?? 0;
  const [a, b, how] = tin + tout > 0 ? [tin * pin, tout * pout, `${tokens(tin)} input and ${tokens(tout)} output tokens`] : [3 * pin, pout, "3 input : 1 output tokens assumed"];
  const s = a + b > 0 ? (component === "input" ? a : b) / (a + b) : 0;
  return { share: s, basis: `${component} is ${pctText(s)} of list cost (${how})` };
}

export function priceChange(ctx: ImpactContext, sc: Extract<Scenario, { s: "price-change" }>): ImpactResult {
  const env = envOf(ctx);
  const prov = providerNameOf(sc.provider);
  const f = sc.pct / 100;
  const scope = sc.model ? modelName(sc.model) : prov;
  const what = sc.component === "all" ? "prices" : sc.component === "seat" ? "seat prices" : `${sc.component} token prices`;
  const systems: SystemImpact[] = [];
  for (const row of ctx.est.rows) {
    const cur = currentOf(row, 1, "");
    let extra = 0;
    let part = 0;
    let any = false;
    let unknown = false;
    let assumed = false;
    const why: string[] = [];
    for (const u of row.uses) {
      if (publisherOf(u) !== sc.provider) continue;
      if (sc.model && modelIdOf(u) !== sc.model) continue;
      const fr = useFraction(row, [u]);
      const c = useCurrent(row, [u], fr.f, fr.note).base;
      const cs = componentShare(u, sc.component, ctx.now);
      any = true;
      assumed ||= fr.assumed;
      if (c.eur == null || cs.share == null) {
        unknown = true;
        why.push(`${u.rawModel}: ${c.eur == null ? "cost not known" : cs.basis}`);
        continue;
      }
      part += c.eur;
      extra += c.eur * f * cs.share;
      why.push(`${u.rawModel}: ${money(c.eur)} × ${sc.pct > 0 ? "+" : ""}${sc.pct}% × ${pctText(cs.share)} (${cs.basis})`);
    }
    const product = productByIdOf(row.seatProductId);
    if (!sc.model && (sc.component === "all" || sc.component === "seat") && !row.uses.length && product?.providerId === sc.provider) {
      any = true;
      if (cur.base.eur == null) unknown = true;
      else {
        part += cur.base.eur;
        extra += cur.base.eur * f;
        why.push(`${product.name} seats: ${money(cur.base.eur)} × ${sc.pct > 0 ? "+" : ""}${sc.pct}%`);
      }
    }
    // Fornitore registrato sull'AI senza modello né prodotto riconosciuto: tutto il costo, dichiarato come ipotesi.
    if (!any && !sc.model && sc.component !== "input" && sc.component !== "output" && dependencyFraction(ctx.est.graph, nodeKey("system", row.id), nodeKey("provider", sc.provider)) > 0 && !row.uses.length && !product) {
      any = true;
      assumed = true;
      if (cur.base.eur == null) unknown = true;
      else {
        part += cur.base.eur;
        extra += cur.base.eur * f;
        why.push(`Provider recorded on the AI system: ${money(cur.base.eur)} × ${sc.pct > 0 ? "+" : ""}${sc.pct}% (whole cost assumed)`);
      }
    }
    if (!any) continue;
    const base = cur.base.eur;
    const share = base && base > 0 ? Math.min(1, part / base) : null;
    systems.push(
      finish(env, {
        row,
        fraction: share,
        fractionNote: share == null ? "share not known" : `${pctText(share)} of its cost is priced by ${prov}`,
        change: `${sc.pct > 0 ? "+" : ""}${sc.pct}% ${what}`,
        current: cur,
        projected: unknown && part === 0 ? UNKNOWN(why.join(" · ") || "Cost not known") : V((base ?? 0) + extra, worst(cur.base.kind === "observed" ? "calculated" : cur.base.kind, sc.component === "all" || sc.component === "seat" ? "calculated" : "estimated"), why.join(" · ") + (unknown ? " · some uses not priced" : "")),
        compat: { ...NA, label: "No change" },
        effort: null,
        noMigration: true,
        assumedShare: assumed,
      }),
    );
  }
  const r = build(env, {
    scenario: sc,
    title: `${scope} ${what} ${sc.pct > 0 ? "+" : ""}${sc.pct}%`,
    question: `What happens if ${scope} ${sc.pct >= 0 ? "raises" : "cuts"} ${what} by ${Math.abs(sc.pct)}%?`,
    systems,
    notes: [
      `Only what ${prov} prices directly is included. Models served by another cloud (Azure, Bedrock, Vertex) follow that cloud's price list.`,
      "Contracted prices may not change until renewal: see Contracts.",
    ],
    empty: systems.length ? null : `Nothing in the estate is priced by ${scope}.`,
  });
  return r;
}

// ───────────────────────── 5. ritiro di un modello ─────────────────────────

export function deprecation(ctx: ImpactContext, sc: Extract<Scenario, { s: "deprecation" }>): ImpactResult {
  const env = envOf(ctx);
  const m = modelById(sc.model);
  const name = modelName(sc.model);
  const dateStr = sc.date ?? (m?.retiresAt ? m.retiresAt.toISOString().slice(0, 10) : null);
  const days = dateStr ? Math.round((Date.parse(`${dateStr}T00:00:00Z`) - ctx.now.getTime()) / DAY) : null;
  const replacement = m?.replacementId ? modelById(m.replacementId) : null;
  const systems: SystemImpact[] = [];
  for (const row of ctx.est.rows) {
    const uses = row.uses.filter((u) => modelIdOf(u) === sc.model);
    if (!uses.length) continue;
    const fr = useFraction(row, uses);
    const cur = useCurrent(row, uses, fr.f, fr.note);
    // Candidato: il sostituto indicato dal fornitore nel catalogo, altrimenti il più compatibile (mai il più economico).
    let target: string | null = replacement?.id ?? null;
    let via = "catalog replacement";
    let mc = target ? modelCompat(row, uses, target, env) : null;
    if (!target || mc?.compat.status === "blocked") {
      const best = replFor(row, uses, env).best;
      if (best) {
        target = best.id;
        via = "best fit";
        mc = { compat: compatFromAlt(best), alt: best };
      }
    }
    const sw = target ? swapProjected(uses, cur.base, (u) => ({ model: target!, deployment: chooseDeployment(target!, deploymentOfUse(u)) }), ctx.now) : null;
    systems.push(
      finish(env, {
        row,
        fraction: fr.f,
        fractionNote: fr.note,
        change: target ? `${name} → ${modelName(target)} (${via})` : `${name} → no candidate`,
        current: sw && sw.current !== cur.base ? { ...cur, base: sw.current } : cur,
        projected: sw ? sw.projected : UNKNOWN("No active alternative in the catalog"),
        compat: mc?.compat ?? compatOf("blocked", "No active alternative in the catalog", null),
        effort: mc?.alt?.effort ?? (target ? null : "High"),
        compatConf: mc?.alt?.confidence ?? null,
        method: sw?.method ?? "none",
        assumedShare: fr.assumed,
        retiresInDays: days,
        status: dateStr ? (days != null && days < 0 ? `Retired ${dateStr}` : `Retires ${dateStr}${days != null ? ` · ${days} days` : ""}`) : "No retirement date",
      }),
    );
  }
  return build(env, {
    scenario: sc,
    title: `${name} retires${dateStr ? ` on ${dateStr}` : ""}`,
    question: `What happens when ${name} is no longer available${dateStr ? ` on ${dateStr}` : ""}?`,
    systems,
    notes: [
      dateStr ? (sc.date ? `Date set in the scenario.` : `Retirement date from the angar catalog (${m?.lifecycle ?? "unknown"}).`) : `No retirement date in the catalog for ${name}: set one in the scenario.`,
      replacement ? `${m!.name} → ${replacement.name} is the replacement named in the catalog.` : "No replacement named in the catalog: the most compatible active model is shown.",
    ],
    empty: systems.length ? null : `No AI system uses ${name}.`,
  });
}

/** Ritiro di un modello a una data (per il motore dei cambi di mercato). */
export function deprecationOn(ctx: ImpactContext, modelId: string, date?: Date | string | null): ImpactResult {
  const d = date instanceof Date ? date.toISOString().slice(0, 10) : date ?? undefined;
  return deprecation(ctx, { s: "deprecation", model: modelId, ...(d ? { date: d } : {}) });
}

// ───────────────────────── 6. guasto di un fornitore ─────────────────────────

export function outage(ctx: ImpactContext, sc: Extract<Scenario, { s: "outage" }>): ImpactResult {
  const env = envOf(ctx);
  const g = ctx.est.graph;
  const key = g.nodes.has(nodeKey("deployment", sc.provider)) ? nodeKey("deployment", sc.provider) : nodeKey("provider", sc.provider);
  const label = g.nodes.get(key)?.label ?? deploymentOf(sc.provider)?.name ?? providerNameOf(sc.provider);
  const imp = env.impact(key);
  const systems: SystemImpact[] = [];
  for (const s of imp?.systems ?? []) {
    const row = env.rows.get(s.node.id);
    if (!row) continue;
    const cur = currentOf(row, s.fraction, `share that depends on ${label}`);
    const fb = ctx.est.assessments.get(row.id)?.fallback ?? { configured: null, available: null };
    systems.push(
      finish(env, {
        row,
        fraction: s.fraction,
        fractionNote: s.fraction < 1 ? `${pctText(s.fraction)} of its work depends on ${label}` : `all of its work depends on ${label}`,
        change: "Exposed",
        current: cur,
        projected: cur.base,
        compat: { ...NA, label: fb.configured ? `Fallback: ${fb.configured}` : "No fallback" },
        effort: null,
        noMigration: true,
        noFallback: !fb.configured,
        status: fb.configured ? `Fallback: ${fb.configured}` : fb.available ? `No fallback · ${fb.available} possible` : "No fallback",
      }),
    );
  }
  const noFb = systems.filter((s) => s.status?.startsWith("No fallback")).length;
  return build(env, {
    scenario: sc,
    title: `${label} outage`,
    question: `What stops if ${label} is down?`,
    systems,
    exposedOnly: true,
    notes: [`${noFb} of ${systems.length} AI system${systems.length === 1 ? "" : "s"} have no fallback configured.`, "Exposed spend is the monthly spend of the work that depends on it."],
    empty: systems.length ? null : `Nothing in the estate depends on ${label}.`,
  });
}

// ───────────────────────── 7. solo UE ─────────────────────────

type EuAction = "ok" | "settings" | "deployment" | "model" | "unknown";
const EU_RANK: Record<EuAction, number> = { ok: 0, settings: 1, deployment: 2, model: 3, unknown: 4 };
const EU_LABEL: Record<EuAction, string> = { ok: "EU", settings: "Fix in settings", deployment: "Move deployment", model: "Change model", unknown: "Not known" };

export function euOnly(ctx: ImpactContext, sc: Extract<Scenario, { s: "eu-only" }>): ImpactResult {
  const env = envOf(ctx);
  const systems: SystemImpact[] = [];
  let compliant = 0;
  for (const row of ctx.est.rows) {
    const cur = currentOf(row, 1, "");
    if (row.uses.length) {
      let worstA: EuAction = "ok";
      const targets = new Map<ModelUseIn, SwapTarget>();
      const compats: Compat[] = [];
      const efforts: (Effort | null)[] = [];
      const reasons: string[] = [];
      let alts: SystemImpact["alternatives"] = [];
      let altConf: Conf | null = null;
      for (const u of row.uses) {
        const mid = modelIdOf(u);
        const dep = deploymentOfUse(u);
        const depRegions = deploymentOf(dep ?? "")?.regions ?? [];
        let a: EuAction;
        if (u.region === "eu") a = "ok";
        else if (!mid) {
          a = "unknown";
          reasons.push(`${u.rawModel}: not in the catalog`);
        } else if (depRegions.includes("eu")) {
          a = "settings";
          targets.set(u, { model: mid, deployment: dep, region: "eu" });
          compats.push({ ...NA, status: "fits", label: `EU region on ${deploymentOf(dep!)?.name}`, target: deploymentOf(dep!)?.name ?? dep, checks: [{ label: "Region", score: 100, reason: `${deploymentOf(dep!)?.name} offers an EU region` }] });
          efforts.push("Low");
          reasons.push(`${modelName(mid)}: ${u.region == null ? "region not observed · " : ""}EU region available on ${deploymentOf(dep!)?.name}`);
        } else if (euDeployment(mid)) {
          a = "deployment";
          const to = deploymentsOfModel(mid).find((d) => deploymentOf(d)?.regions.includes("eu"))!;
          const dc = deploymentCompat(row, u, to);
          targets.set(u, { model: mid, deployment: to, region: "eu" });
          compats.push(dc.compat);
          efforts.push(dc.effort);
          reasons.push(`${modelName(mid)}: same model in the EU on ${deploymentOf(to)?.name}`);
        } else {
          a = "model";
          const r = replFor(row, [u], env, true);
          const eu = r.all.filter((x) => euDeployment(x.id)).slice(0, 3);
          const best = eu[0] ?? null;
          if (best) {
            const to = deploymentsOfModel(best.id).find((d) => deploymentOf(d)?.regions.includes("eu")) ?? null;
            targets.set(u, { model: best.id, deployment: to, region: "eu" });
            compats.push(compatFromAlt(best));
            efforts.push(best.effort);
            altConf = altConf ? minConf(altConf, best.confidence) : best.confidence;
            reasons.push(`${modelName(mid)}: no EU deployment in the catalog · best EU fit ${best.name}`);
          } else {
            compats.push(compatOf("blocked", "No EU alternative in the catalog", null));
            efforts.push("High");
            reasons.push(`${modelName(mid)}: no EU deployment and no EU alternative in the catalog`);
          }
          alts = [
            ...(alts ?? []),
            ...eu.map((x) => {
              const sw = swapProjected([u], useCurrent(row, [u], useFraction(row, [u]).f, "").base, () => ({ model: x.id, deployment: deploymentsOfModel(x.id).find((d) => deploymentOf(d)?.regions.includes("eu")) ?? null, region: "eu" }), ctx.now);
              return { name: x.name, provider: x.providerName, compatibility: x.compatibility, effort: x.effort, monthly: sw.projected, gaps: x.gaps };
            }),
          ];
        }
        if (EU_RANK[a] > EU_RANK[worstA]) worstA = a;
      }
      if (worstA === "ok") {
        compliant++;
        continue;
      }
      const uses = [...targets.keys()];
      const same = row.uses.filter((u) => !targets.has(u));
      const fr = useFraction(row, uses);
      const sw = uses.length ? swapProjected(uses, useCurrent(row, uses, fr.f, fr.note).base, (u) => targets.get(u) ?? null, ctx.now) : null;
      const untouched = same.length ? useCurrent(row, same, useFraction(row, same).f, "").base : V(0, "calculated", "");
      const projected = worstA === "unknown" || !sw ? UNKNOWN(reasons.join(" · ")) : sw.projected.eur != null && untouched.eur != null ? V(sw.projected.eur + untouched.eur, worst(sw.projected.kind, untouched.kind), `${sw.projected.basis}${same.length ? ` + ${money(untouched.eur)} already EU or unchanged` : ""}`) : UNKNOWN(sw.projected.basis);
      systems.push(
        finish(env, {
          row,
          fraction: 1,
          fractionNote: reasons.join(" · "),
          change: EU_LABEL[worstA],
          current: cur,
          projected,
          compat: worstCompat(compats.length ? compats : [compatOf("unknown", "Not known", null)]),
          effort: worstA === "unknown" ? null : maxEffort(efforts),
          compatConf: altConf,
          method: sw?.method ?? "none",
          status: EU_LABEL[worstA],
          alternatives: alts && alts.length ? alts : undefined,
        }),
      );
      continue;
    }
    // Prodotti a posti: residenza UE dichiarata dal fornitore nel catalogo; mai presunta.
    const product = productByIdOf(row.seatProductId);
    const prov = product ? catalog().providers.find((p) => p.id === product.providerId) : null;
    if (!product || !prov) {
      systems.push(finish(env, { row, fraction: 1, fractionNote: "No model or product seen", change: EU_LABEL.unknown, current: cur, projected: UNKNOWN("Residency not known"), compat: compatOf("unknown", "No model or product seen", null), effort: null, status: EU_LABEL.unknown }));
      continue;
    }
    const r = replFor(row, [], env);
    const euAlts = r.all.filter((a) => catalog().providers.find((p) => p.id === a.providerId)?.euDataResidency === true).slice(0, 3);
    const alternatives = euAlts.map((a) => ({ name: a.name, provider: a.providerName, compatibility: a.compatibility, effort: a.effort, monthly: a.estimatedMonthlyEur != null ? V(a.estimatedMonthlyEur, "estimated", a.estimateBasis) : UNKNOWN(a.estimateBasis), gaps: a.gaps }));
    if (prov.euDataResidency === true) {
      systems.push(
        finish(env, {
          row,
          fraction: 1,
          fractionNote: `${prov.name} offers EU data residency (catalog) · check it is on for your plan`,
          change: EU_LABEL.settings,
          current: cur,
          projected: cur.base,
          compat: { ...NA, status: "unknown", label: "Check the plan includes EU residency" },
          effort: "Low",
          status: EU_LABEL.settings,
          alternatives: alternatives.length ? alternatives : undefined,
        }),
      );
    } else {
      const best = euAlts[0] ?? null;
      systems.push(
        finish(env, {
          row,
          fraction: 1,
          fractionNote: `${prov.name}: EU data residency not recorded in the catalog`,
          change: best ? `${product.name} → ${best.name}` : EU_LABEL.unknown,
          current: cur,
          projected: best?.estimatedMonthlyEur != null ? V(best.estimatedMonthlyEur, "estimated", best.estimateBasis) : UNKNOWN("No EU alternative priced"),
          compat: best ? compatFromAlt(best) : compatOf("unknown", "EU residency not known", null),
          effort: best?.effort ?? null,
          compatConf: best?.confidence ?? null,
          people: best ? row.paidSeats ?? row.users : 0,
          status: EU_LABEL.unknown,
          alternatives: alternatives.length ? alternatives : undefined,
        }),
      );
    }
  }
  return build(env, {
    scenario: sc,
    title: "EU-only",
    question: "What happens if every AI system must keep data in the EU?",
    systems,
    notes: [
      `${compliant} AI system${compliant === 1 ? "" : "s"} already run in an EU region.`,
      "EU region and residency come from the angar catalog. A region that was not observed is treated as not EU until confirmed.",
    ],
    empty: systems.length ? null : "Every AI system already runs in an EU region.",
  });
}

// ───────────────────────── 8. obiettivo di budget ─────────────────────────

const LEVER_EFFORT: Record<Saving["kind"], Effort> = { seats: "Low", annual: "Low", premium: "Low", idle: "Low", duplicate: "Medium", model: "Medium", alternative: "Medium" };

export function budget(ctx: ImpactContext, sc: Extract<Scenario, { s: "budget" }>): ImpactResult {
  const env = envOf(ctx);
  const monthlyOfRow = (id: string) => env.rows.get(id) ? currentOf(env.rows.get(id)!, 1, "").base.eur : null;
  const actions: BudgetAction[] = [];
  const score = (annual: number, conf: Conf, effort: Effort) => r2((annual * BUDGET_RANK.conf[conf]) / BUDGET_RANK.effort[effort]);

  // a) Motore dei risparmi: posti inutilizzati, fatturazione annuale, doppioni, piani premium…
  for (const s of ctx.savings ?? []) {
    if (s.monthlyEur < 1) continue;
    const effort = LEVER_EFFORT[s.kind];
    actions.push({
      key: `saving:${s.key}`,
      title: s.title,
      detail: s.detail,
      lever: s.kind,
      systems: s.assets.map((a) => ({ id: a.id, label: a.name, href: `/assets/${a.id}` })),
      monthly: V(s.monthlyEur, s.confidence === "HIGH" ? "calculated" : "estimated", s.detail),
      annual: V(s.monthlyEur * 12, s.confidence === "HIGH" ? "calculated" : "estimated", `${money(s.monthlyEur)} a month × 12`),
      effort,
      confidence: s.confidence,
      compatibility: null,
      score: score(s.monthlyEur * 12, s.confidence, effort),
      picked: false,
      cumulativeAnnual: null,
    });
  }
  // b) Replaceability: cambio di modello solo se l'alternativa copre ogni requisito e la compatibilità è sufficiente.
  for (const row of ctx.est.rows) {
    const best = ctx.est.assessments.get(row.id)?.repl.best;
    if (!best || best.type !== "model" || best.savingEur == null || best.savingEur < 1) continue;
    if (best.gaps.length || best.compatibility < BUDGET_RANK.minCompatibility) continue;
    if (actions.some((a) => (a.lever === "model" || a.lever === "alternative") && a.systems.some((x) => x.id === row.id))) continue;
    actions.push({
      key: `switch:${row.id}:${best.id}`,
      title: `Switch ${row.name} to ${best.name}`,
      detail: `Fit ${best.compatibility}% · ${best.tested ? "tested" : "not tested"} · ${best.estimateBasis}`,
      lever: "switch",
      systems: [{ id: row.id, label: row.name, href: `/assets/${row.id}` }],
      monthly: V(best.savingEur, "estimated", `Current ${money(best.savingEur + (best.estimatedMonthlyEur ?? 0))} − ${best.name} ${money(best.estimatedMonthlyEur)} (${best.estimateBasis})`),
      annual: V(best.savingEur * 12, "estimated", `${money(best.savingEur)} a month × 12`),
      effort: best.effort,
      confidence: best.confidence,
      compatibility: best.compatibility,
      score: score(best.savingEur * 12, best.confidence, best.effort),
      picked: false,
      cumulativeAnnual: null,
    });
  }
  actions.sort((a, b) => b.score - a.score || (b.annual.eur ?? 0) - (a.annual.eur ?? 0) || a.key.localeCompare(b.key));

  // Scelta: in ordine, finché l'obiettivo è raggiunto. Più azioni sulla stessa AI non superano il suo costo.
  const used = new Map<string, number>();
  const gone = new Set<string>();
  let total = 0;
  for (const a of actions) {
    if (total >= sc.target) break;
    const ids = a.systems.map((x) => x.id);
    if (ids.some((id) => gone.has(id))) continue;
    let monthly = a.monthly.eur ?? 0;
    if (a.lever !== "duplicate" && ids.length === 1) {
      const cap = monthlyOfRow(ids[0]);
      if (cap != null) monthly = Math.max(0, Math.min(monthly, cap - (used.get(ids[0]) ?? 0)));
      if (monthly < 1) continue;
      used.set(ids[0], (used.get(ids[0]) ?? 0) + monthly);
      if (a.lever === "idle") gone.add(ids[0]);
    } else ids.slice(1).forEach((id) => gone.add(id));
    if (monthly !== a.monthly.eur) {
      a.monthly = V(monthly, a.monthly.kind, `${a.monthly.basis} · capped at what is left of the AI system's cost`);
      a.annual = V(monthly * 12, a.annual.kind, `${money(monthly)} a month × 12`);
    }
    a.picked = true;
    total += monthly * 12;
    a.cumulativeAnnual = r2(total);
  }
  const picked = actions.filter((a) => a.picked);

  // Sistemi toccati dalle azioni scelte.
  const bySystem = new Map<string, { monthly: number; actions: BudgetAction[] }>();
  for (const a of picked) {
    const ids = a.lever === "duplicate" ? a.systems.slice(1).map((x) => x.id) : a.systems.map((x) => x.id);
    for (const id of ids) {
      const cur = bySystem.get(id) ?? { monthly: 0, actions: [] };
      const m = a.lever === "duplicate" ? monthlyOfRow(id) ?? 0 : a.monthly.eur ?? 0;
      bySystem.set(id, { monthly: cur.monthly + m, actions: [...cur.actions, a] });
    }
  }
  const systems: SystemImpact[] = [];
  for (const [id, v] of bySystem) {
    const row = env.rows.get(id);
    if (!row) continue;
    const cur = currentOf(row, 1, "");
    const effort = maxEffort(v.actions.map((a) => a.effort));
    const compatVals = v.actions.map((a) => a.compatibility).filter((x): x is number => x != null);
    const sw = v.actions.find((a) => a.lever === "switch");
    const alt = sw ? ctx.est.assessments.get(id)?.repl.best ?? null : null;
    systems.push(
      finish(env, {
        row,
        fraction: 1,
        fractionNote: "whole system",
        change: v.actions.map((a) => a.title).join(" · "),
        current: cur,
        projected: cur.base.eur != null ? V(Math.max(0, cur.base.eur - v.monthly), worst("calculated", ...v.actions.map((a) => a.monthly.kind)), `${money(cur.base.eur)} − ${money(v.monthly)} (${v.actions.length} action${v.actions.length === 1 ? "" : "s"})`) : UNKNOWN("Current cost not known"),
        compat: alt ? compatFromAlt(alt) : { ...NA, label: compatVals.length ? `Fit ${Math.min(...compatVals)}%` : "No model change" },
        effort,
        compatConf: minConf(...v.actions.map((a) => a.confidence)),
        people: 0,
      }),
    );
  }
  const reached = total >= sc.target;
  return build(env, {
    scenario: sc,
    title: `Save ${money(sc.target)} a year`,
    question: `How can AI spend go down by ${money(sc.target)} a year?`,
    systems,
    budget: { target: sc.target, reached, total: V(total, picked.some((a) => a.annual.kind === "estimated") ? "estimated" : "calculated", `Sum of ${picked.length} picked action${picked.length === 1 ? "" : "s"}`), actions },
    notes: [
      reached ? `Target reached with ${picked.length} action${picked.length === 1 ? "" : "s"}.` : `Target not reached: the actions found add up to ${money(total)} a year, ${money(sc.target - total)} short.`,
      `Model switches are listed only when the alternative covers every requirement and fits at least ${BUDGET_RANK.minCompatibility}%. They are never chosen for price alone.`,
    ],
    extraCalc: [{ label: "Ranking rule", value: "Score", kind: "calculated", basis: `Annual saving × confidence (High ${BUDGET_RANK.conf.HIGH}, Medium ${BUDGET_RANK.conf.MEDIUM}, Low ${BUDGET_RANK.conf.LOW}) ÷ effort (Low ${BUDGET_RANK.effort.Low}, Medium ${BUDGET_RANK.effort.Medium}, High ${BUDGET_RANK.effort.High}); picked in order until the target is reached` }],
    empty: actions.length ? null : "No saving action found in the estate.",
  });
}

// ───────────────────────── 9. consolidare due strumenti ─────────────────────────

export function consolidate(ctx: ImpactContext, sc: Extract<Scenario, { s: "consolidate" }>): ImpactResult {
  const env = envOf(ctx);
  const a = env.rows.get(sc.from);
  const b = env.rows.get(sc.to);
  if (!a || !b) return build(env, { scenario: sc, title: "Consolidate", question: "", systems: [], empty: "Pick two AI systems from the estate." });
  const curA = currentOf(a, 1, "");
  const curB = currentOf(b, 1, "");
  const people = a.users > 0 ? a.users : a.paidSeats ?? null;
  let added: Val;
  let compat: Compat;
  let effort: Effort | null;
  let compatConf: Conf | null = null;
  let method: "tokens" | "ratio" | "none" | undefined;
  if (a.uses.length && b.uses.length) {
    // Due sistemi API: il lavoro di A sul modello principale di B.
    const primary = [...b.uses].sort((x, y) => (y.share ?? 0) - (x.share ?? 0))[0];
    const target = modelIdOf(primary);
    const mc = target ? modelCompat(a, a.uses, target, env) : { compat: compatOf("unknown", `${b.name}: model not in the catalog`, null), alt: null };
    const sw = target ? swapProjected(a.uses, curA.base, () => ({ model: target, deployment: primary.deploymentId ?? directDeployment(modelById(target)?.providerId) }), ctx.now) : null;
    added = sw ? sw.projected : UNKNOWN("Target model not known");
    compat = mc.compat;
    effort = mc.alt?.effort ?? (mc.compat.status === "n/a" ? "Low" : null);
    compatConf = mc.alt?.confidence ?? null;
    method = sw?.method;
  } else {
    // Strumenti a posti: stessa categoria? Feature parity mai presunta.
    const pa = productByIdOf(a.seatProductId);
    const pb = productByIdOf(b.seatProductId);
    const ca = pa?.serviceId ? SERVICE_CATEGORY[pa.serviceId] : undefined;
    const cb = pb?.serviceId ? SERVICE_CATEGORY[pb.serviceId] : undefined;
    const alt = pb ? ctx.est.assessments.get(a.id)?.repl.all.find((x) => x.id === pb.id) ?? null : null;
    if (alt) {
      compat = compatFromAlt(alt);
      effort = alt.effort;
      compatConf = alt.confidence;
    } else if (ca && cb && ca !== cb) {
      compat = compatOf("blocked", `Different kind of tool (${ca} vs ${cb})`, b.name);
      effort = "High";
    } else {
      compat = compatOf("unknown", ca && cb ? "Same kind of tool · feature parity not verified" : "Kind of tool not known", b.name);
      effort = people == null ? null : people <= 10 ? "Low" : people <= 50 ? "Medium" : "High";
    }
    // Posti in più su B: costo per posto reale di B (fatturato ÷ posti) se noto, altrimenti listino.
    if (people == null) added = UNKNOWN(`People using ${a.name} not known`);
    else if (b.cost.actualEur != null && b.paidSeats) {
      const unit = b.cost.actualEur / b.paidSeats;
      added = V(unit * people, "calculated", `${people} seats × ${money(unit)} (${b.name} billed ${money(b.cost.actualEur)} ÷ ${b.paidSeats} seats)`);
    } else if (pb) {
      const st = catalog().seatTypes.find((s) => catalog().plans.find((p) => p.id === s.planId)?.productId === pb.id && s.isDefault);
      const e = st ? estimateSeatCost([{ seatType: st.id, seats: people, cycle: b.contract?.billingCycle === "annual" ? "annual" : "monthly" }], ctx.now) : null;
      added = e && e.known ? V(e.eur, "estimated", e.basis) : UNKNOWN(`No list price for ${pb.name}`);
    } else added = UNKNOWN(`${b.name}: price for one seat not known`);
  }
  const notes = [
    "People who already have both are not subtracted (overlap not known): the projected cost is an upper bound.",
    ...(b.paidSeats && b.users > 0 && b.paidSeats > b.users ? [`${b.name} has ${b.paidSeats - b.users} paid seats nobody uses: they could absorb part of the move.`] : []),
    ...(a.contract?.billingCycle === "annual" && a.contract.renewalDate && a.contract.renewalDate > ctx.now ? [`${a.name} has an annual contract: the saving starts at renewal on ${a.contract.renewalDate.toISOString().slice(0, 10)}.`] : []),
  ];
  const sysA = finish(env, { row: a, fraction: 1, fractionNote: "whole system", change: `Merged into ${b.name}`, current: curA, projected: V(0, "calculated", `Cancelled after the move to ${b.name}`), compat, effort, compatConf, people: people ?? 0, method });
  const sysB = finish(env, {
    row: b,
    fraction: 1,
    fractionNote: "whole system",
    change: `Takes over ${a.name}`,
    current: curB,
    projected: curB.base.eur != null && added.eur != null ? V(curB.base.eur + added.eur, worst(curB.base.kind === "observed" ? "calculated" : curB.base.kind, added.kind), `${money(curB.base.eur)} + ${money(added.eur)}: ${added.basis}`) : UNKNOWN(added.eur == null ? added.basis : "Current cost not known"),
    compat: { ...NA, label: "Stays" },
    effort: null,
    noMigration: true,
  });
  return build(env, { scenario: sc, title: `Merge ${a.name} into ${b.name}`, question: `What happens if everyone on ${a.name} moves to ${b.name}?`, systems: [sysA, sysB], notes });
}

// ───────────────────────── ingresso ─────────────────────────

/** Esegue uno scenario. Deterministico: stessi ingressi (estate, scenario, now) → stesso risultato. */
export function runScenario(ctx: ImpactContext, sc: Scenario): ImpactResult {
  switch (sc.s) {
    case "replace-model":
      return replaceModel(ctx, sc);
    case "replace-provider":
      return replaceProvider(ctx, sc);
    case "remove-system":
      return removeSystem(ctx, sc);
    case "price-change":
      return priceChange(ctx, sc);
    case "deprecation":
      return deprecation(ctx, sc);
    case "outage":
      return outage(ctx, sc);
    case "eu-only":
      return euOnly(ctx, sc);
    case "budget":
      return budget(ctx, sc);
    case "consolidate":
      return consolidate(ctx, sc);
  }
}

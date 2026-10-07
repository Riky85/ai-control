/**
 * AI Market Change engine — impatto sull'AI estate di un'azienda (puro, nessun database).
 *
 * Per ogni cambiamento: AI system coinvolti (uso dei modelli osservato o dichiarato),
 * applicazioni e team (insiemi d'impatto del grafo, impactOf), spesa esposta reale e stimata
 * separate, variazione annua stimata (prezzo nuovo − vecchio × uso osservato), alternative
 * del catalogo (Replaceability) e giorni alla data di effetto.
 *
 * Indipendente dall'Impact Simulator (src/lib/impact/): stesso grafo, stesso servizio prezzi;
 * i due potranno convergere.
 */
import { impactOf, nodeKey, type EstateGraph } from "@/lib/estate/graph-core";
import type { SystemRow, Assessment } from "@/lib/estate/assess";
import { DIRECT_DEPLOYMENT } from "@/lib/pricing/catalog-data";
import { modelById } from "@/lib/pricing/service";
import { toEur } from "@/lib/spend/fx";
import type { ChangeType, PriceItem } from "./detect";

const DAY = 86_400_000;

/** Soglie di materialità (documentate): sotto, il cambiamento non entra nel feed dell'azienda. */
export const MATERIALITY = {
  /** Spesa mensile esposta minima (EUR) per prezzi, nuovi modelli, capacità, deployment. */
  minMonthlyEur: 10,
  /** Variazioni di prezzo già in vigore da più di N giorni: storia, non più una novità. */
  priceHistoryDays: 90,
  /** Nuovi modelli usciti da più di N giorni: non più una novità. */
  newModelDays: 60,
} as const;

export interface ChangeLike {
  id: string;
  key: string | null;
  changeType: string;
  providerId: string | null;
  modelId: string | null;
  productId: string | null;
  planId: string | null;
  ruleId: string | null;
  deploymentId: string | null;
  newState: unknown;
  effectiveAt: Date | null;
}

export interface EstateLike {
  graph: EstateGraph;
  rows: SystemRow[];
  assessments: Map<string, Assessment>;
}

export interface SystemImpact {
  id: string;
  name: string;
  /** Quota (0..1) del lavoro del sistema toccata dal cambiamento. */
  fraction: number;
  monthlyEur: number | null;
  costKind: "actual" | "estimated" | null;
  annualDeltaEur: number | null;
  deltaBasis: "tokens" | "spend" | null;
}

export interface ImpactResult {
  systems: SystemImpact[];
  applications: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  exposedActualEur: number;
  exposedEstimatedEur: number;
  annualDeltaEur: number | null;
  deltaBasis: string | null;
  alternatives: { id: string; name: string }[];
  daysUntil: number | null;
  material: boolean;
  reason: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
export const daysUntil = (d: Date | null, now: Date) => (d ? Math.ceil((d.getTime() - now.getTime()) / DAY) : null);

/** Voci di prezzo del cambiamento (newState.items), per la regione dell'uso o globali. */
function itemsFor(ch: ChangeLike, region: string | null): PriceItem[] {
  const all = ((ch.newState as { items?: PriceItem[] } | null)?.items ?? []).filter((i) => i.serviceTier === "standard" && i.contextAbove === 0);
  const reg = all.filter((i) => i.region === (region || "global"));
  return reg.length ? reg : all.filter((i) => i.region === "global");
}

const blended = (ch: ChangeLike): number | null => (ch.newState as { blendedPct?: number | null } | null)?.blendedPct ?? null;

type Use = SystemRow["uses"][number];

/** Usi di modello toccati dal cambiamento, per AI system. */
function matchingUses(ch: ChangeLike, row: SystemRow): Use[] {
  const t = ch.changeType as ChangeType;
  const direct = ch.providerId ? DIRECT_DEPLOYMENT[ch.providerId] ?? null : null;
  const depOf = (u: Use) => u.deploymentId ?? (u.modelId ? DIRECT_DEPLOYMENT[modelById(u.modelId)?.providerId ?? ""] ?? null : null);
  if (t === "new_model") {
    // Un modello nuovo riguarda chi usa il modello che sostituisce (o uno più vecchio della stessa famiglia e livello).
    const nm = ch.modelId ? modelById(ch.modelId) : null;
    if (!nm) return [];
    return row.uses.filter((u) => {
      if (!u.modelId || u.modelId === nm.id) return false;
      const m = modelById(u.modelId);
      if (!m) return false;
      if (m.replacementId === nm.id) return true;
      return m.providerId === nm.providerId && m.family === nm.family && m.tier === nm.tier && !!m.releasedAt && !!nm.releasedAt && m.releasedAt < nm.releasedAt;
    });
  }
  if (!ch.modelId) return [];
  const same = row.uses.filter((u) => u.modelId === ch.modelId);
  if (t === "price_change") return ch.deploymentId ? same.filter((u) => depOf(u) === ch.deploymentId) : same;
  // Deprecazione e ritiro valgono per l'API del fornitore (es. Claude Opus 4.1 ritirato sull'API Claude, non su Bedrock).
  if (t === "deprecation" || t === "retirement") return same.filter((u) => !u.deploymentId || u.deploymentId === direct);
  return same;
}

/** Variazione mensile (EUR) di un uso: token osservati × (nuovo − vecchio), oppure spesa × variazione %. */
function useDelta(ch: ChangeLike, u: Use, exposureEur: number | null): { eur: number; basis: "tokens" | "spend" } | null {
  const items = itemsFor(ch, u.region);
  const inp = items.find((i) => i.kind === "input");
  const out = items.find((i) => i.kind === "output");
  if ((u.inputTokens30d != null || u.outputTokens30d != null) && (inp || out)) {
    const native = ((u.inputTokens30d ?? 0) * ((inp?.new ?? 0) - (inp?.old ?? 0)) + (u.outputTokens30d ?? 0) * ((out?.new ?? 0) - (out?.old ?? 0))) / 1_000_000;
    return { eur: toEur(native, (inp ?? out)!.currency).eur, basis: "tokens" };
  }
  const pct = blended(ch);
  if (exposureEur != null && pct != null) return { eur: (exposureEur * pct) / 100, basis: "spend" };
  return null;
}

export function computeImpact(estate: EstateLike, ch: ChangeLike, now = new Date()): ImpactResult {
  const t = ch.changeType as ChangeType;
  const systems: SystemImpact[] = [];
  for (const row of estate.rows) {
    let uses: Use[] = [];
    let seat = false;
    if (t === "price_change" && !ch.modelId && ch.productId) {
      // Posti: chi è abbonato al prodotto del piano.
      seat = row.seatProductId === ch.productId;
    } else uses = matchingUses(ch, row);
    if (!uses.length && !seat) continue;
    const fraction = seat ? 1 : Math.min(1, uses.reduce((s, u) => s + (u.share ?? 1), 0));
    const base = row.cost.actualEur ?? row.cost.estimatedEur ?? null;
    const costKind = row.cost.actualEur != null ? "actual" : row.cost.estimatedEur != null ? "estimated" : null;
    const monthly = base != null ? r2(base * fraction) : null;
    let delta: number | null = null;
    let basis: SystemImpact["deltaBasis"] = null;
    if (t === "price_change") {
      if (seat) {
        const pct = blended(ch);
        if (monthly != null && pct != null) (delta = (monthly * pct) / 100), (basis = "spend");
      } else {
        let sum = 0;
        let any = false;
        for (const u of uses) {
          const exp = base != null ? base * (u.share ?? (uses.length === 1 ? 1 : 1 / uses.length)) : null;
          const d = useDelta(ch, u, exp);
          if (!d) continue;
          sum += d.eur;
          any = true;
          basis = basis === "tokens" || d.basis === "tokens" ? "tokens" : "spend";
        }
        if (any) delta = sum;
      }
    }
    systems.push({ id: row.id, name: row.name, fraction, monthlyEur: monthly, costKind, annualDeltaEur: delta != null ? r2(delta * 12) : null, deltaBasis: basis });
  }

  // Applicazioni e team: insieme d'impatto del grafo di ogni AI system coinvolto.
  const apps = new Map<string, string>();
  const teams = new Map<string, string>();
  for (const s of systems) {
    const set = impactOf(estate.graph, nodeKey("system", s.id));
    if (!set) continue;
    for (const a of set.applications) apps.set(a.id, a.label);
    for (const tm of set.teams) teams.set(tm.id, tm.label);
  }

  // Alternative del catalogo: quelle della Replaceability dei sistemi coinvolti (più il sostituto indicato dal fornitore).
  const alts = new Map<string, string>();
  if (t !== "new_model") {
    for (const s of systems) for (const a of estate.assessments.get(s.id)?.repl.alternatives ?? []) if (a.id !== ch.modelId) alts.set(a.id, a.name);
    const repl = (ch.newState as { replacementId?: string | null } | null)?.replacementId;
    const rm = repl ? modelById(repl) : null;
    if (rm && rm.lifecycle === "active") alts.set(rm.id, rm.name);
  }

  let exposedActualEur = 0;
  let exposedEstimatedEur = 0;
  for (const s of systems) {
    if (s.monthlyEur == null) continue;
    if (s.costKind === "actual") exposedActualEur += s.monthlyEur;
    else exposedEstimatedEur += s.monthlyEur;
  }
  const withDelta = systems.filter((s) => s.annualDeltaEur != null);
  const annualDeltaEur = withDelta.length ? r2(withDelta.reduce((x, s) => x + s.annualDeltaEur!, 0)) : null;
  const bases = new Set(withDelta.map((s) => s.deltaBasis));
  const deltaBasis = !withDelta.length ? null : bases.size > 1 ? "mixed" : [...bases][0];
  const days = daysUntil(ch.effectiveAt, now);
  const { material, reason } = materiality(t, systems.length, exposedActualEur + exposedEstimatedEur, annualDeltaEur, days);
  return {
    systems: systems.sort((a, b) => (b.monthlyEur ?? 0) - (a.monthlyEur ?? 0) || a.name.localeCompare(b.name)),
    applications: [...apps].map(([id, name]) => ({ id, name })),
    teams: [...teams].map(([id, name]) => ({ id, name })),
    exposedActualEur: r2(exposedActualEur),
    exposedEstimatedEur: r2(exposedEstimatedEur),
    annualDeltaEur,
    deltaBasis,
    alternatives: [...alts].map(([id, name]) => ({ id, name })),
    daysUntil: days,
    material,
    reason,
  };
}

/**
 * Regola di materialità: almeno 1 AI system coinvolto E (deprecazione / ritiro, oppure
 * almeno MATERIALITY.minMonthlyEur di spesa mensile esposta o di variazione mensile).
 * Prezzi in vigore da oltre 90 giorni e modelli usciti da oltre 60 giorni sono storia.
 */
export function materiality(t: ChangeType, systems: number, exposedMonthlyEur: number, annualDeltaEur: number | null, days: number | null): { material: boolean; reason: string } {
  if (systems < 1) return { material: false, reason: "No AI system affected" };
  if (t === "deprecation" || t === "retirement") return { material: true, reason: "Lifecycle change on a model in use" };
  if (t === "price_change" && days != null && days < -MATERIALITY.priceHistoryDays) return { material: false, reason: "Price change in effect for over 90 days" };
  if (t === "new_model" && days != null && days < -MATERIALITY.newModelDays) return { material: false, reason: "Released over 60 days ago" };
  const monthlyDelta = annualDeltaEur != null ? Math.abs(annualDeltaEur) / 12 : 0;
  if (exposedMonthlyEur >= MATERIALITY.minMonthlyEur || monthlyDelta >= MATERIALITY.minMonthlyEur) return { material: true, reason: "Spend exposed above threshold" };
  return { material: false, reason: "Spend exposed below threshold" };
}

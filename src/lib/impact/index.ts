/**
 * Impact Simulator — caricamento dal database e funzioni pronte per altri motori
 * (es. il motore dei cambi di mercato): stessa logica pura di engine.ts, nessun LLM.
 *
 *   priceChangeImpact(orgId, { providerId, pct, component?, modelId? })
 *   deprecationImpact(orgId, modelId, date?)
 *   runImpact(orgId, scenario)
 *
 * Solo codice lato server: niente "use client" qui.
 */
import { db } from "@/lib/db";
import { loadEstateCached } from "@/lib/estate/graph";
import { computeSavingsCached } from "@/lib/savings";
import { runScenario, deprecationOn, type ImpactContext } from "./engine";
import type { ImpactResult, PriceComponent, Scenario } from "./types";

export * from "./types";
export { runScenario, deprecationOn, SWITCHING_RULE, RISK_RULE, BUDGET_RANK, type ImpactContext } from "./engine";
export { parseScenario, scenarioQuery, impactHref, impactHrefForNode, SCENARIOS } from "./params";

/** Contesto dello scenario: estate (grafo + valutazioni), modalità solo UE e, se serve, i risparmi. */
export async function loadImpactContext(orgId: string, opts: { savings?: boolean; now?: Date } = {}): Promise<ImpactContext> {
  const [est, org, policy, savings] = await Promise.all([
    loadEstateCached(orgId),
    db.organization.findUnique({ where: { id: orgId }, select: { euOnly: true } }),
    db.gatewayPolicy.findUnique({ where: { organizationId: orgId }, select: { euOnly: true } }),
    opts.savings ? computeSavingsCached(orgId) : null,
  ]);
  return { est, orgEuOnly: org?.euOnly === true || policy?.euOnly === true, now: opts.now ?? new Date(), savings: savings?.items ?? null };
}

export async function runImpact(orgId: string, scenario: Scenario, now?: Date): Promise<ImpactResult> {
  const ctx = await loadImpactContext(orgId, { savings: scenario.s === "budget", now });
  return runScenario(ctx, scenario);
}

export interface PriceChangeInput {
  providerId: string;
  /** Variazione in percentuale: 25 = +25%, −10 = −10%. */
  pct: number;
  component?: PriceComponent;
  /** Solo un modello del fornitore. */
  modelId?: string | null;
}

/** Impatto sull'estate di un cambio di prezzo di un fornitore (o di un suo modello). */
export async function priceChangeImpact(orgId: string, change: PriceChangeInput, now?: Date): Promise<ImpactResult> {
  return runImpact(orgId, { s: "price-change", provider: change.providerId, pct: change.pct, component: change.component ?? "all", ...(change.modelId ? { model: change.modelId } : {}) }, now);
}

/** Impatto del ritiro di un modello a una data (default: la data del catalogo). */
export async function deprecationImpact(orgId: string, modelId: string, date?: Date | string | null, now?: Date): Promise<ImpactResult> {
  const ctx = await loadImpactContext(orgId, { now });
  return deprecationOn(ctx, modelId, date);
}

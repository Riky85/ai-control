/**
 * Valutazione di un AI system: Replaceability + Exit readiness a partire da una riga
 * già letta dal database (estate/graph.ts). Puro: si prova senza database.
 */
import { deploymentOf, resolveModel } from "@/lib/pricing/service";
import { replaceability, deploymentsOfModel, type ModelUseIn, type ProfileIn, type ContractIn, type EvaluationIn, type Replaceability } from "./replaceability";
import { exitReadiness, type ExitReadiness, type Fallback } from "./exit-readiness";
import type { SystemCost } from "./graph-core";

export interface SystemRow {
  id: string;
  name: string;
  type: string;
  vendor: string | null;
  serviceId: string | null;
  users: number;
  paidSeats: number | null;
  cost: SystemCost;
  uses: (ModelUseIn & { origin: string })[];
  seatProductId: string | null;
  profile: ProfileIn | null;
  contract: ContractIn | null;
  evaluations: EvaluationIn[];
}

export interface AssessContext {
  orgEuOnly: boolean;
  /** Fornitori a valle configurati nel Gateway angar ("openai", "anthropic"). */
  gatewayUpstreams: string[];
  /** Quanti AI system dell'azienda usano ciascun modello / prodotto del catalogo (id → numero). */
  estateUse?: Map<string, number>;
  now: Date;
}

/** Modelli e prodotti usati da ALTRI AI system dell'azienda (escluso questo). */
function usedElsewhere(row: SystemRow, ctx: AssessContext): string[] {
  if (!ctx.estateUse) return [];
  const own = new Map<string, number>();
  for (const id of ownIds(row)) own.set(id, (own.get(id) ?? 0) + 1);
  return [...ctx.estateUse].filter(([id, n]) => n - (own.get(id) ?? 0) > 0).map(([id]) => id);
}

/** Id del catalogo usati da un AI system (ognuno una volta). */
export function ownIds(row: SystemRow): string[] {
  return [...new Set([...row.uses.map((u) => u.modelId).filter((x): x is string => !!x), ...(row.seatProductId ? [row.seatProductId] : [])])];
}

export interface Assessment {
  repl: Replaceability;
  exit: ExitReadiness;
  fallback: Fallback;
}

/** Riserva: configurata (Gateway con più fornitori, o stesso modello già su due deployment) o solo disponibile nel catalogo. */
export function fallbackOf(row: SystemRow, ctx: AssessContext): Fallback {
  const viaGateway = row.uses.some((u) => u.origin === "gateway");
  let configured: string | null = null;
  if (viaGateway && ctx.gatewayUpstreams.length >= 2) configured = "angar Gateway with several providers";
  const byModel = new Map<string, Set<string>>();
  for (const u of row.uses) if (u.modelId && u.deploymentId) byModel.set(u.modelId, (byModel.get(u.modelId) ?? new Set()).add(u.deploymentId));
  for (const [, deps] of byModel) if (deps.size >= 2) configured ??= `Same model on ${deps.size} deployments`;
  let available: string | null = null;
  const primary = [...row.uses].sort((a, b) => (b.share ?? 0) - (a.share ?? 0))[0];
  const mid = primary ? primary.modelId ?? resolveModel(primary.rawModel)?.model.id ?? null : null;
  if (mid) {
    const other = deploymentsOfModel(mid).find((d) => d !== primary.deploymentId && !(primary.deploymentId == null && d.endsWith("-direct")));
    if (other) available = deploymentOf(other)?.name ?? other;
  }
  return { configured, available };
}

export function assessSystem(row: SystemRow, ctx: AssessContext): Assessment {
  const repl = replaceability({
    system: { id: row.id, name: row.name, type: row.type, serviceId: row.serviceId, users: row.users },
    uses: row.uses,
    seatProductId: row.seatProductId,
    paidSeats: row.paidSeats,
    profile: row.profile,
    orgEuOnly: ctx.orgEuOnly,
    contract: row.contract,
    cost: row.cost,
    evaluations: row.evaluations,
    inUse: usedElsewhere(row, ctx),
    now: ctx.now,
  });
  const fallback = fallbackOf(row, ctx);
  const renewalInDays = row.contract?.renewalDate ? Math.round((row.contract.renewalDate.getTime() - ctx.now.getTime()) / 86400000) : null;
  const exit = exitReadiness({
    repl,
    evaluations: row.evaluations.length,
    passedEvaluation: row.evaluations.some((e) => e.passed),
    fallback,
    contract: row.contract ? { annual: row.contract.billingCycle === "annual", renewalInDays } : null,
  });
  return { repl, exit, fallback };
}

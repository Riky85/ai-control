import { redirect } from "next/navigation";
import type { ConnectorProvider, Organization, Plan } from "@prisma/client";
import { db } from "@/lib/db";
import { isOnPrem } from "@/lib/edition";
import { currentSession } from "@/lib/auth";
import { FEATURES, TRIAL_DAYS, TRIAL_PLAN, featureAvailability, hasFeature, planById, planRank, type Feature } from "@/lib/plans";

const DAY = 86_400_000;
/** Chi era già in prova senza data di fine ha almeno 7 giorni da quando la data viene fissata. */
const MIN_GRACE_DAYS = 7;

type OrgForPlan = Pick<Organization, "plan" | "planStatus" | "createdAt" | "trialEndsAt" | "stripeSubscriptionId"> & { addons?: string[] | null };

export interface PlanState {
  /** Piano registrato sull'organizzazione. */
  planId: Plan;
  /** Piano i cui limiti e funzioni valgono ora (Growth in prova, Free a prova scaduta). */
  effectivePlan: Plan;
  addons: string[];
  trialing: boolean;
  trialEndsAt: Date | null;
  trialDaysLeft: number | null;
  /** Prova finita senza abbonamento (o abbonamento cancellato): limiti Free. */
  expired: boolean;
  /** Le scritture oltre i limiti Free sono bloccate; i dati restano tutti visibili. */
  readOnly: boolean;
}

const LAPSED = ["canceled", "unpaid", "incomplete_expired"];

/** Fine prova per un'organizzazione in prova senza data: createdAt + 14 g, mai prima di adesso + 7 g. */
export function lazyTrialEnd(createdAt: Date, now = new Date()) {
  return new Date(Math.max(createdAt.getTime() + TRIAL_DAYS * DAY, now.getTime() + MIN_GRACE_DAYS * DAY));
}

/** Stato del piano (pura: niente database). */
export function planState(org: OrgForPlan, now = new Date()): PlanState {
  const addons = [...(org.addons ?? [])];
  // On-premises: licenza aziendale, tutto incluso, nessuna prova che scade.
  if (isOnPrem()) return { planId: org.plan, effectivePlan: "ENTERPRISE", addons, trialing: false, trialEndsAt: null, trialDaysLeft: null, expired: false, readOnly: false };
  const inOwnTrial = org.planStatus === "trialing" && !org.stripeSubscriptionId;
  if (inOwnTrial) {
    const end = org.trialEndsAt ?? lazyTrialEnd(org.createdAt, now);
    const left = end.getTime() - now.getTime();
    if (left > 0) {
      const effectivePlan = planRank(org.plan) > planRank(TRIAL_PLAN) ? org.plan : TRIAL_PLAN;
      return { planId: org.plan, effectivePlan, addons, trialing: true, trialEndsAt: end, trialDaysLeft: Math.ceil(left / DAY), expired: false, readOnly: false };
    }
    return { planId: org.plan, effectivePlan: "FREE", addons, trialing: false, trialEndsAt: end, trialDaysLeft: 0, expired: true, readOnly: org.plan !== "FREE" };
  }
  if (LAPSED.includes(org.planStatus) && org.plan !== "FREE") {
    return { planId: org.plan, effectivePlan: "FREE", addons, trialing: false, trialEndsAt: org.trialEndsAt, trialDaysLeft: null, expired: true, readOnly: true };
  }
  return { planId: org.plan, effectivePlan: org.plan, addons, trialing: false, trialEndsAt: org.trialEndsAt, trialDaysLeft: null, expired: false, readOnly: false };
}

/**
 * Stato del piano dal database. La prima volta che un'organizzazione in prova
 * non ha una data di fine, la fissa (così la prova non si sposta ogni giorno).
 * `loaded`: l'organizzazione già letta dal chiamante (es. il layout), per non rileggerla.
 */
export async function getPlanState(orgId: string, loaded?: Organization | null): Promise<PlanState & { org: Organization }> {
  const org = loaded && loaded.id === orgId ? loaded : await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const state = planState(org);
  if (state.trialEndsAt && !org.trialEndsAt && org.planStatus === "trialing" && !org.stripeSubscriptionId) {
    await db.organization.updateMany({ where: { id: orgId, trialEndsAt: null }, data: { trialEndsAt: state.trialEndsAt } });
  }
  return { ...state, org };
}

export const limitsFor = (state: Pick<PlanState, "effectivePlan">) => planById(state.effectivePlan).limits;

export type GateKey = Feature | "aiSystems" | "connections";
export type GateResult = { ok: true; state: PlanState } | { ok: false; state: PlanState; message: string };

const CONNECTOR_FEATURE: Partial<Record<ConnectorProvider, Feature>> = {
  MICROSOFT_365: "microsoft365",
  GOOGLE_WORKSPACE: "googleWorkspace",
  OKTA: "okta",
};

/** Connessioni che contano nel limite: collegate con credenziali (come nella pagina Billing). */
export function countConnections(orgId: string, exceptProvider?: ConnectorProvider) {
  return db.connector.count({
    where: {
      organizationId: orgId,
      status: "CONNECTED",
      credentialsEncrypted: { not: null },
      // Jira e ServiceNow ricevono ticket, non sono fonti: non contano nel limite.
      provider: { notIn: ["JIRA", "SERVICENOW", ...(exceptProvider ? [exceptProvider] : [])] },
    },
  });
}

/**
 * Il piano permette questa funzione / un'altra unità di questo limite?
 * - aiSystems: `adding` nuovi sistemi (default 1)
 * - connections: nuovo collegamento `provider` (ricollegare lo stesso non conta)
 */
export async function planGate(orgId: string, key: GateKey, opts: { adding?: number; provider?: ConnectorProvider } = {}): Promise<GateResult> {
  const state = await getPlanState(orgId);
  const plan = planById(state.effectivePlan);
  const who = state.expired ? "Your trial has ended and the Discover plan" : `The ${plan.displayName} plan`;
  if (key === "aiSystems") {
    const limit = plan.limits.aiSystems;
    if (limit === null) return { ok: true, state };
    const used = await db.aiAsset.count({ where: { organizationId: orgId, deletedAt: null } });
    if (used + (opts.adding ?? 1) <= limit) return { ok: true, state };
    return { ok: false, state, message: `${who} manages up to ${limit} AI systems — choose a plan in Billing to manage more.` };
  }
  if (key === "connections") {
    const feature = opts.provider ? CONNECTOR_FEATURE[opts.provider] : undefined;
    if (feature && !hasFeature(state.effectivePlan, state.addons, feature)) {
      return { ok: false, state, message: `${FEATURES[feature].label}: ${featureAvailability(feature).toLowerCase()} — choose a plan in Billing.` };
    }
    const limit = plan.limits.connections;
    if (limit === null) return { ok: true, state };
    const used = await countConnections(orgId, opts.provider);
    if (used < limit) return { ok: true, state };
    return { ok: false, state, message: `${who} includes ${limit} connection${limit === 1 ? "" : "s"} — disconnect one or choose a plan in Billing.` };
  }
  if (hasFeature(state.effectivePlan, state.addons, key)) return { ok: true, state };
  return { ok: false, state, message: `${FEATURES[key].label}: ${featureAvailability(key).toLowerCase()} — choose a plan in Billing.` };
}

/** Per le server action: se il piano non lo permette torna a `back` con l'errore. */
export async function requireFeature(key: GateKey, back = "/billing", opts: { adding?: number; provider?: ConnectorProvider } = {}) {
  const s = currentSession();
  if (!s) redirect("/login");
  const g = await planGate(s.orgId, key, opts);
  if (!g.ok) {
    const [path, hash] = back.split("#");
    redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(g.message)}${hash ? `#${hash}` : ""}`);
  }
  return g.state;
}

/** Solo sì/no, per la UI (lucchetti). */
export async function featureEnabled(orgId: string, feature: Feature) {
  const s = await getPlanState(orgId);
  return hasFeature(s.effectivePlan, s.addons, feature);
}

/**
 * Sistemi AI gestibili: i primi N per data di creazione. Quelli oltre il
 * limite restano visibili (la scoperta non si blocca mai) ma non modificabili.
 */
export async function assetManageable(orgId: string, assetId: string) {
  const state = await getPlanState(orgId);
  const limit = planById(state.effectivePlan).limits.aiSystems;
  if (limit === null) return { ok: true as const, limit };
  const asset = await db.aiAsset.findFirst({ where: { id: assetId, organizationId: orgId }, select: { createdAt: true, id: true } });
  if (!asset) return { ok: true as const, limit };
  const before = await db.aiAsset.count({
    where: { organizationId: orgId, deletedAt: null, OR: [{ createdAt: { lt: asset.createdAt } }, { createdAt: asset.createdAt, id: { lt: asset.id } }] },
  });
  return before < limit ? { ok: true as const, limit } : { ok: false as const, limit, message: `Your plan manages the first ${limit} AI systems — choose a plan in Billing to manage more than ${limit}.` };
}

/** Quanti sistemi AI sono oltre il limite del piano (0 = nessuno). */
export async function assetsOverLimit(orgId: string) {
  const state = await getPlanState(orgId);
  const limit = planById(state.effectivePlan).limits.aiSystems;
  if (limit === null) return { over: 0, limit, total: 0 };
  const total = await db.aiAsset.count({ where: { organizationId: orgId, deletedAt: null } });
  return { over: Math.max(0, total - limit), limit, total };
}

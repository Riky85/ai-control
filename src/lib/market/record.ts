/**
 * AI Market Change engine — scrittura nel database (idempotente).
 *
 * detectMarketChanges legge lo stato salvato (AiPricingComponent, AiPricingRule, AiModel:
 * versioni del catalogo, correzioni della sincronizzazione e versioni inserite dagli admin
 * della piattaforma) e crea le righe AiMarketChange che mancano. Chiave unica `key`:
 * ripetere il rilevamento non duplica nulla e non riscrive le righe già salvate
 * (stato vecchio / nuovo e data di rilevamento restano quelli della prima volta).
 */
import type { PrismaClient } from "@prisma/client";
import { deriveChanges, type ChangeDraft, type Snapshot } from "./detect";

type Db = PrismaClient;

async function getDb(client?: Db): Promise<Db> {
  return client ?? (await import("@/lib/db")).db;
}

/** Stato salvato del catalogo, nella forma letta dal rilevamento. */
export async function loadSnapshot(client?: Db): Promise<Snapshot> {
  const db = await getDb(client);
  const [components, rules, models, products, deployments] = await Promise.all([
    db.aiPricingComponent.findMany(),
    db.aiPricingRule.findMany({ select: { id: true, modelId: true, productId: true, planId: true, seatTypeId: true, deploymentId: true } }),
    db.aiModel.findMany(),
    db.aiProduct.findMany({ select: { id: true, providerId: true } }),
    db.aiDeployment.findMany({ select: { id: true, hostProviderId: true } }),
  ]);
  return {
    components,
    rules,
    models,
    productProvider: Object.fromEntries(products.map((p) => [p.id, p.providerId])),
    deploymentHost: Object.fromEntries(deployments.map((d) => [d.id, d.hostProviderId])),
  };
}

const toRow = (c: ChangeDraft) => ({
  key: c.key,
  changeType: c.changeType,
  providerId: c.providerId,
  modelId: c.modelId,
  productId: c.productId,
  planId: c.planId,
  ruleId: c.ruleId,
  deploymentId: c.deploymentId,
  oldState: (c.oldState ?? undefined) as object | undefined,
  newState: c.newState as object,
  announcedAt: c.announcedAt,
  effectiveAt: c.effectiveAt,
  sourceUrl: c.sourceUrl,
  sourceType: c.sourceType,
  confidence: c.confidence,
  detectedAt: c.detectedAt,
  summary: c.summary.slice(0, 500),
  origin: c.origin,
});

/** Salva i cambiamenti nuovi (chiave unica: skipDuplicates). Restituisce quanti erano nuovi. */
export async function recordChanges(drafts: ChangeDraft[], client?: Db): Promise<number> {
  if (!drafts.length) return 0;
  const db = await getDb(client);
  const r = await db.aiMarketChange.createMany({ data: drafts.map(toRow), skipDuplicates: true });
  return r.count;
}

export interface DetectResult {
  derived: number;
  created: number;
  superseded: number;
}

/**
 * Rileva e salva i cambiamenti ricavabili dallo stato salvato. Idempotente.
 * Le deprecazioni / i ritiri con una data poi cambiata (o tolta) restano nello storico
 * come "superseded" e spariscono dal feed.
 */
export async function detectMarketChanges(client?: Db, now = new Date(), extra: ChangeDraft[] = []): Promise<DetectResult> {
  const db = await getDb(client);
  const snap = await loadSnapshot(db);
  const drafts = [...deriveChanges(snap, now), ...extra];
  const created = await recordChanges(drafts, db);
  // Ciclo di vita superato: chiavi attive di deprecazione/ritiro che lo stato attuale non produce più.
  const current = new Set(drafts.filter((d) => d.changeType === "deprecation" || d.changeType === "retirement").map((d) => d.key));
  const modelIds = new Set(snap.models.map((m) => m.id));
  const active = await db.aiMarketChange.findMany({ where: { status: "active", changeType: { in: ["deprecation", "retirement"] } }, select: { id: true, key: true, modelId: true } });
  const stale = active.filter((r) => r.key && r.modelId && modelIds.has(r.modelId) && !current.has(r.key)).map((r) => r.id);
  if (stale.length) await db.aiMarketChange.updateMany({ where: { id: { in: stale } }, data: { status: "superseded" } });
  return { derived: drafts.length, created, superseded: stale.length };
}

/**
 * Carica il catalogo prezzi AI (pricing/catalog-data) nel database. Idempotente:
 * gira a ogni deploy (prisma/seed.ts) e dal job periodico quando cambia la versione
 * del catalogo (jobs.ts, chiave = CATALOG_VERSION).
 *
 * Regole sullo storico dei prezzi:
 * - una voce di prezzo esistente NON viene mai sovrascritta nel prezzo: si aggiornano
 *   solo la provenienza (fonte, verificato il, confidenza, nota) e la chiusura (effectiveUntil);
 * - se il catalogo cambia il prezzo di una versione già salvata, la versione salvata si chiude
 *   oggi e se ne apre una nuova da oggi, che ricorda il prezzo precedente (correzione);
 * - le righe nel database che il catalogo non ha più restano (lo storico non si cancella).
 */
import type { PrismaClient } from "@prisma/client";
import { buildCatalog, type CatComponent } from "./catalog-data";

const keyOf = (c: { ruleId: string; kind: string; region: string; serviceTier: string; contextAbove: number; effectiveFrom: Date }) =>
  [c.ruleId, c.kind, c.region, c.serviceTier, c.contextAbove, c.effectiveFrom.toISOString()].join("|");

const sameDate = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

export interface CatalogSyncResult {
  version: string;
  models: number;
  seatTypes: number;
  componentsCreated: number;
  componentsUpdated: number;
  corrections: number;
}

export async function syncPricingCatalog(client?: PrismaClient, now = new Date()): Promise<CatalogSyncResult> {
  const db = client ?? (await import("@/lib/db")).db;
  const cat = buildCatalog();

  // Stato dei modelli e dei deployment PRIMA della sincronizzazione: le differenze diventano cambiamenti del mercato (market/).
  const [modelsBefore, deploymentsBefore] = await Promise.all([db.aiModel.findMany(), db.aiDeployment.findMany({ select: { id: true, regions: true, hostProviderId: true } })]);

  // Anagrafiche: upsert semplice (non sono prezzi).
  for (const p of cat.providers) {
    const data = { name: p.name, kind: p.kind, website: p.website, pricingUrl: p.pricingUrl, hqRegion: p.hqRegion, euDataResidency: p.euDataResidency };
    await db.aiProvider.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  }
  for (const d of cat.deployments) {
    const data = { kind: d.kind, hostProviderId: d.hostProviderId, name: d.name, regions: d.regions };
    await db.aiDeployment.upsert({ where: { id: d.id }, create: { id: d.id, ...data }, update: data });
  }
  for (const p of cat.products) {
    const data = { providerId: p.providerId, name: p.name, kind: p.kind, serviceId: p.serviceId, billingModel: p.billingModel, website: p.website, pricingUrl: p.pricingUrl };
    await db.aiProduct.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  }
  for (const p of cat.plans) {
    const data = { productId: p.productId, name: p.name, audience: p.audience, billingModel: p.billingModel, minSeats: p.minSeats, maxSeats: p.maxSeats, status: p.status, notes: p.notes };
    await db.aiPlan.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  }
  for (const s of cat.seatTypes) {
    const data = { planId: s.planId, key: s.key, name: s.name, isDefault: s.isDefault, legacyPlanId: s.legacyPlanId };
    await db.aiSeatType.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
  }
  for (const m of cat.models) {
    const data = {
      providerId: m.providerId,
      apiId: m.apiId,
      name: m.name,
      family: m.family,
      tier: m.tier,
      lifecycle: m.lifecycle,
      releasedAt: m.releasedAt,
      deprecatedAt: m.deprecatedAt,
      retiresAt: m.retiresAt,
      replacementId: m.replacementId,
      contextWindow: m.contextWindow,
      maxOutput: m.maxOutput,
      modalitiesIn: m.modalitiesIn,
      modalitiesOut: m.modalitiesOut,
      capabilities: m.capabilities as object,
      sourceUrl: m.sourceUrl,
      sourceType: m.sourceType,
      lastVerifiedAt: m.lastVerifiedAt,
      confidence: m.confidence,
    };
    await db.aiModel.upsert({ where: { id: m.id }, create: { id: m.id, ...data }, update: data });
  }
  for (const r of cat.rules) {
    const data = { billingModel: r.billingModel, modelId: r.modelId, productId: r.productId, planId: r.planId, seatTypeId: r.seatTypeId, deploymentId: r.deploymentId, minSeats: r.minSeats, notes: r.notes };
    await db.aiPricingRule.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
  }

  // Voci di prezzo versionate.
  const existing = await db.aiPricingComponent.findMany();
  const byKey = new Map(existing.map((e) => [keyOf(e), e]));
  // Inizi di versione salvati per serie: una versione chiusa da una più recente inserita da un admin
  // della piattaforma (non ancora nel catalogo in codice) non si riapre.
  const seriesOf = (c: { ruleId: string; kind: string; region: string; serviceTier: string; contextAbove: number }) => [c.ruleId, c.kind, c.region, c.serviceTier, c.contextAbove].join("|");
  const starts = new Set(existing.map((e) => `${seriesOf(e)}|${e.effectiveFrom.toISOString()}`));
  const closedByNewer = (e: { effectiveUntil: Date | null } & Parameters<typeof seriesOf>[0]) => !!e.effectiveUntil && starts.has(`${seriesOf(e)}|${e.effectiveUntil.toISOString()}`);
  const toCreate: CatComponent[] = [];
  let updated = 0;
  let corrections = 0;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let c of cat.components) {
    const e = byKey.get(keyOf(c));
    if (!e) {
      toCreate.push(c);
      continue;
    }
    if (Math.abs(e.price - c.price) > 1e-9 || e.currency !== c.currency) {
      // Prezzo diverso per una versione già salvata: mai sovrascrivere. Si chiude e si apre una correzione da oggi.
      if (e.effectiveUntil && e.effectiveUntil <= today) continue;
      const from = today > e.effectiveFrom ? today : new Date(e.effectiveFrom.getTime() + 86_400_000);
      await db.aiPricingComponent.update({ where: { id: e.id }, data: { effectiveUntil: from } });
      toCreate.push({ ...c, effectiveFrom: from, previousPrice: e.price, note: `Correction detected ${today.toISOString().slice(0, 10)}${c.note ? ` · ${c.note}` : ""}` });
      corrections++;
      continue;
    }
    const prov = { sourceUrl: c.sourceUrl, sourceType: c.sourceType, lastVerifiedAt: c.lastVerifiedAt, confidence: c.confidence, note: c.note, unit: c.unit };
    if (!c.effectiveUntil && closedByNewer(e)) c = { ...c, effectiveUntil: e.effectiveUntil };
    const changed =
      e.sourceUrl !== prov.sourceUrl || e.sourceType !== prov.sourceType || !sameDate(e.lastVerifiedAt, prov.lastVerifiedAt) || e.confidence !== prov.confidence || e.note !== prov.note || e.unit !== prov.unit || !sameDate(e.effectiveUntil, c.effectiveUntil);
    if (changed) {
      await db.aiPricingComponent.update({ where: { id: e.id }, data: { ...prov, effectiveUntil: c.effectiveUntil } });
      updated++;
    }
  }
  if (toCreate.length) {
    await db.aiPricingComponent.createMany({
      data: toCreate.map((c) => ({
        ruleId: c.ruleId,
        kind: c.kind,
        unit: c.unit,
        price: c.price,
        currency: c.currency,
        region: c.region,
        serviceTier: c.serviceTier,
        contextAbove: c.contextAbove,
        effectiveFrom: c.effectiveFrom,
        effectiveUntil: c.effectiveUntil,
        sourceUrl: c.sourceUrl,
        sourceType: c.sourceType,
        lastVerifiedAt: c.lastVerifiedAt,
        confidence: c.confidence,
        previousPrice: c.previousPrice,
        detectedAt: now,
        note: c.note,
      })),
      skipDuplicates: true,
    });
  }
  // Cambiamenti del mercato: coppie di versioni (anche le correzioni appena aperte), ciclo di vita,
  // capacità e regioni cambiate. Mai bloccante per la sincronizzazione dei prezzi.
  try {
    const [{ diffModels }, { detectMarketChanges }] = await Promise.all([import("@/lib/market/detect"), import("@/lib/market/record")]);
    const providerUrl = new Map(cat.providers.map((p) => [p.id, p.pricingUrl ?? p.website]));
    const diffs = diffModels(modelsBefore, cat.models, now, { before: deploymentsBefore, after: cat.deployments.map((d) => ({ ...d, sourceUrl: providerUrl.get(d.hostProviderId) ?? null })) });
    await detectMarketChanges(db, now, diffs);
  } catch (err) {
    console.error("[pricing] market change detection failed", err);
  }
  if (corrections) console.warn(`[pricing] ${corrections} catalog price correction(s): previous versions closed, new versions opened from today`);
  return { version: cat.version, models: cat.models.length, seatTypes: cat.seatTypes.length, componentsCreated: toCreate.length, componentsUpdated: updated, corrections };
}

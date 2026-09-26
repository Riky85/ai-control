import { createHash } from "crypto";
import { db } from "@/lib/db";
import { AI_SERVICES } from "@/lib/discovery/catalog";
import { assessAsset } from "@/lib/asset-assess";
import { recordInventorySnapshot } from "@/lib/evidence";
import { summarize, type ParseResult } from "./parse";

export const serviceById = (id: string) => AI_SERVICES.find((s) => s.id === id);

/** Trova l'AI del workspace che corrisponde a un servizio del catalogo (o la crea). */
export async function assetForService(organizationId: string, service: string, lastSeen?: Date) {
  const svc = serviceById(service);
  const name = svc?.name ?? service;
  let asset =
    (await db.aiAsset.findFirst({ where: { organizationId, deletedAt: null, serviceId: service } })) ??
    (await db.aiAsset.findFirst({ where: { organizationId, deletedAt: null, name: { equals: name, mode: "insensitive" } } }));
  if (!asset) {
    asset = await db.aiAsset.create({
      data: {
        organizationId,
        name,
        vendor: svc?.vendor ?? null,
        type: svc?.type ?? "AI_APPLICATION",
        serviceId: service,
        // Pagato dall'azienda: è già in uso "ufficialmente", niente revisione.
        status: "APPROVED",
        lastSeenAt: lastSeen ?? new Date(),
      },
    });
    await assessAsset(asset.id);
    return { asset, created: true };
  }
  if (!asset.serviceId || (lastSeen && (!asset.lastSeenAt || lastSeen > asset.lastSeenAt))) {
    asset = await db.aiAsset.update({ where: { id: asset.id }, data: { serviceId: asset.serviceId ?? service, ...(lastSeen && (!asset.lastSeenAt || lastSeen > asset.lastSeenAt) ? { lastSeenAt: lastSeen } : {}) } });
  }
  return { asset, created: false };
}

/**
 * Salva gli addebiti AI e aggiorna il costo mensile di ogni AI.
 * Il costo dalla fatturazione del provider (API) resta prioritario.
 */
export async function ingestSpend(organizationId: string, parsed: ParseResult) {
  const summary = summarize(parsed.charges);
  const result: { service: string; name: string; monthlyEur: number; created: boolean }[] = [];
  for (const s of summary) {
    const { asset, created } = await assetForService(organizationId, s.service, s.last);
    const charges = parsed.charges.filter((c) => c.service === s.service);
    await db.spendRecord.createMany({
      data: charges.map((c) => ({
        organizationId,
        aiAssetId: asset.id,
        service: c.service,
        source: c.source,
        date: c.date,
        amountEur: c.amountEur,
        description: c.description,
        fingerprint: createHash("sha1").update(`${c.source}|${c.date.toISOString().slice(0, 10)}|${c.amountEur}|${c.description}`).digest("hex"),
      })),
      skipDuplicates: true,
    });
    const existing = await db.aiSystemCost.findUnique({ where: { aiAssetId: asset.id } });
    if (existing?.basis !== "billing_connector") {
      const data = {
        monthlyCostEstimate: s.monthlyEur,
        basis: s.source,
        confidence: "HIGH",
        planId: s.planId,
        seats: s.seats,
        annualBilling: s.annual,
        notes: `${s.count} charge${s.count === 1 ? "" : "s"} from ${s.first.toISOString().slice(0, 10)} to ${s.last.toISOString().slice(0, 10)}${s.planName ? ` · looks like ${s.seats && s.seats > 1 ? `${s.seats} × ` : ""}${s.planName}` : ""}`,
      };
      await db.aiSystemCost.upsert({ where: { aiAssetId: asset.id }, update: data, create: { aiAssetId: asset.id, ...data } });
    }
    result.push({ service: s.service, name: asset.name, monthlyEur: s.monthlyEur, created });
  }
  if (summary.length) await recordInventorySnapshot(organizationId);
  return result;
}

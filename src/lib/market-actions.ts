"use server";

/**
 * Azioni degli admin della PIATTAFORMA (isPlatformAdmin) sul catalogo globale:
 * - "Verified today": registra la verifica umana di una fonte (AiCatalogSource);
 * - nuova versione di un prezzo con la sua fonte: chiude la versione in vigore
 *   (mai sovrascritta), apre la nuova e rileva il cambiamento del mercato dallo
 *   stesso percorso del job (market/record.ts).
 *
 * Come ha effetto una versione inserita qui: è subito nel database, quindi nel feed dei
 * cambiamenti e nel loro impatto sulle aziende. Il servizio prezzi (stime dei costi, Gateway)
 * legge invece il catalogo in codice, sincrono e uguale in ogni processo: la versione vale
 * lì solo quando il team la riporta in pricing/catalog-data con la stessa data (/system/catalog
 * la elenca come "not in the code catalog yet"); la sincronizzazione poi la trova identica e
 * non duplica nulla. Così nessun prezzo inserito a mano cambia in silenzio i costi stimati.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

const BACK = "/system/catalog";
const AREAS = ["pricing", "lifecycle", "capabilities"];
const KINDS = ["input", "output", "cached_input", "cache_write", "cache_write_1h", "reasoning", "image_input", "audio_input", "audio_output", "image_output", "embedding", "search", "tool_call", "session_hour", "credit", "seat_monthly", "seat_annual"];

const fail = (msg: string): never => redirect(`${BACK}?error=${encodeURIComponent(msg)}`);

export async function markSourceVerifiedAction(formData: FormData) {
  const s = await requirePlatformAdmin();
  const area = String(formData.get("area") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  const providerId = String(formData.get("providerId") ?? "") || null;
  if (!AREAS.includes(area) || !/^https:\/\//.test(url)) fail("A source needs an https URL to be verified.");
  const id = `${area}|${url}`;
  const now = new Date();
  await db.aiCatalogSource.upsert({ where: { id }, create: { id, area, url, providerId, lastVerifiedAt: now, verifiedBy: s.email }, update: { lastVerifiedAt: now, verifiedBy: s.email } });
  await audit("catalog.source_verified", id, { area, url }, { orgId: null });
  revalidatePath(BACK);
  redirect(`${BACK}?verified=1`);
}

export async function addPriceVersionAction(formData: FormData) {
  const s = await requirePlatformAdmin();
  const ruleId = String(formData.get("ruleId") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  const region = String(formData.get("region") ?? "global").trim() || "global";
  const serviceTier = String(formData.get("serviceTier") ?? "standard").trim() || "standard";
  const contextAbove = Number(formData.get("contextAbove") ?? 0) || 0;
  const price = Number(String(formData.get("price") ?? "").replace(",", "."));
  const day = String(formData.get("effectiveFrom") ?? "");
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  const sourceType = String(formData.get("sourceType") ?? "official");
  const confidence = String(formData.get("confidence") ?? "HIGH");
  const announced = String(formData.get("announcedAt") ?? "");

  if (!KINDS.includes(kind)) fail("Pick a price component.");
  if (!Number.isFinite(price) || price < 0) fail("Enter a valid price.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail("Enter the effective date.");
  if (!/^https:\/\/\S+$/.test(sourceUrl)) fail("A new price needs the https URL of its source.");
  if (!["official", "secondary"].includes(sourceType) || !["HIGH", "MEDIUM", "LOW"].includes(confidence)) fail("Pick the source type and confidence.");
  const from = new Date(`${day}T00:00:00Z`);

  const rule = await db.aiPricingRule.findUnique({ where: { id: ruleId }, select: { id: true } });
  if (!rule) fail("Unknown pricing rule.");
  const series = await db.aiPricingComponent.findMany({ where: { ruleId, kind, region, serviceTier, contextAbove }, orderBy: { effectiveFrom: "asc" } });
  // Solo nuove versioni di un prezzo che esiste già: un prezzo nuovo del tutto va nel catalogo in codice.
  if (!series.length) fail("No existing version of this price: add it to the catalog in code.");
  if (series.some((c) => c.effectiveFrom.getTime() === from.getTime())) fail("A version already starts on that date.");
  const covering = [...series].reverse().find((c) => c.effectiveFrom < from && (!c.effectiveUntil || c.effectiveUntil > from));
  const next = series.find((c) => c.effectiveFrom > from);
  const prev = covering ?? [...series].reverse().find((c) => c.effectiveFrom < from) ?? null;
  if (!prev) fail("The new version must start after the first known version.");
  const now = new Date();

  await db.$transaction([
    ...(covering ? [db.aiPricingComponent.update({ where: { id: covering.id }, data: { effectiveUntil: from } })] : []),
    db.aiPricingComponent.create({
      data: {
        ruleId,
        kind,
        unit: prev!.unit,
        price,
        currency: prev!.currency,
        region,
        serviceTier,
        contextAbove,
        effectiveFrom: from,
        effectiveUntil: next ? next.effectiveFrom : null,
        sourceUrl,
        sourceType,
        lastVerifiedAt: now,
        confidence,
        previousPrice: prev!.price,
        detectedAt: now,
        note: `Entered by ${s.email}${announced ? ` · announced ${announced}` : ""}`,
      },
    }),
  ]);
  await db.aiCatalogSource.upsert({ where: { id: `pricing|${sourceUrl}` }, create: { id: `pricing|${sourceUrl}`, area: "pricing", url: sourceUrl, lastVerifiedAt: now, verifiedBy: s.email }, update: { lastVerifiedAt: now, verifiedBy: s.email } });
  // Stesso percorso del job: la coppia di versioni diventa un cambiamento del mercato.
  const { detectMarketChanges } = await import("@/lib/market/record");
  await detectMarketChanges(undefined, now);
  if (/^\d{4}-\d{2}-\d{2}$/.test(announced)) {
    await db.aiMarketChange.updateMany({ where: { key: `price:${ruleId}:${day}`, announcedAt: null }, data: { announcedAt: new Date(`${announced}T00:00:00Z`) } });
  }
  await audit("catalog.price_version_added", ruleId, { kind, region, serviceTier, contextAbove, price, from: day, previousPrice: prev!.price, sourceUrl }, { orgId: null });
  revalidatePath(BACK);
  redirect(`${BACK}?saved=1`);
}

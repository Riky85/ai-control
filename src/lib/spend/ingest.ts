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
  // Caricamenti concorrenti: un lock per azienda + servizio (dentro la transazione) evita due AI uguali.
  const { asset: found, created } = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`asset:${organizationId}:${service}`}::text))`;
      const hit =
        (await tx.aiAsset.findFirst({ where: { organizationId, deletedAt: null, serviceId: service } })) ??
        (await tx.aiAsset.findFirst({ where: { organizationId, deletedAt: null, name: { equals: name, mode: "insensitive" } } }));
      if (hit) return { asset: hit, created: false };
      const made = await tx.aiAsset.create({
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
      return { asset: made, created: true };
    },
    { timeout: 20_000 }
  );
  let asset = found;
  if (created) {
    await assessAsset(asset.id);
    return { asset, created: true };
  }
  if (!asset.serviceId || (lastSeen && (!asset.lastSeenAt || lastSeen > asset.lastSeenAt))) {
    asset = await db.aiAsset.update({ where: { id: asset.id }, data: { serviceId: asset.serviceId ?? service, ...(lastSeen && (!asset.lastSeenAt || lastSeen > asset.lastSeenAt) ? { lastSeenAt: lastSeen } : {}) } });
  }
  return { asset, created: false };
}

const DAY = 86_400_000;
/** Stesso addebito da fonti diverse (estratto conto + fattura): importo ±0,5%, data ±3 giorni. */
const SAME_AMOUNT = 0.005;
const SAME_DAYS = 3;

/**
 * Impronta di un addebito. Addebiti identici nello stesso caricamento (stessa fonte,
 * giorno, importo e descrizione) restano distinti con un indice progressivo; il primo
 * ha l'impronta di sempre, così ricaricare lo stesso file non duplica nulla.
 */
export function chargeFingerprints(charges: { source: string; date: Date; amountEur: number; description: string }[]) {
  const seen = new Map<string, number>();
  return charges.map((c) => {
    const base = `${c.source}|${c.date.toISOString().slice(0, 10)}|${c.amountEur}|${c.description}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return createHash("sha1").update(n === 0 ? base : `${base}|#${n}`).digest("hex");
  });
}

/** Stesso addebito? importo entro lo 0,5% e data entro 3 giorni. */
export function sameCharge(a: { date: Date; amountEur: number }, b: { date: Date; amountEur: number }) {
  const ref = Math.max(Math.abs(a.amountEur), Math.abs(b.amountEur));
  return Math.sign(a.amountEur) === Math.sign(b.amountEur) && Math.abs(a.amountEur - b.amountEur) <= ref * SAME_AMOUNT && Math.abs(a.date.getTime() - b.date.getTime()) <= SAME_DAYS * DAY;
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
    const fps = chargeFingerprints(charges);
    const lo = new Date(Math.min(...charges.map((c) => c.date.getTime())) - SAME_DAYS * DAY);
    const hi = new Date(Math.max(...charges.map((c) => c.date.getTime())) + SAME_DAYS * DAY);
    // Dedupe e scrittura sotto lock (azienda + servizio): due caricamenti insieme non si duplicano.
    const latestBefore = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`spend:${organizationId}:${s.service}`}::text))`;
        // Addebito più recente già noto per questa AI (prima di questo caricamento).
        const latest = await tx.spendRecord.aggregate({ where: { organizationId, aiAssetId: asset.id, source: { not: "gateway" } }, _max: { date: true } });
        const already = new Set(
          (await tx.spendRecord.findMany({ where: { organizationId, fingerprint: { in: fps } }, select: { fingerprint: true } })).map((r) => r.fingerprint)
        );
        // Candidati da altre fonti: stessa AI (o stesso servizio), nella finestra di date.
        const others = await tx.spendRecord.findMany({
          where: { organizationId, date: { gte: lo, lte: hi }, source: { notIn: ["gateway"] }, OR: [{ aiAssetId: asset.id }, { service: s.service }] },
          select: { id: true, source: true, date: true, amountEur: true },
        });
        const pool = others.map((r) => ({ ...r, used: false }));
        const data = [];
        for (let i = 0; i < charges.length; i++) {
          const c = charges[i];
          if (already.has(fps[i])) continue;
          // Stesso addebito già registrato da un'altra fonte (es. fattura ed estratto conto): non si conta due volte.
          const twin = pool.find((r) => !r.used && r.source !== c.source && sameCharge(r, c));
          if (twin) {
            twin.used = true;
            continue;
          }
          data.push({ organizationId, aiAssetId: asset.id, service: c.service, source: c.source, date: c.date, amountEur: c.amountEur, description: c.description, fingerprint: fps[i] });
          // Anche dentro lo stesso caricamento (file con fatture ed estratto conto insieme).
          pool.push({ id: fps[i], source: c.source, date: c.date, amountEur: c.amountEur, used: false });
        }
        if (data.length) await tx.spendRecord.createMany({ data, skipDuplicates: true });
        return latest._max.date;
      },
      { timeout: 60_000 }
    );
    const existing = await db.aiSystemCost.findUnique({ where: { aiAssetId: asset.id } });
    // Il costo si aggiorna solo con l'addebito più recente noto (un estratto conto vecchio non
    // sovrascrive), e mai sopra un costo inserito a mano o dalla fatturazione del provider.
    const newest = !latestBefore || s.last.getTime() >= latestBefore.getTime();
    if (existing?.basis !== "billing_connector" && existing?.basis !== "manual" && newest) {
      const data = {
        monthlyCostEstimate: s.monthlyEur,
        basis: s.source,
        confidence: "HIGH",
        planId: s.planId,
        seats: s.seats,
        annualBilling: s.annual,
        notes: `${s.count} charge${s.count === 1 ? "" : "s"} from ${s.first.toISOString().slice(0, 10)} to ${s.last.toISOString().slice(0, 10)}${s.seatsDeclared ? ` · ${s.seats} seats on the invoice` : ""}${s.planName ? ` · looks like ${s.seats && s.seats > 1 ? `${s.seats} × ` : ""}${s.planName}` : ""}`,
      };
      await db.aiSystemCost.upsert({ where: { aiAssetId: asset.id }, update: data, create: { aiAssetId: asset.id, ...data } });
    }
    result.push({ service: s.service, name: asset.name, monthlyEur: s.monthlyEur, created });
  }
  if (summary.length) await recordInventorySnapshot(organizationId);
  return result;
}

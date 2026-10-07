"use server";

/**
 * Editor degli abbonamenti inseriti a mano (CustomerSubscription, origin "manual").
 * Solo gli amministratori. Ogni salvataggio e cancellazione finisce nel registro di audit.
 *
 * Un abbonamento manuale sostituisce quello ricavato da AiSystemCost (che viene tolto);
 * cancellato il manuale, quello ricavato torna al prossimo giro del job giornaliero
 * (e intanto la pagina lo ricalcola al volo da AiSystemCost).
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { planByIdOf, productByIdOf, resolveSeatType } from "@/lib/pricing/service";
import { computeManual, SUBSCRIPTION_CURRENCIES, type ManualSubscriptionPayload } from "@/lib/pricing/manual";

const MAX_SEATS = 1_000_000;
const MAX_AMOUNT = 100_000_000;

const text = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
  return s || null;
};
const day = (v: unknown): Date | null | "bad" => {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return "bad";
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "bad" : d;
};
const amount = (v: unknown): number | null | "bad" => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= MAX_AMOUNT ? n : "bad";
};

/** Salva (crea o aggiorna) l'abbonamento manuale di un'AI. Ritorna { error } se i dati non vanno. */
export async function saveManualSubscriptionAction(p: ManualSubscriptionPayload): Promise<{ error: string } | void> {
  const assetId = typeof p?.assetId === "string" ? p.assetId : "";
  const back = `/assets/${encodeURIComponent(assetId)}`;
  const s = await requireRole("ADMIN", back);
  const asset = await db.aiAsset.findFirst({ where: { id: assetId, organizationId: s.orgId, deletedAt: null }, select: { id: true, name: true } });
  if (!asset) return { error: "That AI isn't in this workspace." };

  // Prodotto e piano: dal catalogo, oppure "Other" con un nome libero.
  const plan = p.planId ? planByIdOf(p.planId) : null;
  if (p.planId && !plan) return { error: "That plan isn't in the angar price list." };
  const product = productByIdOf(plan?.productId ?? p.productId);
  if (p.productId && !product) return { error: "That product isn't in the angar price list." };
  if (plan && p.productId && plan.productId !== p.productId) return { error: "The plan doesn't belong to that product." };
  const productName = product ? null : text(p.productName, 120);
  const planName = plan ? null : text(p.planName, 120);
  if (!product && !productName) return { error: "Pick a product or type its name." };

  const cycle = p.cycle === "annual" ? "annual" : p.cycle === "monthly" ? "monthly" : null;
  if (!cycle) return { error: "Pick monthly or annual billing." };
  const currency = SUBSCRIPTION_CURRENCIES.find((c) => c === p.currency);
  if (!currency) return { error: "Pick a currency from the list." };
  const contractPeriod = p.contractPeriod === "year" ? "year" : "month";
  const billedPeriod = p.billedPeriod === "year" ? "year" : p.billedPeriod === "quarter" ? "quarter" : "month";

  const contractStart = day(p.contractStart);
  const renewalDate = day(p.renewalDate);
  if (contractStart === "bad" || renewalDate === "bad") return { error: "Dates must be valid days." };
  if (contractStart && renewalDate && renewalDate.getTime() <= contractStart.getTime()) return { error: "The renewal date must come after the contract start." };

  const billedAmount = amount(p.billedAmount);
  if (billedAmount === "bad") return { error: "The billed amount must be a number of 0 or more." };
  const mode = p.priceMode === "lines" || p.priceMode === "total" ? p.priceMode : "none";
  const contractTotal = mode === "total" ? amount(p.contractTotal) : null;
  if (contractTotal === "bad") return { error: "The contract total must be a number of 0 or more." };
  if (mode === "total" && contractTotal == null) return { error: "Type the contract total, or choose another price option." };

  // Righe di posti: almeno una, tipi del piano scelto, niente doppioni.
  if (!Array.isArray(p.lines) || p.lines.length === 0) return { error: "Add at least one seat line." };
  if (p.lines.length > 20) return { error: "Up to 20 seat lines." };
  const seen = new Set<string>();
  const lines: { seatTypeId: string | null; label: string | null; paidSeats: number; activeSeats: number | null; contractUnit: number | null }[] = [];
  for (const [i, l] of p.lines.entries()) {
    const n = i + 1;
    let seatTypeId: string | null = null;
    if (l?.seatTypeId) {
      const st = resolveSeatType(l.seatTypeId);
      if (!st || st.id !== l.seatTypeId) return { error: `Seat line ${n}: that seat type isn't in the angar price list.` };
      if (plan && st.planId !== plan.id) return { error: `Seat line ${n}: that seat type isn't part of ${plan.name}.` };
      if (seen.has(st.id)) return { error: `Seat line ${n}: that seat type is already on another line.` };
      seen.add(st.id);
      seatTypeId = st.id;
    }
    const label = seatTypeId ? null : text(l?.label, 80);
    if (!seatTypeId && !label) return { error: `Seat line ${n}: pick a seat type or type its name.` };
    const paid = Number(l?.paidSeats);
    if (!Number.isInteger(paid) || paid < 1 || paid > MAX_SEATS) return { error: `Seat line ${n}: paid seats must be a whole number of 1 or more.` };
    let active: number | null = null;
    if (l?.activeSeats != null && String(l.activeSeats) !== "") {
      active = Number(l.activeSeats);
      if (!Number.isInteger(active) || active < 0) return { error: `Seat line ${n}: active seats must be a whole number of 0 or more.` };
      if (active > paid) return { error: `Seat line ${n}: active seats can't be more than paid seats.` };
    }
    const unit = mode === "lines" ? amount(l?.contractUnit) : null;
    if (unit === "bad") return { error: `Seat line ${n}: the contract price must be a number of 0 or more.` };
    lines.push({ seatTypeId, label, paidSeats: paid, activeSeats: active, contractUnit: unit });
  }
  if (mode === "lines" && lines.every((l) => l.contractUnit == null)) return { error: "Type a contract price on at least one seat line, or choose another price option." };

  const r = computeManual({ productId: product?.id ?? null, planId: plan?.id ?? null, productName, planName, cycle, currency, contractPeriod, contractTotal, billedAmount, billedPeriod: billedAmount != null ? billedPeriod : null, lines });

  // Chi l'ha inserito: il nome dell'account, altrimenti l'email.
  const account = await db.account.findUnique({ where: { id: s.accountId }, select: { name: true } }).catch(() => null);
  const byName = account?.name?.trim() || s.name?.trim() || s.email;
  const now = new Date();

  const data = {
    organizationId: s.orgId,
    aiAssetId: asset.id,
    providerId: r.providerId,
    productId: r.productId,
    planId: r.planId,
    productName,
    planName,
    billingModel: r.billingModel,
    billingCycle: cycle,
    contractStart,
    renewalDate,
    currency,
    listMonthly: r.listMonthly,
    contractMonthly: r.contractMonthly,
    discountPct: r.discountPct,
    actualMonthly: r.actualMonthly,
    contractPeriod: mode === "none" ? null : contractPeriod,
    billedAmount,
    billedPeriod: billedAmount != null ? billedPeriod : null,
    note: text(p.note, 1000),
    source: "manual",
    // Stessa scala maiuscola del resto della tabella ("HIGH" | "MEDIUM" | "LOW").
    confidence: "HIGH",
    origin: "manual",
    enteredByName: byName,
    enteredByEmail: s.email,
    enteredAt: now,
    effectiveUntil: null,
  };
  const seatLines = r.lines.map((l) => ({
    seatTypeId: l.seatTypeId,
    label: l.label,
    paidSeats: l.paidSeats,
    activeSeats: l.activeSeats,
    unitListPrice: l.list?.price ?? null,
    unitContractPrice: l.contractUnitMonthly,
    currency: l.list?.currency ?? currency,
  }));

  const existing = await db.customerSubscription.findFirst({ where: { organizationId: s.orgId, aiAssetId: asset.id, origin: "manual" }, select: { id: true } });
  await db.$transaction(async (tx) => {
    // Quello ricavato da AiSystemCost non serve più: il manuale vince (il job non lo ricrea).
    await tx.customerSubscription.deleteMany({ where: { organizationId: s.orgId, aiAssetId: asset.id, origin: "derived" } });
    if (existing) await tx.customerSubscription.update({ where: { id: existing.id }, data: { ...data, seatLines: { deleteMany: {}, create: seatLines } } });
    else await tx.customerSubscription.create({ data: { ...data, seatLines: { create: seatLines } } });
  });

  await audit(existing ? "subscription.manual_updated" : "subscription.manual_created", asset.name, {
    assetId: asset.id,
    product: product?.name ?? productName,
    plan: plan?.name ?? planName,
    cycle,
    currency,
    seats: r.lines.map((l) => ({ type: l.label, paid: l.paidSeats, active: l.activeSeats, contractMonthly: l.contractUnitMonthly })),
    contractMonthly: r.contractMonthly,
    actualMonthly: r.actualMonthly,
    renewalDate: renewalDate?.toISOString().slice(0, 10) ?? null,
  });
  revalidatePath("/", "layout");
  redirect(back);
}

/** Cancella l'abbonamento manuale: quello ricavato torna al prossimo giro del job. */
export async function deleteManualSubscriptionAction(assetId: string): Promise<{ error: string } | void> {
  const id = typeof assetId === "string" ? assetId : "";
  const back = `/assets/${encodeURIComponent(id)}`;
  const s = await requireRole("ADMIN", back);
  const asset = await db.aiAsset.findFirst({ where: { id, organizationId: s.orgId }, select: { id: true, name: true } });
  if (!asset) return { error: "That AI isn't in this workspace." };
  const res = await db.customerSubscription.deleteMany({ where: { organizationId: s.orgId, aiAssetId: asset.id, origin: "manual" } });
  if (res.count) await audit("subscription.manual_deleted", asset.name, { assetId: asset.id });
  revalidatePath("/", "layout");
  redirect(back);
}

/**
 * Livello del cliente: abbonamenti AI normalizzati (CustomerSubscription + righe di posti).
 *
 * Da dove vengono:
 * - "derived": ricavati da AiSystemCost (piano riconosciuto, posti, fatturazione annuale,
 *   costo reale e sua fonte, contratto) e dal catalogo prezzi. Ricalcolati dal job giornaliero.
 * - "manual": inseriti a mano o da contratto, con più tipi di posto nello stesso abbonamento.
 *   Il job non li tocca mai.
 *
 * Listino, prezzo di contratto e importo fatturato restano campi distinti: mai uno al posto dell'altro.
 */
import type { PrismaClient } from "@prisma/client";
import { ACTUAL_BASIS, estimateSeatCost, getPrice, planOf, productOf, resolveSeatType, seatTypeLabel } from "./service";
import { countActive } from "@/lib/seats";
import { currentTermEnd } from "@/lib/contracts";

export interface DerivedSeatLine {
  seatTypeId: string | null;
  label: string;
  paidSeats: number;
  activeSeats: number | null;
  unitListPrice: number | null;
  currency: string;
}

export interface DerivedSubscription {
  providerId: string | null;
  productId: string | null;
  planId: string | null;
  billingModel: string;
  billingCycle: "monthly" | "annual" | "usage" | null;
  contractStart: Date | null;
  renewalDate: Date | null;
  currency: "EUR";
  listMonthly: number | null;
  actualMonthly: number | null;
  source: string;
  confidence: string;
  seatLines: DerivedSeatLine[];
}

export interface SubscriptionSourceAsset {
  type: string;
  cost: {
    monthlyCostEstimate: number | null;
    basis: string;
    confidence: string;
    planId: string | null;
    seats: number | null;
    annualBilling: boolean;
    contractStart: Date | null;
    contractEnd: Date | null;
    noticeDays: number | null;
    autoRenew: boolean | null;
  } | null;
  usages: readonly { lastSeenAt: Date | null }[];
}

/** Abbonamento normalizzato ricavato da un'AI (null se non c'è niente da normalizzare). Puro. */
export function deriveSubscription(a: SubscriptionSourceAsset, now = Date.now()): DerivedSubscription | null {
  const c = a.cost;
  if (!c) return null;
  const st = resolveSeatType(c.planId);
  const actual = c.monthlyCostEstimate != null && ACTUAL_BASIS.has(c.basis) ? c.monthlyCostEstimate : null;
  if (!st && actual == null && !c.seats) return null;
  const plan = st ? planOf(st) : null;
  const product = plan ? productOf(plan) : null;
  const cycle = c.annualBilling ? "annual" : st ? "monthly" : a.type === "AI_API" ? "usage" : null;
  const paid = c.seats && c.seats > 0 ? c.seats : st ? 1 : null;
  const active = a.usages.length ? countActive(a.usages, undefined, now) : null;
  const lines: DerivedSeatLine[] = [];
  let listMonthly: number | null = null;
  if (st && paid) {
    const fact = (cycle === "annual" ? getPrice(st.id, null, null, "seat_annual", new Date(now), { earliestIfBefore: true }) : null) ?? getPrice(st.id, null, null, "seat_monthly", new Date(now), { earliestIfBefore: true });
    lines.push({ seatTypeId: st.id, label: seatTypeLabel(st), paidSeats: paid, activeSeats: active, unitListPrice: fact?.price ?? null, currency: fact?.currency ?? "USD" });
    const e = estimateSeatCost([{ seatType: st.id, seats: paid, cycle: cycle === "annual" ? "annual" : "monthly" }], new Date(now));
    listMonthly = e.known ? Math.round(e.eur * 100) / 100 : null;
  } else if (paid) {
    lines.push({ seatTypeId: null, label: "Seats", paidSeats: paid, activeSeats: active, unitListPrice: null, currency: "EUR" });
  }
  return {
    providerId: product?.providerId ?? null,
    productId: product?.id ?? null,
    planId: plan?.id ?? null,
    billingModel: plan?.billingModel ?? (a.type === "AI_API" ? "TOKEN_BASED" : st || paid ? "SEAT_BASED" : "CUSTOM"),
    billingCycle: cycle,
    contractStart: c.contractStart,
    renewalDate: c.contractEnd ? currentTermEnd(c, now) : null,
    currency: "EUR",
    listMonthly,
    actualMonthly: actual,
    source: actual != null ? c.basis : "estimate",
    confidence: c.confidence,
    seatLines: lines,
  };
}

/** Ricalcola gli abbonamenti "derived" di un'azienda. Quelli "manual" restano come sono. */
export async function normaliseSubscriptions(orgId: string, client?: PrismaClient, now = new Date()): Promise<number> {
  const db = client ?? (await import("@/lib/db")).db;
  const assets = await db.aiAsset.findMany({
    where: { organizationId: orgId, deletedAt: null, cost: { isNot: null } },
    select: { id: true, type: true, cost: true, usages: { select: { lastSeenAt: true } }, subscriptions: { select: { id: true, origin: true } } },
  });
  let n = 0;
  for (const a of assets) {
    if (a.subscriptions.some((s) => s.origin === "manual")) continue;
    const d = deriveSubscription(a, now.getTime());
    const existing = a.subscriptions.find((s) => s.origin === "derived");
    if (!d) {
      if (existing) await db.customerSubscription.delete({ where: { id: existing.id } });
      continue;
    }
    const data = {
      organizationId: orgId,
      aiAssetId: a.id,
      providerId: d.providerId,
      productId: d.productId,
      planId: d.planId,
      billingModel: d.billingModel,
      billingCycle: d.billingCycle,
      contractStart: d.contractStart,
      renewalDate: d.renewalDate,
      currency: d.currency,
      listMonthly: d.listMonthly,
      actualMonthly: d.actualMonthly,
      source: d.source,
      confidence: d.confidence,
      origin: "derived",
    };
    const lines = d.seatLines.map((l) => ({ seatTypeId: l.seatTypeId, label: l.label, paidSeats: l.paidSeats, activeSeats: l.activeSeats, unitListPrice: l.unitListPrice, currency: l.currency }));
    if (existing) {
      await db.customerSubscription.update({ where: { id: existing.id }, data: { ...data, seatLines: { deleteMany: {}, create: lines } } });
    } else {
      await db.customerSubscription.create({ data: { ...data, seatLines: { create: lines } } });
    }
    n++;
  }
  return n;
}

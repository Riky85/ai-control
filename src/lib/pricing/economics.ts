/**
 * Blocco "Economics" del passaporto di un'AI: modello di fatturazione, piano, posti per tipo,
 * costo dell'abbonamento e dei consumi, reale vs stimato con lo scarto, costo unitario
 * effettivo, rinnovo, confidenza e provenienza dei prezzi.
 *
 * Puro (riceve i dati già letti): nessun numero inventato. Quello che non si sa resta null
 * e in pagina diventa UNKNOWN.
 */
import { actualVsEstimated, getPrice, provenanceLine, resolveModel, BILLING_MODEL_LABEL, fmtMoney, type ActualVsEstimated, type PriceFact } from "./service";
import { deriveSubscription, type SubscriptionSourceAsset } from "./subscriptions";
import { countActive } from "@/lib/seats";
import type { BillingModel } from "./catalog-data";
import { planByIdOf } from "./service";
import { manualSourceLabel, seatListPrice, convert, type SeatListPrice } from "./manual";
import { discountPct } from "./discount";

const DAY = 86_400_000;

export interface EconomicsInput extends SubscriptionSourceAsset {
  id: string;
  name: string;
  serviceId: string | null;
  model: string | null;
  /** Abbonamento salvato (CustomerSubscription), se c'è: vince su quello ricavato da AiSystemCost. */
  subscription?: {
    planId: string | null;
    billingModel: string;
    billingCycle: string | null;
    renewalDate: Date | null;
    actualMonthly: number | null;
    contractMonthly: number | null;
    currency: string;
    source: string;
    confidence: string;
    seatLines: { seatTypeId: string | null; label: string; paidSeats: number; activeSeats: number | null; unitContractPrice?: number | null }[];
    /** "manual" = inserito a mano (vince sempre su quello ricavato). */
    origin?: string;
    productName?: string | null;
    planName?: string | null;
    note?: string | null;
    billedAmount?: number | null;
    billedPeriod?: string | null;
    contractStart?: Date | null;
    enteredByName?: string | null;
    enteredByEmail?: string | null;
    enteredAt?: Date | null;
  } | null;
  /** Addebiti dell'AI (più recenti prima). */
  spend: { source: string; date: Date; amountEur: number }[];
}

export interface Economics {
  billingModel: string | null;
  billingModelLabel: string | null;
  planName: string | null;
  cycle: string | null;
  seatLines: {
    label: string;
    paid: number;
    active: number | null;
    /** true se "active" viene dagli utilizzi osservati (non inserito a mano). */
    observed: boolean;
    /** Listino del tipo di posto (catalogo), con provenienza; null = non in catalogo. */
    list: SeatListPrice | null;
    /** Prezzo di contratto di un posto al mese, nella valuta dell'abbonamento (solo abbonamenti manuali). */
    contractUnit: number | null;
    /** Sconto sul listino; null = UNKNOWN (manca il listino o il prezzo di contratto). */
    discountPct: number | null;
  }[];
  /** Persone attive negli ultimi 30 giorni (utilizzi osservati); null = nessun dato. */
  observedActive: number | null;
  /** Abbonamento inserito a mano: chi, quando, contratto, fatturato, sconto. */
  manual: {
    sourceLabel: string;
    currency: string;
    contractMonthly: number | null;
    listMonthly: number | null;
    discountPct: number | null;
    billed: { amount: number; period: string } | null;
    contractStart: Date | null;
    note: string | null;
  } | null;
  /** Parte a posti (al mese, EUR) e da dove viene. */
  subscriptionCost: { eur: number; estimated: boolean; note: string } | null;
  /** Parte a consumo (al mese, EUR) e da dove viene. */
  usageCost: { eur: number; estimated: boolean; note: string } | null;
  ave: ActualVsEstimated;
  /** Costo unitario effettivo: reale ÷ posti pagati (o stimato ÷ posti se non c'è il reale). */
  unitCost: { eur: number; unit: string; estimated: boolean } | null;
  contractMonthly: number | null;
  renewal: { date: Date; inferred: boolean } | null;
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  /** Righe di provenienza: "List price · OpenAI official pricing · verified 7 Oct 2026". */
  provenance: { line: string; url: string | null }[];
  /** Prezzo a token del modello (API), se il modello è nel catalogo. */
  modelPrice: { name: string; input: PriceFact | null; output: PriceFact | null; lifecycle: string; retiresAt: Date | null; replacement: string | null } | null;
}

const RANK = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
const minConf = (list: string[]): Economics["confidence"] => {
  const v = list.filter((c): c is keyof typeof RANK => c in RANK);
  if (!v.length) return null;
  return v.reduce((a, b) => (RANK[b] < RANK[a] ? b : a));
};

export function buildEconomics(a: EconomicsInput, now = Date.now()): Economics {
  const derived = deriveSubscription(a, now);
  const sub = a.subscription ?? null;
  const planId = sub?.planId ?? derived?.planId ?? null;
  const plan = planByIdOf(planId);
  const isManual = sub?.origin === "manual";
  const sourceLabel = isManual ? manualSourceLabel(sub!.enteredByName ?? sub!.enteredByEmail, sub!.enteredAt) : null;
  const billingModel = (sub?.billingModel ?? derived?.billingModel ?? (a.type === "AI_API" ? "TOKEN_BASED" : null)) as BillingModel | null;
  const cycle = sub?.billingCycle ?? derived?.billingCycle ?? null;
  const active = a.usages.length ? countActive(a.usages, undefined, now) : null;
  // Righe di posti: quelle salvate (manuali prima di tutto) vincono su quelle ricavate da AiSystemCost.
  // Posti attivi non inseriti: dagli utilizzi osservati, ma solo se la riga è una (non si sa come dividerli).
  const listOf = (id: string | null) => (id ? seatListPrice(id, cycle, new Date(now)) : null);
  const seatLines: Economics["seatLines"] = sub?.seatLines.length
    ? sub.seatLines.map((l, _i, all) => {
        const list = listOf(l.seatTypeId);
        const contractUnit = l.unitContractPrice ?? null;
        const listInCur = list ? convert(list.price, list.currency, sub.currency) : null;
        const fromUsage = l.activeSeats == null && all.length === 1 ? active : null;
        return { label: l.label, paid: l.paidSeats, active: l.activeSeats ?? fromUsage, observed: l.activeSeats == null && fromUsage != null, list, contractUnit, discountPct: discountPct(listInCur, contractUnit) };
      })
    : (derived?.seatLines ?? []).map((l) => ({ label: l.label, paid: l.paidSeats, active: l.activeSeats ?? active, observed: true, list: listOf(l.seatTypeId), contractUnit: null, discountPct: null }));
  // Listino totale nella valuta dell'abbonamento: solo se TUTTE le righe hanno un listino.
  const listMonthly =
    isManual && seatLines.length && seatLines.every((l) => l.list)
      ? seatLines.reduce((t, l) => {
          const v = convert(l.list!.price, l.list!.currency, sub!.currency);
          return t == null || v == null ? null : t + v * l.paid;
        }, 0 as number | null)
      : null;

  // Spesa a consumo degli ultimi 30 giorni: reale (billing cloud) e stimata (Gateway, token × listino).
  const since = now - 30 * DAY;
  const recent = a.spend.filter((s) => s.date.getTime() >= since);
  const cloud = recent.filter((s) => s.source === "cloud").reduce((t, s) => t + s.amountEur, 0);
  const gateway = recent.filter((s) => s.source === "gateway").reduce((t, s) => t + s.amountEur, 0);

  const ave = actualVsEstimated(
    {
      id: a.id,
      name: a.name,
      type: a.type,
      serviceId: a.serviceId,
      model: a.model,
      cost: a.cost,
      users: a.usages.length,
      subscription: sub
        ? { actualMonthly: sub.actualMonthly, currency: sub.currency, source: sub.source, billingCycle: sub.billingCycle, seatLines: sub.seatLines, origin: sub.origin, contractMonthly: sub.contractMonthly, sourceLabel }
        : null,
      gatewayEstimateEur: gateway > 0 ? gateway : null,
    },
    new Date(now),
  );

  // Un abbonamento manuale con righe di posti è a posti anche se il piano è "CUSTOM" (es. Enterprise).
  const seatBased = billingModel === "SEAT_BASED" || billingModel === "HYBRID" || billingModel === "CREDIT_BASED" || (isManual && seatLines.length > 0);
  const usageBased = billingModel === "TOKEN_BASED" || billingModel === "USAGE_BASED" || a.type === "AI_API";
  const subscriptionCost = seatBased
    ? ave.actual && billingModel !== "HYBRID"
      ? { eur: ave.actual.eur, estimated: false, note: ave.actual.source }
      : ave.estimated && ave.sources.some((s) => s.kind === "seat_monthly" || s.kind === "seat_annual")
        ? { eur: ave.estimated.eur, estimated: true, note: "Seats × list price" }
        : null
    : null;
  const usageCost = usageBased
    ? cloud > 0
      ? { eur: cloud, estimated: false, note: "Cloud billing, last 30 days" }
      : ave.actual
        ? { eur: ave.actual.eur, estimated: false, note: ave.actual.source }
        : gateway > 0
          ? { eur: gateway, estimated: true, note: "angar Gateway tokens × list price, last 30 days" }
          : null
    : null;

  const paid = seatLines.reduce((t, l) => t + l.paid, 0);
  const unitCost = paid > 0 && (ave.actual || ave.estimated) ? { eur: (ave.actual ?? ave.estimated)!.eur / paid, unit: "seat", estimated: !ave.actual } : null;

  const manual: Economics["manual"] = isManual
    ? {
        sourceLabel: sourceLabel!,
        currency: sub!.currency,
        contractMonthly: sub!.contractMonthly,
        listMonthly,
        discountPct: discountPct(listMonthly, sub!.contractMonthly),
        billed: sub!.billedAmount != null ? { amount: sub!.billedAmount, period: sub!.billedPeriod ?? "month" } : null,
        contractStart: sub!.contractStart ?? null,
        note: sub!.note ?? null,
      }
    : null;

  // Rinnovo: dal contratto registrato, altrimenti dall'ultimo addebito (+1 mese / +12 mesi).
  let renewal: Economics["renewal"] = null;
  if (sub?.renewalDate) renewal = { date: sub.renewalDate, inferred: false };
  else if (derived?.renewalDate) renewal = { date: derived.renewalDate, inferred: false };
  else {
    const last = a.spend.find((s) => s.source === "bank" || s.source === "invoice" || s.source === "check");
    if (last) {
      const annual = Boolean(a.cost?.annualBilling);
      const next = new Date(last.date);
      next.setUTCMonth(next.getUTCMonth() + (annual ? 12 : 1));
      while (next.getTime() < now - DAY) next.setUTCMonth(next.getUTCMonth() + (annual ? 12 : 1));
      if (next.getTime() - last.date.getTime() < (annual ? 800 : 70) * DAY) renewal = { date: next, inferred: true };
    }
  }

  // Prezzo del modello (API) e provenienza.
  const r = a.model && !a.model.includes(",") ? resolveModel(a.model) : null;
  const modelPrice = r
    ? {
        name: r.model.name,
        input: getPrice(r.model.id, null, null, "input", new Date(now)),
        output: getPrice(r.model.id, null, null, "output", new Date(now)),
        lifecycle: r.model.lifecycle,
        retiresAt: r.model.retiresAt,
        replacement: r.model.replacementId,
      }
    : null;
  const facts = [...ave.sources, ...(modelPrice?.input ? [modelPrice.input] : [])];
  const seen = new Set<string>();
  const provenance: Economics["provenance"] = [];
  for (const f of facts) {
    const line = provenanceLine(f);
    if (seen.has(line)) continue;
    seen.add(line);
    provenance.push({ line, url: f.provenance.sourceUrl });
  }

  const confidence = ave.actual ? minConf([ave.actual.confidence]) : ave.estimated ? minConf(ave.sources.map((s) => s.provenance.confidence)) ?? "LOW" : null;

  return {
    billingModel,
    billingModelLabel: billingModel ? BILLING_MODEL_LABEL[billingModel] ?? billingModel : null,
    planName: plan?.name ?? (isManual ? [sub!.productName, sub!.planName].filter(Boolean).join(" · ") || null : null),
    cycle,
    seatLines,
    observedActive: active,
    manual,
    subscriptionCost,
    usageCost,
    ave,
    unitCost,
    contractMonthly: sub?.contractMonthly ?? null,
    renewal,
    confidence,
    provenance,
    modelPrice,
  };
}

/** "Input $2.50 / 1M tokens" */
export const tokenPriceText = (label: string, f: PriceFact | null) => (f ? `${label} ${fmtMoney(f.price, f.currency)} / 1M tokens` : `${label} UNKNOWN`);

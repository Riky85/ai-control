/**
 * Abbonamenti inseriti a mano (CustomerSubscription con origin "manual").
 *
 * Qui solo calcoli puri, senza database:
 * - listino di ogni riga di posti dal catalogo, con la sua provenienza;
 * - prezzo di contratto mensile (per riga o totale) e sconto sul listino;
 * - importo fatturato riportato al mese;
 * - prezzo effettivo di un posto e risparmio dai posti inutilizzati, con la base di calcolo.
 *
 * Regole: listino, contratto e fatturato restano distinti. Un listino che il catalogo non ha
 * resta null (in pagina: UNKNOWN), mai stimato; idem lo sconto.
 */
import { catalog, fmtDay, fmtMoney, getPrice, planByIdOf, productByIdOf, providerNameOf, resolveSeatType, seatTypeLabel, SOURCE_LABEL, type PriceFact } from "./service";
import { toEur } from "@/lib/spend/fx";
import { discountPct, toMonthly } from "./discount";

/** Valute accettate nell'editor (tutte convertibili in EUR da spend/fx.ts). */
export const SUBSCRIPTION_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON"] as const;

export type Cycle = "monthly" | "annual";

/** Importo da una valuta a un'altra passando dall'EUR. null se una delle due non è convertibile. */
export function convert(amount: number, from: string, to: string): number | null {
  if (from.toUpperCase() === to.toUpperCase()) return amount;
  const a = toEur(amount, from);
  const u = toEur(1, to);
  if (!a.convertible || !u.convertible || u.eur <= 0) return null;
  return a.eur / u.eur;
}

// ───────────────────────── listino di una riga ─────────────────────────

export interface SeatListPrice {
  /** Prezzo di listino di un posto al mese, nella valuta del listino. */
  price: number;
  currency: string;
  eur: number;
  /** "seat_annual" = prezzo mensile con fatturazione annuale. */
  kind: PriceFact["kind"];
  /** "List: $20 a month, billed yearly · OpenAI official · verified 7 Oct 2026" */
  text: string;
  url: string | null;
}

const whoOf = (f: PriceFact) =>
  f.provenance.sourceType === "angar_estimate" ? "angar estimate" : f.provenance.sourceType === "official" ? `${f.publisher} official` : `${f.publisher} ${SOURCE_LABEL[f.provenance.sourceType]}`;

/** Listino di un tipo di posto per il ciclo scelto (annuale → prezzo annuale, se il catalogo lo ha). */
export function seatListPrice(seatTypeId: string | null | undefined, cycle: string | null | undefined, at: Date = new Date()): SeatListPrice | null {
  const st = resolveSeatType(seatTypeId);
  if (!st) return null;
  const annual = cycle === "annual" ? getPrice(st.id, null, null, "seat_annual", at, { earliestIfBefore: true }) : null;
  const f = annual ?? getPrice(st.id, null, null, "seat_monthly", at, { earliestIfBefore: true });
  if (!f) return null;
  const billed = f.kind === "seat_annual" ? "billed yearly" : cycle === "annual" ? "billed monthly (no yearly price listed)" : "billed monthly";
  return {
    price: f.price,
    currency: f.currency,
    eur: toEur(f.price, f.currency).eur,
    kind: f.kind,
    text: `List: ${fmtMoney(f.price, f.currency)} a month, ${billed} · ${whoOf(f)} · verified ${fmtDay(f.provenance.lastVerifiedAt)}`,
    url: f.provenance.sourceUrl,
  };
}

// ───────────────────────── opzioni del catalogo per l'editor ─────────────────────────

export interface CatalogSeatOption {
  id: string;
  name: string;
  label: string;
  monthly: SeatListPrice | null;
  annual: SeatListPrice | null;
}
export interface CatalogPlanOption {
  id: string;
  name: string;
  billingModel: string;
  retired: boolean;
  seatTypes: CatalogSeatOption[];
}
export interface CatalogProductOption {
  id: string;
  name: string;
  provider: string;
  plans: CatalogPlanOption[];
}

/** Prodotti, piani e tipi di posto del catalogo con il listino di oggi (dati serializzabili per il form). */
export function catalogOptions(at: Date = new Date()): CatalogProductOption[] {
  const cat = catalog();
  const out: CatalogProductOption[] = [];
  for (const p of cat.products) {
    const plans: CatalogPlanOption[] = [];
    for (const pl of cat.plans.filter((x) => x.productId === p.id)) {
      const seats = cat.seatTypes.filter((s) => s.planId === pl.id);
      if (!seats.length) continue;
      plans.push({
        id: pl.id,
        name: pl.name,
        billingModel: pl.billingModel,
        retired: pl.status !== "active",
        seatTypes: seats.map((s) => ({ id: s.id, name: s.name, label: seatTypeLabel(s), monthly: seatListPrice(s.id, "monthly", at), annual: seatListPrice(s.id, "annual", at) })),
      });
    }
    if (plans.length) out.push({ id: p.id, name: p.name, provider: providerNameOf(p.providerId), plans });
  }
  return out.sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
}

// ───────────────────────── dati inviati dall'editor ─────────────────────────

/** Quello che l'editor invia al server (mai fidarsi: l'azione ricontrolla tutto). */
export interface ManualSubscriptionPayload {
  assetId: string;
  /** null = "Other" (nome libero in productName). */
  productId: string | null;
  planId: string | null;
  productName: string | null;
  planName: string | null;
  cycle: Cycle;
  /** AAAA-MM-GG */
  contractStart: string | null;
  renewalDate: string | null;
  currency: string;
  /** Come sono espressi i prezzi di contratto. */
  contractPeriod: "month" | "year";
  priceMode: "none" | "lines" | "total";
  contractTotal: number | null;
  billedAmount: number | null;
  billedPeriod: "month" | "quarter" | "year";
  note: string | null;
  lines: { seatTypeId: string | null; label: string | null; paidSeats: number; activeSeats: number | null; contractUnit: number | null }[];
}

// ───────────────────────── calcolo dell'abbonamento ─────────────────────────

export interface ManualLineInput {
  seatTypeId: string | null;
  /** Nome della riga se fuori catalogo ("Other"). */
  label: string | null;
  paidSeats: number;
  /** null = dagli utilizzi osservati. */
  activeSeats: number | null;
  /** Prezzo di contratto di un posto, nel periodo `contractPeriod` e nella valuta dell'abbonamento. */
  contractUnit: number | null;
}

export interface ManualInput {
  productId: string | null;
  planId: string | null;
  productName: string | null;
  planName: string | null;
  cycle: Cycle;
  currency: string;
  contractPeriod: "month" | "year";
  /** Prezzo di contratto totale (alternativa ai prezzi per riga), nel periodo `contractPeriod`. */
  contractTotal: number | null;
  billedAmount: number | null;
  billedPeriod: "month" | "quarter" | "year" | null;
  lines: ManualLineInput[];
}

export interface ManualLineResult {
  seatTypeId: string | null;
  label: string;
  paidSeats: number;
  activeSeats: number | null;
  list: SeatListPrice | null;
  /** Listino di un posto al mese, convertito nella valuta dell'abbonamento. */
  listUnitInCurrency: number | null;
  /** Prezzo di contratto di un posto al mese, nella valuta dell'abbonamento. */
  contractUnitMonthly: number | null;
  discountPct: number | null;
}

export interface ManualResult {
  providerId: string | null;
  productId: string | null;
  planId: string | null;
  billingModel: string;
  lines: ManualLineResult[];
  /** Importi MENSILI nella valuta dell'abbonamento; null = non noto. */
  listMonthly: number | null;
  contractMonthly: number | null;
  actualMonthly: number | null;
  discountPct: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Listino, contratto, fatturato e sconto di un abbonamento inserito a mano. Puro. */
export function computeManual(input: ManualInput, at: Date = new Date()): ManualResult {
  const plan = planByIdOf(input.planId);
  const product = productByIdOf(plan?.productId ?? input.productId);
  const cur = input.currency;
  const lines: ManualLineResult[] = input.lines.map((l) => {
    const st = resolveSeatType(l.seatTypeId);
    const list = st ? seatListPrice(st.id, input.cycle, at) : null;
    const listUnitInCurrency = list ? convert(list.price, list.currency, cur) : null;
    const contractUnitMonthly = l.contractUnit != null ? toMonthly(l.contractUnit, input.contractPeriod) : null;
    return {
      seatTypeId: st?.id ?? null,
      label: st ? seatTypeLabel(st) : l.label?.trim() || "Seats",
      paidSeats: l.paidSeats,
      activeSeats: l.activeSeats,
      list,
      listUnitInCurrency: listUnitInCurrency != null ? r2(listUnitInCurrency) : null,
      contractUnitMonthly,
      discountPct: discountPct(listUnitInCurrency, contractUnitMonthly),
    };
  });
  const allListed = lines.length > 0 && lines.every((l) => l.listUnitInCurrency != null);
  const listMonthly = allListed ? r2(lines.reduce((t, l) => t + l.listUnitInCurrency! * l.paidSeats, 0)) : null;
  // Contratto: il totale vince; altrimenti la somma delle righe, solo se TUTTE hanno un prezzo.
  const allPriced = lines.length > 0 && lines.every((l) => l.contractUnitMonthly != null);
  const contractMonthly =
    input.contractTotal != null ? r2(toMonthly(input.contractTotal, input.contractPeriod)) : allPriced ? r2(lines.reduce((t, l) => t + l.contractUnitMonthly! * l.paidSeats, 0)) : null;
  const actualMonthly = input.billedAmount != null ? r2(toMonthly(input.billedAmount, input.billedPeriod)) : null;
  return {
    providerId: product?.providerId ?? null,
    productId: product?.id ?? null,
    planId: plan?.id ?? null,
    billingModel: plan?.billingModel ?? product?.billingModel ?? "SEAT_BASED",
    lines,
    listMonthly,
    contractMonthly,
    actualMonthly,
    discountPct: discountPct(listMonthly, contractMonthly),
  };
}

// ───────────────────────── etichetta della fonte ─────────────────────────

/** "Manual · entered by Giulia Rossi on 7 Oct 2026" */
export const manualSourceLabel = (by: string | null | undefined, at: Date | null | undefined) =>
  `Manual · entered by ${by?.trim() || "an admin"}${at ? ` on ${fmtDay(at)}` : ""}`;

// ───────────────────────── prezzo effettivo e posti inutilizzati ─────────────────────────

export interface SubscriptionForSavings {
  currency: string;
  billingCycle: string | null;
  contractMonthly: number | null;
  actualMonthly: number | null;
  seatLines: { seatTypeId: string | null; label: string; paidSeats: number; activeSeats: number | null; unitContractPrice: number | null }[];
}

export type UnitBasis = "contract price" | "contract total" | "billed amount" | "list price";

export interface EffectiveUnit {
  eur: number;
  basis: UnitBasis;
}

/**
 * Prezzo effettivo di un posto al mese (EUR) per ogni riga, nell'ordine:
 * prezzo di contratto della riga → totale di contratto ripartito → importo fatturato ripartito → listino.
 * La ripartizione di un totale segue il listino delle righe (se noto per tutte), altrimenti è uniforme.
 */
export function effectiveUnits(sub: SubscriptionForSavings, at: Date = new Date()): (EffectiveUnit | null)[] {
  const lists = sub.seatLines.map((l) => seatListPrice(l.seatTypeId, sub.billingCycle, at));
  const paidTotal = sub.seatLines.reduce((t, l) => t + l.paidSeats, 0);
  const listWeight = lists.every((x) => x) ? sub.seatLines.reduce((t, l, i) => t + lists[i]!.eur * l.paidSeats, 0) : 0;
  const share = (totalEur: number, i: number) => (listWeight > 0 ? (totalEur * lists[i]!.eur) / listWeight : paidTotal > 0 ? totalEur / paidTotal : null);
  return sub.seatLines.map((l, i) => {
    if (l.unitContractPrice != null) return { eur: toEur(l.unitContractPrice, sub.currency).eur, basis: "contract price" };
    if (sub.contractMonthly != null) {
      const v = share(toEur(sub.contractMonthly, sub.currency).eur, i);
      if (v != null) return { eur: v, basis: "contract total" };
    }
    if (sub.actualMonthly != null) {
      const v = share(toEur(sub.actualMonthly, sub.currency).eur, i);
      if (v != null) return { eur: v, basis: "billed amount" };
    }
    if (lists[i]) return { eur: lists[i]!.eur, basis: "list price" };
    return null;
  });
}

export interface SeatSavings {
  idle: number;
  active: number;
  paid: number;
  monthlyEur: number;
  /** "4 idle × ChatGPT Business · Premium at €86 a month each (contract price)" */
  basis: string;
}

const eurText = (n: number) => "€" + (Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Posti pagati e non usati di un abbonamento con righe di posti, valorizzati al prezzo effettivo.
 * Righe con i posti attivi inseriti: calcolo per riga. Righe senza: si usano gli utenti attivi
 * osservati (quelli non già attribuiti), e i posti inutilizzati si valorizzano al tipo di posto
 * più economico (stima prudente: non si sa quale tipo si libera). null se non c'è niente da togliere
 * o non si sa quanti sono attivi.
 */
export function seatSavings(sub: SubscriptionForSavings, observedActive: number | null, at: Date = new Date()): SeatSavings | null {
  const units = effectiveUnits(sub, at);
  const known = sub.seatLines.map((l, i) => ({ l, u: units[i] })).filter((x) => x.l.activeSeats != null);
  const unknown = sub.seatLines.map((l, i) => ({ l, u: units[i] })).filter((x) => x.l.activeSeats == null);
  const parts: string[] = [];
  let idle = 0;
  let eur = 0;
  let active = 0;
  for (const { l, u } of known) {
    active += Math.min(l.activeSeats!, l.paidSeats);
    const n = Math.max(0, l.paidSeats - l.activeSeats!);
    if (!n) continue;
    idle += n;
    if (u) {
      eur += n * u.eur;
      parts.push(`${n} idle × ${l.label} at ${eurText(u.eur)} a month each (${u.basis})`);
    } else parts.push(`${n} idle × ${l.label} (price UNKNOWN)`);
  }
  if (unknown.length) {
    if (observedActive == null) {
      if (!known.length) return null;
    } else {
      const poolPaid = unknown.reduce((t, x) => t + x.l.paidSeats, 0);
      const poolActive = Math.min(poolPaid, Math.max(0, observedActive - known.reduce((t, x) => t + x.l.activeSeats!, 0)));
      active += poolActive;
      const n = poolPaid - poolActive;
      if (n > 0) {
        idle += n;
        const priced = unknown.filter((x) => x.u).sort((a, b) => a.u!.eur - b.u!.eur);
        const cheapest = priced[0];
        if (cheapest) {
          eur += n * cheapest.u!.eur;
          const label = unknown.length > 1 ? `seats (priced at the cheapest type, ${cheapest.l.label})` : cheapest.l.label;
          parts.push(`${n} idle × ${label} at ${eurText(cheapest.u!.eur)} a month each (${cheapest.u!.basis})`);
        } else parts.push(`${n} idle seats (price UNKNOWN)`);
      }
    }
  }
  if (!idle) return null;
  const paid = sub.seatLines.reduce((t, l) => t + l.paidSeats, 0);
  return { idle, active, paid, monthlyEur: Math.round(eur * 100) / 100, basis: `${parts.join(" + ")} = ${eurText(eur)} a month` };
}

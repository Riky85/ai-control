/**
 * Servizio prezzi AI — l'UNICO punto da cui il resto dell'app legge un prezzo.
 *
 * Legge il catalogo normalizzato (pricing/catalog-data), lo stesso che
 * pricing/catalog-sync.ts scrive nel database: lettura sincrona, deterministica,
 * senza rete (serve anche al Gateway, a ogni richiesta).
 *
 * Regole:
 * - ogni prezzo restituito porta la sua provenienza (fonte, URL, verificato il, confidenza);
 * - le stime sono SEMPRE marcate `estimated: true` e hanno una base di calcolo leggibile;
 * - mai sostituire in silenzio un valore con un altro: listino, contratto, fatturato e
 *   stima restano distinti; quando un dato manca si restituisce null (in pagina: UNKNOWN).
 */
import { buildCatalog, FAMILY_FALLBACKS, DIRECT_DEPLOYMENT, VERIFIED_ON, type Catalog, type CatComponent, type CatModel, type CatPlan, type CatProduct, type CatSeatType, type ComponentKind, type Confidence, type ServiceTier, type SourceType, type Tier, type BillingModel } from "./catalog-data";
import { toEur } from "@/lib/spend/fx";

// ───────────────────────── catalogo e indici ─────────────────────────

const CAT: Catalog = buildCatalog();

const byModelId = new Map(CAT.models.map((m) => [m.id, m]));
const byApiId = new Map<string, CatModel>();
for (const m of CAT.models) if (!byApiId.has(m.apiId)) byApiId.set(m.apiId, m);
const apiIdsLongestFirst = [...byApiId.keys()].sort((a, b) => b.length - a.length);
const providerName = new Map(CAT.providers.map((p) => [p.id, p.name]));
const deploymentById = new Map(CAT.deployments.map((d) => [d.id, d]));
const planById = new Map(CAT.plans.map((p) => [p.id, p]));
const productById = new Map(CAT.products.map((p) => [p.id, p]));
const seatTypeById = new Map(CAT.seatTypes.map((s) => [s.id, s]));
const seatTypeByLegacy = new Map(CAT.seatTypes.filter((s) => s.legacyPlanId).map((s) => [s.legacyPlanId!, s]));
const componentsByRule = new Map<string, CatComponent[]>();
for (const c of CAT.components) componentsByRule.set(c.ruleId, [...(componentsByRule.get(c.ruleId) ?? []), c]);

export const catalog = () => CAT;
export const CATALOG_VERSION = CAT.version;
export { VERIFIED_ON };

/** Data dell'ultima verifica ufficiale più recente nel catalogo. */
export const CATALOG_VERIFIED_AT: Date = CAT.components.filter((c) => c.sourceType === "official").reduce((d, c) => (c.lastVerifiedAt > d ? c.lastVerifiedAt : d), new Date(0));

// ───────────────────────── provenienza ─────────────────────────

export interface Provenance {
  sourceType: SourceType;
  sourceUrl: string | null;
  lastVerifiedAt: Date;
  confidence: Confidence;
  note: string | null;
}

export interface PriceFact {
  price: number;
  currency: "USD" | "EUR";
  unit: CatComponent["unit"];
  kind: ComponentKind;
  region: string;
  serviceTier: ServiceTier;
  contextAbove: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  previousPrice: number | null;
  provenance: Provenance;
  /** Chi fissa il prezzo (fornitore del deployment): "OpenAI", "Amazon Web Services"… */
  publisher: string;
  target: { type: "model" | "seat"; id: string; name: string };
  deploymentId: string | null;
  /** true se la regione chiesta non ha un prezzo proprio ed è stato usato quello globale. */
  regionFallback: boolean;
  /** true se `at` precede la prima versione nota e si è usata quella. */
  earliestKnown: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "7 Oct 2026" (UTC: le date del catalogo sono giorni). */
export const fmtDay = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

export const SOURCE_LABEL: Record<SourceType, string> = {
  official: "official pricing",
  secondary: "secondary source",
  customer: "customer data",
  angar_estimate: "angar estimate",
};

/** "List price · OpenAI official pricing · verified 7 Oct 2026" */
export function provenanceLine(f: Pick<PriceFact, "provenance" | "publisher">, prefix = "List price") {
  const p = f.provenance;
  const who = p.sourceType === "angar_estimate" ? "angar estimate" : `${f.publisher} ${SOURCE_LABEL[p.sourceType]}`;
  return `${prefix} · ${who} · verified ${fmtDay(p.lastVerifiedAt)}`;
}

/** Importo nella valuta del listino: "$2", "$0.15", "€14.99". */
export function fmtMoney(n: number, currency: string) {
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  const abs = Math.abs(n);
  // Interi senza decimali ("$2"), altrimenti almeno 2 e fino a 4 decimali ("$0.10", "$1.875", "$0.0075").
  const whole = Math.abs(abs - Math.round(abs)) < 1e-9;
  const s = abs.toLocaleString("en-GB", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 4 });
  return `${n < 0 ? "−" : ""}${sym}${s}`;
}

// ───────────────────────── modelli ─────────────────────────

export type ModelMatch = "exact" | "prefix" | "family";

/** Toglie prefissi di provider/cloud e date di snapshot: "us.anthropic.claude-sonnet-4-5-20250929-v1:0" → "claude-sonnet-4-5". */
export function normaliseModelId(raw: string) {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^models\//, "").replace(/^(openai|anthropic|google|mistralai|mistral|deepseek|x-ai|xai|azure)\//, "");
  s = s.replace(/^(us|eu|apac|global|au|jp)\./, "").replace(/^(anthropic|openai|mistral|google|meta|deepseek)\./, "");
  s = s.replace(/-v\d+(:\d+)?$/, "").replace(/:\d+$/, "").replace(/@\d{8}$/, "");
  s = s.replace(/-\d{4}-\d{2}-\d{2}$/, "").replace(/-\d{8}$/, "");
  return s;
}

/** Modello del catalogo per un id come compare nei log o nella fatturazione. */
export function resolveModel(raw: string | null | undefined): { model: CatModel; match: ModelMatch } | null {
  if (!raw) return null;
  const direct = byModelId.get(raw);
  if (direct) return { model: direct, match: "exact" };
  const id = normaliseModelId(raw);
  const exact = byApiId.get(id);
  if (exact) return { model: exact, match: "exact" };
  for (const api of apiIdsLongestFirst) if (id.startsWith(`${api}-`)) return { model: byApiId.get(api)!, match: "prefix" };
  for (const [re, mid] of FAMILY_FALLBACKS) if (re.test(raw)) {
    const m = byModelId.get(mid);
    if (m) return { model: m, match: "family" };
  }
  return null;
}

export const modelById = (id: string) => byModelId.get(id) ?? null;
export const providerNameOf = (id: string) => providerName.get(id) ?? id;
export const deploymentOf = (id: string) => deploymentById.get(id) ?? null;

// ───────────────────────── piani e posti ─────────────────────────

/** Tipo di posto da un id qualsiasi: tipo di posto ("chatgpt-business:premium"), piano (posto predefinito) o id del vecchio catalogo. */
export function resolveSeatType(id: string | null | undefined): CatSeatType | null {
  if (!id) return null;
  const st = seatTypeById.get(id) ?? seatTypeByLegacy.get(id);
  if (st) return st;
  const plan = planById.get(id);
  if (!plan) return null;
  return CAT.seatTypes.find((s) => s.planId === plan.id && s.isDefault) ?? CAT.seatTypes.find((s) => s.planId === plan.id) ?? null;
}

export const planOf = (seatType: CatSeatType): CatPlan => planById.get(seatType.planId)!;
export const productOf = (plan: CatPlan): CatProduct => productById.get(plan.productId)!;
export const planByIdOf = (id: string | null | undefined) => (id ? planById.get(id) ?? null : null);
export const productByIdOf = (id: string | null | undefined) => (id ? productById.get(id) ?? null : null);

/** Nome da mostrare per un tipo di posto: "ChatGPT Business", "ChatGPT Business · Premium". */
export function seatTypeLabel(st: CatSeatType) {
  const plan = planOf(st);
  return CAT.seatTypes.filter((s) => s.planId === plan.id).length > 1 ? `${plan.name} · ${st.name}` : plan.name;
}

/** Prodotti a posti di un servizio della discovery (es. "chatgpt" → ChatGPT). */
export const productsForService = (serviceId: string) => CAT.products.filter((p) => p.serviceId === serviceId);

// ───────────────────────── getPrice ─────────────────────────

export interface PriceOptions {
  serviceTier?: ServiceTier;
  /** Dimensione del prompt in token: sceglie la fascia di contesto lungo, se c'è. */
  contextTokens?: number;
  /** Se `at` precede la prima versione nota, usa quella (marcata earliestKnown). Default: false. */
  earliestIfBefore?: boolean;
}

function pick(list: CatComponent[], kind: ComponentKind, region: string, tier: ServiceTier, ctx: number, at: Date, earliestIfBefore: boolean) {
  const cands = list.filter((c) => c.kind === kind && c.region === region && c.serviceTier === tier && c.contextAbove <= ctx);
  if (!cands.length) return null;
  const maxCtx = Math.max(...cands.map((c) => c.contextAbove));
  const band = cands.filter((c) => c.contextAbove === maxCtx).sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  const t = at.getTime();
  const hit = band.find((c) => c.effectiveFrom.getTime() <= t && (!c.effectiveUntil || t < c.effectiveUntil.getTime()));
  if (hit) return { c: hit, earliest: false };
  if (earliestIfBefore && t < band[0].effectiveFrom.getTime()) return { c: band[0], earliest: true };
  return null;
}

/**
 * Prezzo di una voce con la sua provenienza.
 * @param target modello (id catalogo "openai:gpt-4o" o id API, anche "sporco") oppure tipo di posto / piano / vecchio planId
 * @param deployment deployment del modello (default: API diretta del fornitore); ignorato per i posti
 * @param region "global" (default), "eu", "us"… — se manca un prezzo regionale si usa il globale (regionFallback)
 * @param component voce: "input", "output", "cached_input", "seat_monthly", "seat_annual"…
 * @param at data a cui vale il prezzo (default: adesso)
 */
export function getPrice(target: string, deployment: string | null | undefined, region: string | null | undefined, component: ComponentKind, at: Date = new Date(), opts: PriceOptions = {}): PriceFact | null {
  const tier = opts.serviceTier ?? "standard";
  const ctx = opts.contextTokens ?? 0;
  const reg = region || "global";
  const seatKind = component === "seat_monthly" || component === "seat_annual" || component === "credit";
  const st = seatKind ? resolveSeatType(target) : null;
  let ruleId: string;
  let tgt: PriceFact["target"];
  let publisher: string;
  let dep: string | null = null;
  if (st) {
    ruleId = `seat:${st.id}`;
    const plan = planOf(st);
    tgt = { type: "seat", id: st.id, name: seatTypeLabel(st) };
    publisher = providerNameOf(productOf(plan).providerId);
  } else {
    const r = resolveModel(target);
    if (!r) return null;
    dep = deployment || DIRECT_DEPLOYMENT[r.model.providerId] || null;
    if (!dep) return null;
    ruleId = `model:${r.model.id}@${dep}`;
    tgt = { type: "model", id: r.model.id, name: r.model.name };
    const d = deploymentById.get(dep);
    publisher = providerNameOf(d?.hostProviderId ?? r.model.providerId);
  }
  const list = componentsByRule.get(ruleId);
  if (!list) return null;
  const earliest = !!opts.earliestIfBefore;
  let found = pick(list, component, reg, tier, ctx, at, earliest);
  let regionFallback = false;
  if (!found && reg !== "global") {
    found = pick(list, component, "global", tier, ctx, at, earliest);
    regionFallback = !!found;
  }
  if (!found) return null;
  const c = found.c;
  return {
    price: c.price,
    currency: c.currency,
    unit: c.unit,
    kind: c.kind,
    region: c.region,
    serviceTier: c.serviceTier,
    contextAbove: c.contextAbove,
    effectiveFrom: c.effectiveFrom,
    effectiveUntil: c.effectiveUntil,
    previousPrice: c.previousPrice,
    provenance: { sourceType: c.sourceType, sourceUrl: c.sourceUrl, lastVerifiedAt: c.lastVerifiedAt, confidence: c.confidence, note: c.note },
    publisher,
    target: tgt,
    deploymentId: dep,
    regionFallback,
    earliestKnown: found.earliest,
  };
}

/** Tutte le versioni di una voce (storico), dalla più vecchia. */
export function priceHistory(ruleId: string, kind: ComponentKind, opts: { region?: string; serviceTier?: ServiceTier; contextAbove?: number } = {}) {
  return (componentsByRule.get(ruleId) ?? [])
    .filter((c) => c.kind === kind && c.region === (opts.region ?? "global") && c.serviceTier === (opts.serviceTier ?? "standard") && c.contextAbove === (opts.contextAbove ?? 0))
    .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
}

export const componentsOfRule = (ruleId: string) => componentsByRule.get(ruleId) ?? [];

// ───────────────────────── stime: token ─────────────────────────

export interface TokenUsage {
  model: string;
  deployment?: string | null;
  region?: string | null;
  serviceTier?: ServiceTier;
  inputTokens: number;
  outputTokens: number;
  /** Token letti dalla cache (già esclusi da inputTokens). */
  cachedInputTokens?: number;
  /** Token scritti in cache, 5 minuti / 1 ora (già esclusi da inputTokens). */
  cacheWriteTokens?: number;
  cacheWrite1hTokens?: number;
  /** Token di ragionamento fatturati a parte (se il fornitore li separa dall'output). */
  reasoningTokens?: number;
  /** Ricerche web / grounding. */
  searches?: number;
  at?: Date;
}

export interface CostEstimate {
  eur: number;
  /** Importo nella valuta del listino. */
  amount: number;
  currency: string;
  estimated: true;
  /** false = modello sconosciuto: costo 0, da mostrare come UNKNOWN. */
  known: boolean;
  model: CatModel | null;
  match: ModelMatch | null;
  basis: string;
  sources: PriceFact[];
}

const n0 = (n: number) => Math.round(n).toLocaleString("en-GB");
// Vecchie regole del Gateway quando il catalogo non ha la voce di cache del modello.
const CACHE_WRITE_X = 1.25;
const CACHE_READ_X = 0.1;

/** Costo stimato di un consumo a token: token × listino del catalogo, in EUR via spend/fx.ts. */
export function estimateTokenCost(u: TokenUsage): CostEstimate {
  const r = resolveModel(u.model);
  if (!r) return { eur: 0, amount: 0, currency: "USD", estimated: true, known: false, model: null, match: null, basis: `Model ${u.model || "unknown"} is not in the angar price list`, sources: [] };
  const at = u.at ?? new Date();
  const prompt = u.inputTokens + (u.cachedInputTokens ?? 0) + (u.cacheWriteTokens ?? 0) + (u.cacheWrite1hTokens ?? 0);
  const opts: PriceOptions = { serviceTier: u.serviceTier, contextTokens: prompt, earliestIfBefore: true };
  let dep = u.deployment ?? null;
  const get = (k: ComponentKind) => getPrice(r.model.id, dep, u.region, k, at, opts);
  let input = get("input");
  // Deployment senza prezzi nel catalogo (es. Vertex): si ripiega sul listino diretto, dichiarandolo.
  let depNote = "";
  if (!input && dep) {
    const d = deploymentById.get(dep);
    dep = null;
    input = get("input");
    if (input) depNote = ` (${d?.name ?? "this deployment"} not priced: direct list price used)`;
  }
  if (!input) return { eur: 0, amount: 0, currency: "USD", estimated: true, known: false, model: r.model, match: r.match, basis: `No price for ${r.model.name} in the angar price list`, sources: [] };
  const sources: PriceFact[] = [input];
  const parts: string[] = [];
  let amount = 0;
  const line = (tokens: number, label: string, price: number) => {
    if (!tokens) return;
    amount += (tokens * price) / 1_000_000;
    parts.push(`${n0(tokens)} ${label} × ${fmtMoney(price, input!.currency)}`);
  };
  line(u.inputTokens, "input", input.price);
  const out = get("output");
  if (out) sources.push(out);
  line(u.outputTokens, "output", out?.price ?? 0);
  const cached = get("cached_input");
  if (cached) sources.push(cached);
  line(u.cachedInputTokens ?? 0, cached ? "cached input" : `cached input (${CACHE_READ_X}× input, angar estimate)`, cached?.price ?? input.price * CACHE_READ_X);
  const cw = get("cache_write");
  if (cw) sources.push(cw);
  line(u.cacheWriteTokens ?? 0, cw ? "cache write" : `cache write (${CACHE_WRITE_X}× input, angar estimate)`, cw?.price ?? input.price * CACHE_WRITE_X);
  const cw1 = get("cache_write_1h");
  if (cw1) sources.push(cw1);
  line(u.cacheWrite1hTokens ?? 0, cw1 ? "1h cache write" : "1h cache write (2× input, angar estimate)", cw1?.price ?? input.price * 2);
  const rs = get("reasoning");
  if (rs) sources.push(rs);
  line(u.reasoningTokens ?? 0, rs ? "reasoning" : "reasoning (output price)", rs?.price ?? out?.price ?? 0);
  if (u.searches) {
    const s = get("search");
    if (s) {
      sources.push(s);
      amount += (u.searches * s.price) / 1000;
      parts.push(`${n0(u.searches)} searches × ${fmtMoney(s.price, s.currency)} / 1K`);
    }
  }
  const eur = toEur(amount, input.currency).eur;
  const tierNote = input.serviceTier !== "standard" ? `, ${input.serviceTier} tier` : "";
  const ctxNote = input.contextAbove > 0 ? `, prompt over ${n0(input.contextAbove / 1000)}K tokens` : "";
  const regNote = input.region !== "global" ? `, ${input.region.toUpperCase()} region` : "";
  const fam = r.match === "family" ? ` (closest match for ${u.model})` : "";
  const basis = `${parts.join(" + ") || "0 tokens"}, prices for 1M tokens = ${fmtMoney(amount, input.currency)}${input.currency !== "EUR" ? ` ≈ ${fmtEurPlain(eur)}` : ""} · ${r.model.name}${fam} list price${tierNote}${ctxNote}${regNote}${depNote}`;
  return { eur, amount, currency: input.currency, estimated: true, known: true, model: r.model, match: r.match, basis, sources };
}

function fmtEurPlain(n: number) {
  const d = Math.abs(n) < 100;
  return "€" + (Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: d ? 2 : 0, maximumFractionDigits: d ? 2 : 0 });
}

// ───────────────────────── stime: posti ─────────────────────────

export interface SeatLineInput {
  /** Tipo di posto, piano o vecchio planId. */
  seatType: string;
  seats: number;
  cycle?: "monthly" | "annual";
}

export interface SeatLineEstimate {
  seatTypeId: string | null;
  label: string;
  seats: number;
  cycle: "monthly" | "annual";
  unitPrice: number | null;
  currency: string | null;
  unitEur: number | null;
  totalEur: number | null;
  fact: PriceFact | null;
}

export interface SeatCostEstimate {
  /** Costo mensile in EUR (somma delle righe con prezzo). */
  eur: number;
  estimated: true;
  /** false se almeno una riga non ha un prezzo di listino (es. piano a prezzo personalizzato). */
  known: boolean;
  lines: SeatLineEstimate[];
  basis: string;
  sources: PriceFact[];
}

/** Costo mensile stimato di righe di posti (anche di tipi diversi nello stesso abbonamento): posti × listino. */
export function estimateSeatCost(lines: SeatLineInput[], at: Date = new Date()): SeatCostEstimate {
  const out: SeatLineEstimate[] = [];
  for (const l of lines) {
    const st = resolveSeatType(l.seatType);
    const cycle = l.cycle ?? "monthly";
    if (!st) {
      out.push({ seatTypeId: null, label: l.seatType, seats: l.seats, cycle, unitPrice: null, currency: null, unitEur: null, totalEur: null, fact: null });
      continue;
    }
    // Annuale senza prezzo annuale → prezzo mensile (dichiarato nella base).
    const fact = (cycle === "annual" ? getPrice(st.id, null, null, "seat_annual", at, { earliestIfBefore: true }) : null) ?? getPrice(st.id, null, null, "seat_monthly", at, { earliestIfBefore: true });
    const unitEur = fact ? toEur(fact.price, fact.currency).eur : null;
    out.push({ seatTypeId: st.id, label: seatTypeLabel(st), seats: l.seats, cycle, unitPrice: fact?.price ?? null, currency: fact?.currency ?? null, unitEur, totalEur: unitEur != null ? unitEur * l.seats : null, fact });
  }
  const priced = out.filter((l) => l.totalEur != null);
  const eur = priced.reduce((t, l) => t + l.totalEur!, 0);
  const desc = out.map((l) => {
    if (l.unitPrice == null) return `${l.seats} × ${l.label} (no list price)`;
    const cyc = l.fact?.kind === "seat_annual" ? "billed yearly" : l.cycle === "annual" ? "monthly price, no yearly price listed" : "billed monthly";
    return `${l.seats} × ${l.label} (${fmtMoney(l.unitPrice, l.currency!)} a month, ${cyc})`;
  });
  const native = new Set(priced.map((l) => l.currency));
  const nativeTotal = native.size === 1 ? priced.reduce((t, l) => t + l.unitPrice! * l.seats, 0) : null;
  const total = nativeTotal != null && [...native][0] !== "EUR" ? `${fmtMoney(nativeTotal, [...native][0]!)} a month ≈ ${fmtEurPlain(eur)}` : `${fmtEurPlain(eur)} a month`;
  return {
    eur,
    estimated: true,
    known: out.length > 0 && priced.length === out.length,
    lines: out,
    basis: out.length ? `${desc.join(" + ")} = ${total} · list price` : "No seats",
    sources: priced.map((l) => l.fact!),
  };
}

// ───────────────────────── reale vs stimato ─────────────────────────

/** Basi di AiSystemCost che sono importi reali (fatturati), non stime. */
export const ACTUAL_BASIS = new Set(["bank", "invoice", "billing_connector", "csv_import", "manual"]);
const ACTUAL_LABEL: Record<string, string> = {
  bank: "Bank statement",
  invoice: "Invoices",
  billing_connector: "Provider billing",
  csv_import: "Imported file",
  manual: "Entered by hand",
  contract: "Contract",
};

export interface EconomicsAssetInput {
  id: string;
  name: string;
  type?: string;
  serviceId: string | null;
  model?: string | null;
  cost: { monthlyCostEstimate: number | null; basis: string; confidence: string; planId: string | null; seats: number | null; annualBilling: boolean } | null;
  /** Persone note che la usano (per stimare i posti quando non si conoscono). */
  users?: number;
  /** Abbonamento normalizzato, se c'è (vince su AiSystemCost per posti e prezzi). */
  subscription?: {
    actualMonthly: number | null;
    currency: string;
    source: string;
    billingCycle: string | null;
    seatLines: { seatTypeId: string | null; label: string; paidSeats: number }[];
    /** "manual" = inserito a mano: anche il prezzo di contratto conta come costo reale. */
    origin?: string;
    contractMonthly?: number | null;
    /** Etichetta della fonte già pronta ("Manual · entered by … on …"). */
    sourceLabel?: string | null;
  } | null;
  /** Spesa a consumo stimata dal Gateway angar negli ultimi 30 giorni (token × listino), in EUR. */
  gatewayEstimateEur?: number | null;
}

export interface ActualVsEstimated {
  actual: { eur: number; source: string; confidence: string } | null;
  estimated: { eur: number; basis: string; known: boolean } | null;
  /** actual − estimated, e in % sullo stimato. null se manca uno dei due. */
  variance: { eur: number; pct: number } | null;
  basis: string;
  sources: PriceFact[];
}

/** Il piano business predefinito di un servizio (stessa scelta del vecchio estimateMonthlyEur). */
export function defaultBusinessSeat(serviceId: string): CatSeatType | null {
  const legacy = legacyPlans().filter((p) => p.service === serviceId);
  const plan = legacy.find((p) => p.business) ?? legacy[0];
  return plan ? seatTypeByLegacy.get(plan.id) ?? null : null;
}

/** Costo reale (fatturato) e costo stimato (listino × posti, o token × listino) di un'AI, con lo scarto. */
export function actualVsEstimated(a: EconomicsAssetInput, at: Date = new Date()): ActualVsEstimated {
  const c = a.cost;
  const sub = a.subscription ?? null;
  let actual: ActualVsEstimated["actual"] = null;
  const manual = sub?.origin === "manual";
  const subLabel = sub ? sub.sourceLabel ?? ACTUAL_LABEL[sub.source] ?? sub.source : "";
  if (sub?.actualMonthly != null) actual = { eur: toEur(sub.actualMonthly, sub.currency).eur, source: manual ? `${subLabel} · billed amount` : subLabel, confidence: "HIGH" };
  // Abbonamento inserito a mano senza importo fatturato: il prezzo di contratto è il costo reale.
  else if (manual && sub?.contractMonthly != null) actual = { eur: toEur(sub.contractMonthly, sub.currency).eur, source: `${subLabel} · contract price`, confidence: "HIGH" };
  else if (c?.monthlyCostEstimate != null && ACTUAL_BASIS.has(c.basis)) actual = { eur: c.monthlyCostEstimate, source: ACTUAL_LABEL[c.basis] ?? c.basis, confidence: c.confidence };

  let estimated: ActualVsEstimated["estimated"] = null;
  let sources: PriceFact[] = [];
  const cycle = (sub?.billingCycle === "annual" || c?.annualBilling ? "annual" : "monthly") as "monthly" | "annual";
  const lines: SeatLineInput[] =
    sub && sub.seatLines.length
      ? sub.seatLines.filter((l) => l.seatTypeId).map((l) => ({ seatType: l.seatTypeId!, seats: l.paidSeats, cycle }))
      : c?.planId && resolveSeatType(c.planId)
        ? [{ seatType: c.planId, seats: c.seats && c.seats > 0 ? c.seats : 1, cycle }]
        : [];
  if (lines.length) {
    const e = estimateSeatCost(lines, at);
    estimated = { eur: e.eur, basis: e.basis, known: e.known };
    sources = e.sources;
  } else if (a.gatewayEstimateEur != null && a.gatewayEstimateEur > 0) {
    estimated = { eur: a.gatewayEstimateEur, basis: "Tokens seen by angar Gateway in the last 30 days × list price", known: true };
  } else if (a.serviceId && (a.users ?? 0) > 0) {
    const st = defaultBusinessSeat(a.serviceId);
    if (st) {
      const e = estimateSeatCost([{ seatType: st.id, seats: a.users!, cycle: "monthly" }], at);
      estimated = { eur: e.eur, basis: `${e.basis} · seats assumed = ${a.users} people seen using it`, known: e.known };
      sources = e.sources;
    }
  } else if (c?.monthlyCostEstimate != null && c.basis === "estimate") {
    estimated = { eur: c.monthlyCostEstimate, basis: "Saved estimate (list prices)", known: true };
  }

  const variance = actual && estimated && estimated.eur > 0 ? { eur: actual.eur - estimated.eur, pct: (actual.eur - estimated.eur) / estimated.eur } : null;
  const basis = [actual ? `Actual: ${actual.source}` : "Actual: UNKNOWN", estimated ? `Estimated: ${estimated.basis}` : "Estimated: UNKNOWN"].join(" · ");
  return { actual, estimated, variance, basis, sources };
}

// ───────────────────────── compatibilità col vecchio catalogo ─────────────────────────
// Stesse forme di pricing/catalog.ts (PLANS, API_MODELS…), ricavate dal catalogo.

export interface LegacyPlan {
  id: string;
  service: string;
  name: string;
  monthlyUsd: number;
  annualMonthlyUsd?: number;
  business: boolean;
}

export interface LegacyApiModel {
  match: RegExp;
  id: string;
  name: string;
  vendor: string;
  inUsd: number;
  outUsd: number;
  tier: Tier;
}

let legacyPlansCache: { at: number; plans: LegacyPlan[] } | null = null;

/** Un "piano" del vecchio elenco per ogni tipo di posto con id storico, con il listino di oggi. */
export function legacyPlans(at: Date = new Date()): LegacyPlan[] {
  const dayKey = Math.floor(at.getTime() / 86_400_000);
  if (legacyPlansCache && legacyPlansCache.at === dayKey) return legacyPlansCache.plans;
  const out: LegacyPlan[] = [];
  for (const st of CAT.seatTypes) {
    if (!st.legacyPlanId) continue;
    const plan = planOf(st);
    const product = productOf(plan);
    const m = getPrice(st.id, null, null, "seat_monthly", at, { earliestIfBefore: true });
    const y = getPrice(st.id, null, null, "seat_annual", at, { earliestIfBefore: true });
    const monthly = m?.price ?? y?.price;
    if (monthly == null || !product.serviceId) continue;
    out.push({ id: st.legacyPlanId, service: product.serviceId, name: st.legacyName ?? plan.name, monthlyUsd: monthly, ...(y ? { annualMonthlyUsd: y.price } : {}), business: plan.audience !== "personal" });
  }
  legacyPlansCache = { at: dayKey, plans: out };
  return out;
}

/** Piano del vecchio elenco per id (AiSystemCost.planId). */
export const legacyPlanById = (id: string | null | undefined) => (id ? legacyPlans().find((p) => p.id === id) ?? null : null);

/** Costo mensile in EUR di N posti di un piano del vecchio elenco, dal listino (stima). */
export function seatsEur(planId: string, seats: number, annual = false) {
  return estimateSeatCost([{ seatType: planId, seats, cycle: annual ? "annual" : "monthly" }]).eur;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Modelli con prezzo a token sull'API diretta (attivi, anteprima o deprecati), forma del vecchio API_MODELS. */
export function legacyApiModels(at: Date = new Date()): LegacyApiModel[] {
  const out: LegacyApiModel[] = [];
  for (const m of CAT.models) {
    if (m.lifecycle === "retired" || !m.tier || m.providerId === "angar") continue;
    const i = getPrice(m.id, null, null, "input", at, { earliestIfBefore: true });
    const o = getPrice(m.id, null, null, "output", at, { earliestIfBefore: true });
    if (!i || !o) continue;
    out.push({ match: new RegExp(`^${escapeRe(m.apiId)}`, "i"), id: m.id, name: m.name, vendor: providerNameOf(m.providerId), inUsd: i.price, outUsd: o.price, tier: m.tier });
  }
  return out;
}

/** Modello del vecchio formato per un id qualsiasi (anche "sporco"), con il listino diretto di oggi. */
export function legacyApiModelFor(model: string | null | undefined, at: Date = new Date()): LegacyApiModel | null {
  const r = resolveModel(model);
  if (!r || !r.model.tier) return null;
  const i = getPrice(r.model.id, null, null, "input", at, { earliestIfBefore: true });
  const o = getPrice(r.model.id, null, null, "output", at, { earliestIfBefore: true });
  if (!i) return null;
  return { match: new RegExp(`^${escapeRe(r.model.apiId)}`, "i"), id: r.model.id, name: r.model.name, vendor: providerNameOf(r.model.providerId), inUsd: i.price, outUsd: o?.price ?? 0, tier: r.model.tier };
}

/** Prezzo medio "misto" per 1M token (3 parti input, 1 output), per confronti. */
export const blendedPrice = (m: { inUsd: number; outUsd: number }) => (m.inUsd * 3 + m.outUsd) / 4;

// Famiglie specialistiche (codice, embedding): mai proposte come alternativa generica.
const SPECIALIST_FAMILIES = new Set(["Codestral", "Embeddings"]);

/**
 * Alternativa più economica di un livello sotto, stesso fornitore se possibile, solo modelli attivi
 * e generalisti. Ordine: il più recente (stessa generazione), poi il gradino più vicino sotto
 * (il più caro tra i più economici: meno sorprese di qualità del più economico in assoluto).
 */
export function cheaperApiModel(m: LegacyApiModel, at: Date = new Date()): LegacyApiModel | null {
  const next: Tier | null = m.tier === "frontier" ? "balanced" : m.tier === "balanced" ? "light" : null;
  if (!next) return null;
  const pool = legacyApiModels(at).filter((x) => {
    const cm = modelById(x.id);
    return x.tier === next && cm?.lifecycle === "active" && !SPECIALIST_FAMILIES.has(cm.family) && blendedPrice(x) < blendedPrice(m);
  });
  const released = (x: LegacyApiModel) => modelById(x.id)?.releasedAt?.getTime() ?? -1;
  const sorted = (l: LegacyApiModel[]) => [...l].sort((a, b) => released(b) - released(a) || blendedPrice(b) - blendedPrice(a));
  return sorted(pool.filter((x) => x.vendor === m.vendor))[0] ?? sorted(pool)[0] ?? null;
}

// Costanti usate nelle pagine (nessun prezzo): data di verifica del listino.
export const BILLING_MODEL_LABEL: Record<BillingModel, string> = {
  SEAT_BASED: "Seats",
  USAGE_BASED: "Usage",
  TOKEN_BASED: "Tokens",
  CREDIT_BASED: "Credits",
  HYBRID: "Seats + usage",
  CONTRACTED: "Contract",
  CUSTOM: "Custom",
};

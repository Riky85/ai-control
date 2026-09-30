/**
 * angar Engine — AI Price Index.
 *
 * Indice anonimo tra i clienti: quanto si paga davvero ogni posto di ogni AI,
 * quanto sono usati i posti, quali AI adottano le aziende simili. Più aziende
 * usano angar, più l'indice è preciso (effetto rete).
 *
 * Regole (come benchmark.ts): deterministico, solo database, nessun LLM.
 * Privacy: non esce mai il valore o il nome di un'altra azienda; solo mediana
 * e quartili, e solo quando contribuiscono almeno MIN_COMPANIES aziende.
 * Sotto la soglia il riferimento è il prezzo di listino (source: "list").
 */
import { db } from "@/lib/db";
import { MIN_COMPANIES, sizeBandOf, type PeerStats, type SizeBand } from "@/lib/benchmark";
import { loadAssets, monthlyOf, serviceOf } from "@/lib/savings";
import { countActive, SEAT_WINDOW_DAYS } from "@/lib/seats";
import { AI_SERVICES } from "@/lib/discovery/catalog";
import { PLANS, API_MODELS, PRICES_AS_OF, SERVICE_CATEGORY, CATEGORY_LABEL, USD_TO_EUR, plansFor, type Plan } from "@/lib/pricing/catalog";

export { MIN_COMPANIES };

const DAY = 86400000;
const CACHE_MS = 10 * 60 * 1000;
/** Solo costi reali per l'indice di rete: estratto conto, fattura, billing del fornitore. */
const REAL_BASIS = new Set(["bank", "invoice", "billing_connector"]);
/** Nella pagina pubblica un servizio compare solo se lo usano almeno tante aziende. */
const PUBLIC_MIN_USERS = 3;

export type Verdict = "above" | "fair" | "below" | "unknown";
export type PriceSource = "peers" | "list" | "none";

// ───────────────────────── statistica ─────────────────────────

export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function peerStats(values: number[]): PeerStats {
  const s = [...values].sort((a, b) => a - b);
  return { median: quantile(s, 0.5), p25: quantile(s, 0.25), p75: quantile(s, 0.75), count: s.length };
}

/** Statistiche solo se contribuiscono almeno MIN_COMPANIES aziende (una voce per azienda). */
const guarded = (values: number[]): PeerStats | null => (values.length >= MIN_COMPANIES ? peerStats(values) : null);

/**
 * Verdetto sul prezzo di un posto.
 * - Pari: sopra se oltre p75 e oltre mediana +10%; sotto se sotto p25 e sotto mediana −10%.
 * - Listino: tolleranza più larga verso l'alto (+25%: IVA e cambio negli addebiti in banca), −10% verso il basso.
 */
export function priceVerdict(yours: number | null, ref: { peers: PeerStats | null; list: number | null }): { verdict: Verdict; deltaPct: number | null; source: PriceSource } {
  if (yours == null || yours <= 0) return { verdict: "unknown", deltaPct: null, source: ref.peers ? "peers" : ref.list ? "list" : "none" };
  if (ref.peers && ref.peers.median > 0) {
    const p = ref.peers;
    const deltaPct = Math.round(((yours - p.median) / p.median) * 100);
    const verdict: Verdict = yours > Math.max(p.p75, p.median * 1.1) ? "above" : yours < Math.min(p.p25, p.median * 0.9) ? "below" : "fair";
    return { verdict, deltaPct, source: "peers" };
  }
  if (ref.list && ref.list > 0) {
    const d = (yours - ref.list) / ref.list;
    return { verdict: d > 0.25 ? "above" : d < -0.1 ? "below" : "fair", deltaPct: Math.round(d * 100), source: "list" };
  }
  return { verdict: "unknown", deltaPct: null, source: "none" };
}

// ───────────────────────── dati di rete (cache) ─────────────────────────

interface OrgService {
  /** Somma costi reali e posti (solo AI con posti > 0 e costo reale). */
  realCost: number;
  realSeats: number;
  byPlan: Map<string, { cost: number; seats: number }>;
  /** Posti con utilizzo noto (almeno una persona nota). */
  utilSeats: number;
  utilActive: number;
}

interface OrgPoint {
  orgId: string;
  band: SizeBand | null;
  industry: string | null;
  /** Servizi in uso (esclusi quelli "non consentiti"). */
  services: Set<string>;
  priced: Map<string, OrgService>;
  monthlyEur: number;
  idleEur: number;
  seats: number;
  active: number;
  assets: number;
}

let cache: { at: number; points: Map<string, OrgPoint> } | null = null;

const normIndustry = (s: string | null | undefined) => (s ?? "").trim().toLowerCase() || null;

async function loadNetwork(): Promise<Map<string, OrgPoint>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.points;
  const [orgs, assets, activeRows] = await Promise.all([
    db.organization.findMany({ select: { id: true, employees: true, industry: true } }),
    db.aiAsset.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        name: true,
        vendor: true,
        serviceId: true,
        status: true,
        cost: { select: { monthlyCostEstimate: true, seats: true, planId: true, basis: true } },
        _count: { select: { usages: true } },
      },
    }),
    db.aiAssetUsage.groupBy({ by: ["aiAssetId"], where: { lastSeenAt: { gte: new Date(Date.now() - SEAT_WINDOW_DAYS * DAY) } }, _count: { _all: true } }),
  ]);
  const activeOf = new Map(activeRows.map((r) => [r.aiAssetId, r._count._all]));
  const points = new Map<string, OrgPoint>();
  for (const o of orgs) {
    points.set(o.id, {
      orgId: o.id,
      band: o.employees && o.employees > 0 ? sizeBandOf(o.employees) : null,
      industry: normIndustry(o.industry),
      services: new Set(),
      priced: new Map(),
      monthlyEur: 0,
      idleEur: 0,
      seats: 0,
      active: 0,
      assets: 0,
    });
  }
  for (const a of assets) {
    const p = points.get(a.organizationId);
    if (!p || a.status === "UNAPPROVED") continue;
    p.assets++;
    const known = a._count.usages;
    const active = Math.min(activeOf.get(a.id) ?? 0, known);
    const svc = serviceOf(a);
    if (svc) p.services.add(svc);
    // monthlyOf usa solo la lunghezza di usages.
    const m = monthlyOf({ ...a, cost: a.cost as never, usages: new Array(known) });
    if (m && m.eur > 0) p.monthlyEur += m.eur;
    const seats = a.cost?.seats ?? 0;
    if (seats > 0 && known > 0 && m && m.eur > 0) {
      p.seats += seats;
      p.active += Math.min(active, seats);
      p.idleEur += (Math.max(0, seats - active) * m.eur) / seats;
    }
    if (!svc || seats <= 0) continue;
    const s = p.priced.get(svc) ?? { realCost: 0, realSeats: 0, byPlan: new Map(), utilSeats: 0, utilActive: 0 };
    const cost = a.cost?.monthlyCostEstimate ?? 0;
    if (cost > 0 && REAL_BASIS.has(a.cost?.basis ?? "")) {
      s.realCost += cost;
      s.realSeats += seats;
      if (a.cost?.planId) {
        const bp = s.byPlan.get(a.cost.planId) ?? { cost: 0, seats: 0 };
        bp.cost += cost;
        bp.seats += seats;
        s.byPlan.set(a.cost.planId, bp);
      }
    }
    if (known > 0) {
      s.utilSeats += seats;
      s.utilActive += Math.min(active, seats);
    }
    p.priced.set(svc, s);
  }
  // Solo aziende con almeno un'AI contano come "aziende su angar".
  for (const [id, p] of points) if (p.assets === 0) points.delete(id);
  cache = { at: Date.now(), points };
  return points;
}

/** Prezzo effettivo di un posto per ogni altra azienda (una voce per azienda). */
function peerSeatPrices(points: OrgPoint[], serviceId: string, planId?: string | null): number[] {
  const out: number[] = [];
  for (const p of points) {
    const s = p.priced.get(serviceId);
    if (!s) continue;
    if (planId) {
      const bp = s.byPlan.get(planId);
      if (bp && bp.seats > 0) out.push(bp.cost / bp.seats);
    } else if (s.realSeats > 0) out.push(s.realCost / s.realSeats);
  }
  return out;
}

function peerUtilisation(points: OrgPoint[], serviceId: string): number[] {
  const out: number[] = [];
  for (const p of points) {
    const s = p.priced.get(serviceId);
    if (s && s.utilSeats > 0) out.push(s.utilActive / s.utilSeats);
  }
  return out;
}

// ───────────────────────── catalogo ─────────────────────────

export function serviceName(serviceId: string, fallback?: string) {
  return AI_SERVICES.find((s) => s.id === serviceId)?.name ?? fallback ?? serviceId;
}

/** Prezzo di listino di un posto in EUR (piano indicato, altrimenti il piano business del servizio). */
export function listSeatEur(serviceId: string, planId?: string | null, annual = false): { eur: number; plan: Plan } | null {
  const plan = (planId && PLANS.find((p) => p.id === planId)) || plansFor(serviceId).find((p) => p.business) || plansFor(serviceId)[0];
  if (!plan) return null;
  const usd = annual && plan.annualMonthlyUsd ? plan.annualMonthlyUsd : plan.monthlyUsd;
  return { eur: Math.round(usd * USD_TO_EUR * 100) / 100, plan };
}

// ───────────────────────── indice prezzi dell'azienda ─────────────────────────

export interface PriceIndexRow {
  serviceId: string;
  name: string;
  vendor: string | null;
  assetIds: string[];
  planName: string | null;
  seats: number | null;
  monthlyEur: number;
  /** Costo mensile / posti, solo da costi non stimati. */
  yourSeatEur: number | null;
  peers: PeerStats | null;
  /** "plan" = stesso piano; "service" = tutti i piani dello stesso servizio. */
  peerScope: "plan" | "service" | null;
  listSeatEur: number | null;
  source: PriceSource;
  /** Attivi in 30 giorni / posti (0..1), null se non si sa chi la usa. */
  yourUtilisation: number | null;
  peerUtilisation: PeerStats | null;
  verdict: Verdict;
  deltaPct: number | null;
}

export interface PriceIndex {
  rows: PriceIndexRow[];
  /** Aziende con prezzi reali nella rete (null sotto MIN_COMPANIES: non si dice quante). */
  networkCompanies: number | null;
  minCompanies: number;
}

export async function priceIndexFor(orgId: string): Promise<PriceIndex> {
  const [own, network] = await Promise.all([loadAssets(orgId), loadNetwork()]);
  const others = [...network.values()].filter((p) => p.orgId !== orgId);
  const now = Date.now();

  // Raggruppa le AI pagate dell'azienda per servizio.
  const groups = new Map<string, typeof own>();
  for (const a of own) {
    const m = monthlyOf(a);
    const svc = serviceOf(a);
    if (!svc || !m || m.eur <= 0) continue;
    if (!plansFor(svc).length && !(a.cost?.seats && a.cost.seats > 0)) continue; // solo AI a posti
    groups.set(svc, [...(groups.get(svc) ?? []), a]);
  }

  const rows: PriceIndexRow[] = [];
  for (const [svc, list] of groups) {
    let monthly = 0;
    let seatCost = 0;
    let seatCount = 0;
    let utilSeats = 0;
    let utilActive = 0;
    let totalSeats = 0;
    const planIds = new Map<string, number>();
    let annual = false;
    for (const a of list) {
      const m = monthlyOf(a)!;
      monthly += m.eur;
      const seats = a.cost?.seats ?? 0;
      totalSeats += seats;
      if (a.cost?.planId) planIds.set(a.cost.planId, (planIds.get(a.cost.planId) ?? 0) + Math.max(1, seats));
      if (a.cost?.annualBilling) annual = true;
      if (seats > 0 && !m.estimated) {
        seatCost += m.eur;
        seatCount += seats;
      }
      if (seats > 0 && a.usages.length > 0) {
        utilSeats += seats;
        utilActive += Math.min(countActive(a.usages, SEAT_WINDOW_DAYS, now), seats);
      }
    }
    const planId = [...planIds.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    const list0 = listSeatEur(svc, planId, annual);
    // Prima lo stesso piano, poi tutto il servizio.
    const byPlan = planId ? guarded(peerSeatPrices(others, svc, planId)) : null;
    const byService = byPlan ? null : guarded(peerSeatPrices(others, svc));
    const peers = byPlan ?? byService;
    const yourSeatEur = seatCount > 0 ? seatCost / seatCount : null;
    const v = priceVerdict(yourSeatEur, { peers, list: list0?.eur ?? null });
    rows.push({
      serviceId: svc,
      name: list.length === 1 ? list[0].name : serviceName(svc, list[0].name),
      vendor: list[0].vendor,
      assetIds: list.map((a) => a.id),
      planName: planId ? (PLANS.find((p) => p.id === planId)?.name ?? null) : null,
      seats: totalSeats > 0 ? totalSeats : null,
      monthlyEur: monthly,
      yourSeatEur,
      peers,
      peerScope: byPlan ? "plan" : byService ? "service" : null,
      listSeatEur: list0?.eur ?? null,
      source: v.source,
      yourUtilisation: utilSeats > 0 ? utilActive / utilSeats : null,
      peerUtilisation: guarded(peerUtilisation(others, svc)),
      verdict: v.verdict,
      deltaPct: v.deltaPct,
    });
  }
  const order: Record<Verdict, number> = { above: 0, fair: 1, below: 2, unknown: 3 };
  rows.sort((x, y) => order[x.verdict] - order[y.verdict] || y.monthlyEur - x.monthlyEur);

  const pricedCompanies = others.filter((p) => [...p.priced.values()].some((s) => s.realSeats > 0)).length;
  return { rows, networkCompanies: pricedCompanies >= MIN_COMPANIES ? pricedCompanies : null, minCompanies: MIN_COMPANIES };
}

/** Riga dell'indice per una singola AI (pagina di dettaglio). */
export async function priceForAsset(orgId: string, assetId: string): Promise<PriceIndexRow | null> {
  const idx = await priceIndexFor(orgId);
  return idx.rows.find((r) => r.assetIds.includes(assetId)) ?? null;
}

// ───────────────────────── adozione ─────────────────────────

export type AdoptionScope = "industry+size" | "size" | "all";

export interface AdoptionItem {
  serviceId: string;
  name: string;
  vendor: string | null;
  category: string | null;
  /** Quota di aziende simili che la usano (0..100). */
  sharePct: number;
  /** Quota su tutte le aziende della rete (0..100). */
  overallSharePct: number;
  listSeatEur: number | null;
}

export interface AdoptionIndex {
  items: AdoptionItem[];
  scope: AdoptionScope | null;
  /** Dimensione del gruppo di confronto (null sotto la soglia). */
  peers: number | null;
  minCompanies: number;
}

/**
 * Cosa usano le aziende simili che questa non usa (top 5).
 * Gruppo: stesso settore e fascia, poi stessa fascia, poi tutti — il primo con
 * almeno MIN_COMPANIES aziende. Un servizio compare solo se lo usano almeno 2
 * aziende del gruppo e almeno il 20%: mai un segnale riconducibile a una sola.
 */
export async function adoptionIndex(orgId: string): Promise<AdoptionIndex> {
  const [org, network, mine] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId }, select: { employees: true, industry: true } }),
    loadNetwork(),
    // Anche le AI "non consentite": non si suggerisce ciò che l'azienda ha già scartato.
    db.aiAsset.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { serviceId: true, name: true, vendor: true } }),
  ]);
  const band = org?.employees && org.employees > 0 ? sizeBandOf(org.employees) : null;
  const industry = normIndustry(org?.industry);
  const others = [...network.values()].filter((p) => p.orgId !== orgId);
  const candidates: { scope: AdoptionScope; list: OrgPoint[] }[] = [];
  if (band && industry) candidates.push({ scope: "industry+size", list: others.filter((p) => p.band === band && p.industry === industry) });
  if (band) candidates.push({ scope: "size", list: others.filter((p) => p.band === band) });
  candidates.push({ scope: "all", list: others });
  const hit = candidates.find((c) => c.list.length >= MIN_COMPANIES);
  if (!hit) return { items: [], scope: null, peers: null, minCompanies: MIN_COMPANIES };

  const have = new Set(mine.map((a) => serviceOf(a)).filter(Boolean) as string[]);
  const count = (list: OrgPoint[]) => {
    const m = new Map<string, number>();
    for (const p of list) for (const s of p.services) m.set(s, (m.get(s) ?? 0) + 1);
    return m;
  };
  const inGroup = count(hit.list);
  const overall = count(others);
  const items: AdoptionItem[] = [];
  for (const [svc, n] of inGroup) {
    if (have.has(svc) || n < 2 || n / hit.list.length < 0.2) continue;
    const s = AI_SERVICES.find((x) => x.id === svc);
    const cat = SERVICE_CATEGORY[svc];
    items.push({
      serviceId: svc,
      name: s?.name ?? svc,
      vendor: s?.vendor ?? null,
      category: cat ? CATEGORY_LABEL[cat] : null,
      sharePct: Math.round((n / hit.list.length) * 100),
      overallSharePct: Math.round(((overall.get(svc) ?? 0) / others.length) * 100),
      listSeatEur: listSeatEur(svc)?.eur ?? null,
    });
  }
  items.sort((x, y) => y.sharePct - x.sharePct || y.overallSharePct - x.overallSharePct || x.name.localeCompare(y.name));
  return { items: items.slice(0, 5), scope: hit.scope, peers: hit.list.length, minCompanies: MIN_COMPANIES };
}

// ───────────────────────── numeri pubblici ─────────────────────────

export interface NetworkStats {
  /** null quando contribuiscono meno di MIN_COMPANIES aziende. */
  companies: number | null;
  aiToolsTracked: number | null;
  /** Arrotondato alle centinaia di euro. */
  monthlySpendEur: number | null;
  /** Quota della spesa in posti inutilizzati, mediana tra aziende (0..1). */
  medianWasteShare: number | null;
  /** Posti attivi / pagati, mediana tra aziende (0..1). */
  medianSeatUtilisation: number | null;
  /** Servizi più adottati (quota di aziende 0..100); ciascuno usato da almeno PUBLIC_MIN_USERS aziende. */
  topServices: { serviceId: string; name: string; sharePct: number }[] | null;
  /** Fatti del catalogo: sempre disponibili. */
  catalog: { aiServices: number; pricedPlans: number; pricedServices: number; apiModels: number; pricesAsOf: string };
  minCompanies: number;
}

/** Numeri aggregati e anonimi, sicuri per una pagina PUBBLICA. */
export async function networkStats(): Promise<NetworkStats> {
  const points = [...(await loadNetwork()).values()];
  const catalog = {
    aiServices: AI_SERVICES.length,
    pricedPlans: PLANS.length,
    pricedServices: new Set(PLANS.map((p) => p.service)).size,
    apiModels: API_MODELS.length,
    pricesAsOf: PRICES_AS_OF,
  };
  const base = { catalog, minCompanies: MIN_COMPANIES };
  if (points.length < MIN_COMPANIES) {
    return { ...base, companies: null, aiToolsTracked: null, monthlySpendEur: null, medianWasteShare: null, medianSeatUtilisation: null, topServices: null };
  }
  const spenders = points.filter((p) => p.monthlyEur > 0);
  const withSeats = points.filter((p) => p.seats > 0);
  const waste = guarded(withSeats.filter((p) => p.monthlyEur > 0).map((p) => Math.min(1, p.idleEur / p.monthlyEur)));
  const util = guarded(withSeats.map((p) => p.active / p.seats));
  const counts = new Map<string, number>();
  for (const p of points) for (const s of p.services) counts.set(s, (counts.get(s) ?? 0) + 1);
  const top = [...counts.entries()]
    .filter(([, n]) => n >= PUBLIC_MIN_USERS)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, 10)
    .map(([svc, n]) => ({ serviceId: svc, name: serviceName(svc), sharePct: Math.round((n / points.length) * 100) }));
  return {
    ...base,
    companies: points.length,
    aiToolsTracked: points.reduce((t, p) => t + p.assets, 0),
    monthlySpendEur: spenders.length >= MIN_COMPANIES ? Math.round(spenders.reduce((t, p) => t + p.monthlyEur, 0) / 100) * 100 : null,
    medianWasteShare: waste ? waste.median : null,
    medianSeatUtilisation: util ? util.median : null,
    topServices: top.length ? top : null,
  };
}

/**
 * AI Advisor: "su quali strumenti standardizzare?". Regole deterministiche e
 * spiegabili (nessun LLM): per ogni categoria si sceglie lo strumento a
 * pagamento con più utenti attivi negli ultimi 30 giorni (a parità, quello
 * che costa meno per utente attivo), poi si elencano i passi per arrivarci.
 */
import { db } from "@/lib/db";
import { loadAssets, monthlyOf, categoryOf, serviceOf, type AssetForSavings, type Confidence } from "@/lib/savings";
import { AI_SERVICES } from "@/lib/discovery/catalog";
import { PLANS, CATEGORY_LABEL, USD_TO_EUR, MANAGE_URL, plansFor, type Category, type Plan } from "@/lib/pricing/catalog";

const DAY = 86400000;
const ACTIVE_DAYS = 30;
// Categorie in cui gli strumenti si sovrappongono davvero (uno sostituisce l'altro).
const CONSOLIDATE = new Set<Category>(["assistant", "coding", "search", "meetings"]);
// Le API si pagano a consumo e i modelli locali sono gratuiti: fuori dallo "stack" a posti.
const SKIP = new Set<Category>(["api", "local"]);

export interface AdvisorAssetRef {
  id: string;
  name: string;
  vendor: string | null;
  serviceId: string | null;
}

export interface Recommendation {
  key: string;
  kind: "standardise" | "business" | "rightsize" | "yearly";
  title: string;
  why: string;
  monthlySaving: number; // può essere negativo (es. passare a un piano business costa di più)
  confidence: Confidence;
  assets: AdvisorAssetRef[];
  href: string;
  manageUrl: string | null;
}

export interface StackEntry {
  category: Category;
  label: string;
  tool: { name: string; vendor: string | null; serviceId: string | null; assetId: string };
  seats: number;
  planName: string | null;
  currentEur: number; // quanto costa oggi la categoria (tutti gli strumenti a pagamento)
  estimatedEur: number; // costo stimato dello stack raccomandato
  replaces: string[];
  activeUsers: number;
}

interface Tool {
  key: string;
  service: string | null;
  name: string;
  vendor: string | null;
  category: Category;
  assets: AssetForSavings[];
  eur: number;
  estimated: boolean;
  active: Set<string>; // utenti attivi negli ultimi 30 giorni
  known: Set<string>;
  seats: number | null; // posti pagati, se conosciuti dal piano riconosciuto
}

const ref = (a: AssetForSavings): AdvisorAssetRef => ({ id: a.id, name: a.name, vendor: a.vendor, serviceId: serviceOf(a) });
const r2 = (n: number) => Math.round(n * 100) / 100;
const eurTxt = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

function businessPlan(service: string | null): Plan | null {
  if (!service) return null;
  return plansFor(service).find((p) => p.business) ?? null;
}

/** Prezzo per posto (EUR/mese) dello strumento: piano business di listino, altrimenti costo attuale ÷ posti. */
function perSeatEur(t: Tool): number | null {
  const biz = businessPlan(t.service);
  if (biz) return biz.monthlyUsd * USD_TO_EUR;
  const seats = t.seats ?? (t.known.size || null);
  return seats && t.eur > 0 ? t.eur / seats : null;
}

export async function computeAdvice(organizationId: string) {
  const [assets, usages] = await Promise.all([
    loadAssets(organizationId),
    db.aiAssetUsage.findMany({ where: { aiAsset: { organizationId, deletedAt: null } }, select: { id: true, aiAssetId: true, userId: true, externalUserRef: true, lastSeenAt: true } }),
  ]);
  const now = Date.now();
  const usageBy = new Map<string, typeof usages>();
  for (const u of usages) {
    if (!usageBy.has(u.aiAssetId)) usageBy.set(u.aiAssetId, []);
    usageBy.get(u.aiAssetId)!.push(u);
  }

  // 1. Strumenti a pagamento raggruppati per servizio (più addebiti dello stesso servizio = uno strumento).
  const tools = new Map<string, Tool>();
  let apiEur = 0;
  for (const a of assets) {
    const m = monthlyOf(a);
    if (!m || m.eur <= 0) continue;
    const category = categoryOf(a);
    if (!category) continue;
    if (SKIP.has(category)) {
      apiEur += m.eur;
      continue;
    }
    const service = serviceOf(a);
    const key = service ?? `asset:${a.id}`;
    let t = tools.get(key);
    if (!t) {
      const svc = service ? AI_SERVICES.find((s) => s.id === service) : null;
      t = { key, service, name: svc?.name ?? a.name, vendor: svc?.vendor ?? a.vendor, category, assets: [], eur: 0, estimated: false, active: new Set(), known: new Set(), seats: null };
      tools.set(key, t);
    }
    t.assets.push(a);
    t.eur += m.eur;
    t.estimated ||= m.estimated;
    if (a.cost?.seats) t.seats = (t.seats ?? 0) + a.cost.seats;
    else if (a.cost?.planId && !PLANS.find((p) => p.id === a.cost!.planId)?.business) t.seats = (t.seats ?? 0) + 1;
    for (const u of usageBy.get(a.id) ?? []) {
      const who = u.userId ?? u.externalUserRef ?? u.id;
      t.known.add(who);
      if (u.lastSeenAt && now - u.lastSeenAt.getTime() < ACTIVE_DAYS * DAY) t.active.add(who);
    }
  }

  // 2. Gruppi: nelle categorie "sovrapponibili" uno per categoria, altrimenti uno per strumento.
  const groups = new Map<string, Tool[]>();
  for (const t of Array.from(tools.values())) {
    const g = CONSOLIDATE.has(t.category) ? t.category : `${t.category}:${t.key}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(t);
  }

  const stack: StackEntry[] = [];
  const recs: Recommendation[] = [];

  for (const list of Array.from(groups.values())) {
    // Standard: più utenti attivi; a parità, costo per utente attivo più basso; poi costo totale.
    const sorted = [...list].sort(
      (x, y) => y.active.size - x.active.size || x.eur / Math.max(1, x.active.size) - y.eur / Math.max(1, y.active.size) || x.eur - y.eur
    );
    const std = sorted[0];
    const others = sorted.slice(1);
    const stdAsset = [...std.assets].sort((x, y) => (monthlyOf(y)?.eur ?? 0) - (monthlyOf(x)?.eur ?? 0))[0];
    const manage = std.service ? MANAGE_URL[std.service] ?? null : null;
    const seatPrice = perSeatEur(std);

    // Utenti attivi da coprire con lo standard (chi usa gli altri strumenti passa allo standard).
    const needed = new Set(std.active);
    for (const o of others) {
      const movers = Array.from(o.active).filter((u) => !std.active.has(u));
      movers.forEach((u) => needed.add(u));
      const addCost = seatPrice != null ? movers.length * seatPrice : 0;
      const saving = o.eur - addCost;
      if (saving <= 0) continue;
      const oRef = o.assets.map(ref);
      recs.push({
        key: `standardise:${o.key}`,
        kind: "standardise",
        title: `Standardise on ${std.name}, drop ${o.name}`,
        why:
          `${std.name} has ${plural(std.active.size, "active user")} in the last 30 days vs ${o.active.size} on ${o.name}, which costs ${eurTxt(o.eur)}/mo. ` +
          (movers.length
            ? `Move ${plural(movers.length, "person", "people")} who only use${movers.length === 1 ? "s" : ""} ${o.name} to ${std.name}${seatPrice != null ? ` (about ${eurTxt(movers.length * seatPrice)}/mo more there)` : ""}.`
            : `Everyone active on ${o.name} already uses ${std.name}.`),
        monthlySaving: r2(saving),
        confidence: o.estimated || std.estimated ? "LOW" : movers.length ? "MEDIUM" : "HIGH",
        assets: [ref(stdAsset), ...oRef].slice(0, 3),
        href: `/assets/${o.assets[0].id}`,
        manageUrl: o.service ? MANAGE_URL[o.service] ?? null : null,
      });
    }

    const seats = Math.max(1, needed.size);
    const biz = businessPlan(std.service);
    // Piani personali dello standard (più addebiti o più posti su un piano non business).
    const personal = std.assets.filter((a) => {
      const p = a.cost?.planId ? PLANS.find((x) => x.id === a.cost!.planId) : null;
      return p && !p.business;
    });
    const personalCount = personal.reduce((s, a) => s + (a.cost?.seats ?? 1), 0);

    // Costo stimato dello standard dopo il consolidamento.
    let estimatedEur: number;
    let planName: string | null = null;
    const onBusiness = std.assets.some((a) => PLANS.find((p) => p.id === a.cost?.planId)?.business);
    const planKnown = std.assets.some((a) => a.cost?.planId);
    if (biz && (seats >= 2 || onBusiness || !planKnown)) {
      estimatedEur = seats * biz.monthlyUsd * USD_TO_EUR;
      planName = biz.name;
    } else if (seatPrice != null && (std.seats ?? std.known.size) > 0) {
      const cur = std.eur / (std.seats ?? std.known.size);
      estimatedEur = seats * cur;
      planName = std.assets[0].cost?.planId ? PLANS.find((p) => p.id === std.assets[0].cost!.planId)?.name ?? null : null;
    } else {
      estimatedEur = std.eur;
    }

    // (b) Piani personali → piano business.
    if (biz && personalCount >= 2) {
      const bizCost = personalCount * biz.monthlyUsd * USD_TO_EUR;
      const personalEur = personal.reduce((s, a) => s + (monthlyOf(a)?.eur ?? 0), 0);
      const diff = personalEur - bizCost;
      recs.push({
        key: `business:${std.key}`,
        kind: "business",
        title: `Move ${personalCount} personal ${std.name} plans to ${biz.name}`,
        why:
          `${plural(personalCount, "personal plan")} cost ${eurTxt(personalEur)}/mo today; ${biz.name} is $${biz.monthlyUsd}/seat a month (${eurTxt(bizCost)}/mo). ` +
          (diff >= 0 ? "Cheaper, and the company controls the accounts and data." : "It costs a little more, but the company controls the accounts and data."),
        monthlySaving: r2(diff),
        confidence: "MEDIUM",
        assets: personal.slice(0, 3).map(ref),
        href: `/assets/${personal[0].id}`,
        manageUrl: manage,
      });
    }

    // (d) Posti in eccesso rispetto agli utenti attivi.
    if (std.seats && std.seats > seats && std.known.size > 0) {
      const per = std.eur / std.seats;
      const extra = std.seats - seats;
      recs.push({
        key: `rightsize:${std.key}`,
        kind: "rightsize",
        title: `Right-size ${std.name} to ${plural(seats, "seat")}`,
        why: `You pay for ${std.seats} seats; ${plural(seats, "person has", "people have")} used ${std.name}${others.length ? " or the tools it replaces" : ""} in the last 30 days. Removing ${plural(extra, "seat")} saves about ${eurTxt(extra * per)}/mo.`,
        monthlySaving: r2(extra * per),
        confidence: std.estimated ? "MEDIUM" : "HIGH",
        assets: [ref(stdAsset)],
        href: `/assets/${stdAsset.id}`,
        manageUrl: manage,
      });
    }

    // (c) Fatturazione annuale per lo standard (piano business mensile che la prevede).
    const curPlan = stdAsset.cost?.planId ? PLANS.find((p) => p.id === stdAsset.cost!.planId) : null;
    if (curPlan?.business && curPlan.annualMonthlyUsd && curPlan.annualMonthlyUsd < curPlan.monthlyUsd && !stdAsset.cost?.annualBilling) {
      const pct = 1 - curPlan.annualMonthlyUsd / curPlan.monthlyUsd;
      const base = Math.min(monthlyOf(stdAsset)?.eur ?? 0, estimatedEur);
      const save = base * pct;
      if (save >= 1)
        recs.push({
          key: `yearly:${std.key}`,
          kind: "yearly",
          title: `Pay ${std.name} yearly`,
          why: `${curPlan.name} is $${curPlan.annualMonthlyUsd}/seat a month billed yearly vs $${curPlan.monthlyUsd} monthly — ${Math.round(pct * 100)}% less. Do it after right-sizing, for seats you're sure to keep.`,
          monthlySaving: r2(save),
          confidence: "HIGH",
          assets: [ref(stdAsset)],
          href: `/assets/${stdAsset.id}`,
          manageUrl: manage,
        });
    }

    const currentEur = list.reduce((s, t) => s + t.eur, 0);
    stack.push({
      category: std.category,
      label: CATEGORY_LABEL[std.category],
      tool: { name: std.name, vendor: std.vendor, serviceId: std.service, assetId: stdAsset.id },
      seats,
      planName,
      currentEur: r2(currentEur),
      estimatedEur: r2(estimatedEur),
      replaces: others.map((o) => o.name),
      activeUsers: std.active.size,
    });
  }

  const ORDER = { standardise: 0, business: 1, rightsize: 2, yearly: 3 } as const;
  recs.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || b.monthlySaving - a.monthlySaving);
  stack.sort((a, b) => b.currentEur - a.currentEur);

  const currentEur = stack.reduce((s, x) => s + x.currentEur, 0);
  const recommendedEur = stack.reduce((s, x) => s + x.estimatedEur, 0);
  return { stack, recommendations: recs, currentEur: r2(currentEur), recommendedEur: r2(recommendedEur), apiEur: r2(apiEur) };
}

/**
 * Spend (spec §16) — "Cosa ci costa questa AI, e perché?". Non un prodotto FinOps: una vista
 * che riusa i numeri già esistenti (monthlyOf, estate, budget per team, previsione, anomalie,
 * cambi di prezzo) e li tiene separati per tipo: reale vs stimato, fisso vs a consumo.
 *
 * buildSpendOverview è puro (dati già letti); loadSpendOverview legge dal database.
 */
import { computeSavingsCached, categoryOf, monthlyOf, type AssetForSavings } from "@/lib/savings";
import { loadEstateCached } from "@/lib/estate/graph";
import type { EstateData } from "@/lib/estate/assemble";
import { departmentSpend, type DepartmentSpend } from "@/lib/budgets";
import { modelById, resolveModel } from "@/lib/pricing/service";

export interface SpendBar {
  key: string;
  label: string;
  eur: number;
  /** Quota stimata (listino) dentro il valore. */
  estimatedEur: number;
  href?: string;
  note?: string;
}

export interface SpendOverview {
  total: number;
  actual: number;
  estimated: number;
  fixed: number;
  usage: number;
  aiCount: number;
  byProvider: SpendBar[];
  byModel: SpendBar[];
  /** Spesa a consumo non attribuita a un modello (uso del modello non noto). */
  unattributedModelEur: number;
  bySystem: SpendBar[];
  byTeam: SpendBar[];
  /** AI con un costo reale E uno stimato: lo scarto (spec §7). */
  variance: { id: string; name: string; actual: number; estimated: number; pct: number; source: string; basis: string }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A consumo: AI API o categoria "api" (token); tutto il resto è un abbonamento (fisso). */
export const isUsageBased = (a: Pick<AssetForSavings, "type" | "serviceId" | "name" | "vendor">) => a.type === "AI_API" || categoryOf(a) === "api";

export function buildSpendOverview(assets: AssetForSavings[], estate: EstateData | null, teams: DepartmentSpend[]): SpendOverview {
  let total = 0;
  let actual = 0;
  let estimated = 0;
  let fixed = 0;
  let usage = 0;
  const providers = new Map<string, SpendBar>();
  const systems: SpendBar[] = [];
  for (const a of assets) {
    if (a.type === "MCP_SERVER") continue;
    const m = monthlyOf(a);
    if (!m || m.eur <= 0) continue;
    total += m.eur;
    if (m.estimated) estimated += m.eur;
    else actual += m.eur;
    if (isUsageBased(a)) usage += m.eur;
    else fixed += m.eur;
    const vendor = a.vendor ?? "Unknown";
    const p = providers.get(vendor) ?? { key: vendor, label: vendor, eur: 0, estimatedEur: 0, href: `/estate?q=${encodeURIComponent(vendor)}` };
    p.eur += m.eur;
    if (m.estimated) p.estimatedEur += m.eur;
    providers.set(vendor, p);
    systems.push({ key: a.id, label: a.name, eur: m.eur, estimatedEur: m.estimated ? m.eur : 0, href: `/estate/${a.id}`, note: isUsageBased(a) ? "Usage-based" : "Subscription" });
  }

  // Per modello: costo di ogni AI system ripartito sui modelli che usa (quota d'uso; senza quota, in parti uguali).
  const models = new Map<string, SpendBar>();
  let unattributed = 0;
  for (const r of estate?.rows ?? []) {
    const cost = r.cost.actualEur ?? r.cost.estimatedEur ?? 0;
    if (cost <= 0) continue;
    const isEst = r.cost.actualEur == null;
    if (!r.uses.length) {
      if (r.type === "AI_API") unattributed += cost;
      continue;
    }
    const known = r.uses.filter((u) => u.share != null);
    const sumShare = known.reduce((t, u) => t + (u.share ?? 0), 0);
    for (const u of r.uses) {
      const share = known.length === r.uses.length && sumShare > 0 ? (u.share ?? 0) / sumShare : 1 / r.uses.length;
      const id = u.modelId ?? resolveModel(u.rawModel)?.model.id ?? `raw:${u.rawModel}`;
      const label = modelById(id)?.name ?? u.rawModel;
      const b = models.get(id) ?? { key: id, label, eur: 0, estimatedEur: 0, note: known.length === r.uses.length ? "Split by observed share" : "Split evenly: share not known" };
      b.eur += cost * share;
      if (isEst) b.estimatedEur += cost * share;
      models.set(id, b);
    }
  }

  const sort = (l: SpendBar[]) => l.map((b) => ({ ...b, eur: r2(b.eur), estimatedEur: r2(b.estimatedEur) })).sort((a, b) => b.eur - a.eur || a.label.localeCompare(b.label));
  const variance = (estate?.rows ?? [])
    .filter((r) => r.cost.actualEur != null && r.cost.estimatedEur != null && r.cost.estimatedEur > 0)
    .map((r) => ({ id: r.id, name: r.name, actual: r2(r.cost.actualEur!), estimated: r2(r.cost.estimatedEur!), pct: (r.cost.actualEur! - r.cost.estimatedEur!) / r.cost.estimatedEur!, source: r.cost.actualSource ?? "Billed", basis: r.cost.estimatedBasis ?? "List price" }))
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  return {
    total: r2(total),
    actual: r2(actual),
    estimated: r2(estimated),
    fixed: r2(fixed),
    usage: r2(usage),
    aiCount: systems.length,
    byProvider: sort([...providers.values()]),
    byModel: sort([...models.values()]),
    unattributedModelEur: r2(unattributed),
    bySystem: sort(systems),
    byTeam: sort(teams.filter((t) => t.monthlyEur > 0).map((t) => ({ key: t.department, label: t.department, eur: t.monthlyEur, estimatedEur: 0, note: `${t.people} people · ${t.aiCount} AI` }))),
    variance,
  };
}

export async function loadSpendOverview(orgId: string): Promise<SpendOverview> {
  const [{ assets }, estate, teams] = await Promise.all([computeSavingsCached(orgId), loadEstateCached(orgId).catch(() => null), departmentSpend(orgId).catch(() => [])]);
  return buildSpendOverview(assets, estate, teams);
}

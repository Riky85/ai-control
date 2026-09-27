/**
 * Benchmark anonimo: spesa AI mensile per dipendente, confrontata con aziende
 * simili (stessa fascia di dimensione e, se c'è, stesso settore).
 *
 * Privacy e onestà: le statistiche dei pari si mostrano solo se il gruppo ha
 * almeno MIN_COMPANIES altre aziende; non escono mai nomi né valori singoli,
 * solo mediana e quartili.
 */
import { db } from "@/lib/db";
import { monthlyOf } from "@/lib/savings";

export const MIN_COMPANIES = 5;
const DAY = 86400000;
const CACHE_MS = 10 * 60 * 1000;

export type SizeBand = "1-49" | "50-249" | "250-999" | "1000+";
export type BenchmarkScope = "industry+size" | "size" | "all";

export interface PeerStats {
  median: number;
  p25: number;
  p75: number;
  count: number;
}

export interface Benchmark {
  /** Spesa AI mensile per dipendente di questa azienda (null se mancano dipendenti o costi). */
  yours: number | null;
  peers: PeerStats | null;
  scope: BenchmarkScope;
  minCompanies: number;
  /** Informazioni utili all'interfaccia (mai dati di altre aziende). */
  employeesSet: boolean;
  sizeBand: SizeBand | null;
  industry: string | null;
}

export function sizeBandOf(employees: number): SizeBand {
  if (employees < 50) return "1-49";
  if (employees < 250) return "50-249";
  if (employees < 1000) return "250-999";
  return "1000+";
}

export const SIZE_BAND_LABEL: Record<SizeBand, string> = {
  "1-49": "1–49 employees",
  "50-249": "50–249 employees",
  "250-999": "250–999 employees",
  "1000+": "1,000+ employees",
};

interface OrgPoint {
  orgId: string;
  perEmployee: number;
  band: SizeBand;
  industry: string | null;
}

let cache: { at: number; points: Map<string, OrgPoint> } | null = null;

const normIndustry = (s: string | null | undefined) => (s ?? "").trim().toLowerCase() || null;

/** Spesa mensile per dipendente di ogni azienda con dipendenti impostati e almeno un costo. */
async function loadPoints(): Promise<Map<string, OrgPoint>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.points;
  const orgs = await db.organization.findMany({ where: { employees: { gt: 0 } }, select: { id: true, employees: true, industry: true } });
  const ids = orgs.map((o) => o.id);
  const [assets, records] = ids.length
    ? await Promise.all([
        db.aiAsset.findMany({
          where: { organizationId: { in: ids }, deletedAt: null, status: { not: "UNAPPROVED" } },
          select: { organizationId: true, name: true, vendor: true, serviceId: true, cost: true, usages: { select: { id: true } } },
        }),
        db.spendRecord.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids }, date: { gte: new Date(Date.now() - 90 * DAY) } }, _sum: { amountEur: true } }),
      ])
    : [[], []];

  const byAssets = new Map<string, number>();
  for (const a of assets) {
    const m = monthlyOf(a);
    if (m && m.eur > 0) byAssets.set(a.organizationId, (byAssets.get(a.organizationId) ?? 0) + m.eur);
  }
  const byRecords = new Map(records.map((r) => [r.organizationId, (r._sum.amountEur ?? 0) / 3]));

  const points = new Map<string, OrgPoint>();
  for (const o of orgs) {
    // Prima i costi delle AI (reali o stimati), altrimenti gli addebiti degli ultimi 90 giorni.
    const monthly = byAssets.get(o.id) || byRecords.get(o.id) || 0;
    if (monthly <= 0 || !o.employees) continue;
    points.set(o.id, { orgId: o.id, perEmployee: monthly / o.employees, band: sizeBandOf(o.employees), industry: normIndustry(o.industry) });
  }
  cache = { at: Date.now(), points };
  return points;
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function stats(values: number[]): PeerStats {
  const s = [...values].sort((a, b) => a - b);
  return { median: quantile(s, 0.5), p25: quantile(s, 0.25), p75: quantile(s, 0.75), count: s.length };
}

export async function getBenchmark(orgId: string): Promise<Benchmark> {
  const [org, points] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId }, select: { employees: true, industry: true } }),
    loadPoints(),
  ]);
  const employees = org?.employees && org.employees > 0 ? org.employees : null;
  const band = employees ? sizeBandOf(employees) : null;
  const industry = normIndustry(org?.industry);

  // Il proprio valore si calcola sempre al momento (la cache vale solo per i pari).
  let yours: number | null = null;
  if (employees) {
    const own = await db.aiAsset.findMany({
      where: { organizationId: orgId, deletedAt: null, status: { not: "UNAPPROVED" } },
      select: { name: true, vendor: true, serviceId: true, cost: true, usages: { select: { id: true } } },
    });
    let monthly = own.reduce((t, a) => t + (monthlyOf(a)?.eur ?? 0), 0);
    if (monthly <= 0) {
      const r = await db.spendRecord.aggregate({ where: { organizationId: orgId, date: { gte: new Date(Date.now() - 90 * DAY) } }, _sum: { amountEur: true } });
      monthly = (r._sum.amountEur ?? 0) / 3;
    }
    yours = monthly / employees;
  }

  const others = [...points.values()].filter((p) => p.orgId !== orgId);
  const candidates: { scope: BenchmarkScope; list: OrgPoint[] }[] = [];
  if (band && industry) candidates.push({ scope: "industry+size", list: others.filter((p) => p.band === band && p.industry === industry) });
  if (band) candidates.push({ scope: "size", list: others.filter((p) => p.band === band) });
  candidates.push({ scope: "all", list: others });

  const hit = candidates.find((c) => c.list.length >= MIN_COMPANIES);
  return {
    yours,
    peers: hit ? stats(hit.list.map((p) => p.perEmployee)) : null,
    scope: hit?.scope ?? "all",
    minCompanies: MIN_COMPANIES,
    employeesSet: Boolean(employees),
    sizeBand: band,
    industry: org?.industry?.trim() || null,
  };
}

export function scopeLabel(b: Pick<Benchmark, "scope" | "sizeBand" | "industry">) {
  if (b.scope === "industry+size" && b.industry && b.sizeBand) return `${b.industry} companies with ${SIZE_BAND_LABEL[b.sizeBand]}`;
  if (b.scope === "size" && b.sizeBand) return `companies with ${SIZE_BAND_LABEL[b.sizeBand]}`;
  return "all companies";
}

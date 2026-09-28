/**
 * Board / CFO pack trimestrale: spesa AI e andamento, stima dei prossimi 4
 * trimestri (regressione lineare sugli ultimi 12 mesi di addebiti, sempre
 * etichettata come stima), spesa per dipendente vs benchmark, risparmi
 * realizzati, AI principali, shadow AI, stato AI Act e copertura Edge.
 */
import { db } from "@/lib/db";
import { computeSavings, monthlyOf } from "@/lib/savings";
import { savedSoFar } from "@/lib/savings-ledger";
import { getBenchmark } from "@/lib/benchmark";
import { readiness } from "@/lib/compliance";
import { EDGE } from "@/lib/plans";

const DAY = 86400_000;

export interface Quarter {
  key: string; // "2026-Q3"
  year: number;
  q: number; // 1..4
  from: Date;
  to: Date; // esclusivo
}

export function quarterOf(d: Date): Quarter {
  return makeQuarter(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) + 1);
}

export function makeQuarter(year: number, q: number): Quarter {
  // Normalizza (es. Q0 → Q4 dell'anno prima, Q5 → Q1 del successivo).
  const idx = year * 4 + (q - 1);
  const y = Math.floor(idx / 4);
  const qq = (idx % 4) + 1;
  return { key: `${y}-Q${qq}`, year: y, q: qq, from: new Date(Date.UTC(y, (qq - 1) * 3, 1)), to: new Date(Date.UTC(y, qq * 3, 1)) };
}

export function parseQuarter(s: string | undefined | null): Quarter | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(s ?? "");
  return m ? makeQuarter(Number(m[1]), Number(m[2])) : null;
}

export const shiftQuarter = (q: Quarter, n: number) => makeQuarter(q.year, q.q + n);

/**
 * Regressione lineare (minimi quadrati) su una serie mensile; restituisce i
 * valori stimati per i prossimi `horizon` mesi (mai negativi). Servono almeno
 * 3 mesi, altrimenti null.
 */
export function linearForecast(monthly: number[], horizon: number): { values: number[]; slope: number; intercept: number } | null {
  const n = monthly.length;
  if (n < 3) return null;
  const xm = (n - 1) / 2;
  const ym = monthly.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  monthly.forEach((y, x) => {
    num += (x - xm) * (y - ym);
    den += (x - xm) ** 2;
  });
  const slope = den ? num / den : 0;
  const intercept = ym - slope * xm;
  const values = Array.from({ length: horizon }, (_, i) => Math.max(0, intercept + slope * (n + i)));
  return { values, slope, intercept };
}

export interface QuarterBar {
  key: string;
  label: string;
  eur: number;
  kind: "actual" | "to-date" | "estimate";
}

export async function buildBoardPack(organizationId: string, asked?: string | null, now = new Date()) {
  const current = quarterOf(now);
  const askedQ = parseQuarter(asked);
  const selected = askedQ && askedQ.from <= now && askedQ.from >= shiftQuarter(current, -3).from ? askedQ : current;
  const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1)); // 12 mesi completi prima del mese corrente
  const trendFrom = shiftQuarter(selected, -4).from; // anche lo stesso trimestre dell'anno prima
  const since = trendFrom < firstMonth ? trendFrom : firstMonth;

  const [org, savings, saved, bench, ai, records, edgeSensors, edgeEvents, reviewCount, blockedInUse, newInQuarter] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, employees: true } }),
    computeSavings(organizationId),
    savedSoFar(organizationId).catch(() => null),
    getBenchmark(organizationId),
    readiness(organizationId, now),
    db.spendRecord.findMany({ where: { organizationId, date: { gte: since, lt: now } }, select: { date: true, amountEur: true } }),
    db.edgeSensor.findMany({ where: { organizationId }, select: { lastSeenAt: true, kind: true, device: { select: { id: true } } } }),
    db.edgeEvent.findMany({
      where: { organizationId, day: { gte: new Date(now.getTime() - 6 * DAY).toISOString().slice(0, 10) } },
      select: { client: true, hits: true, blocked: true },
    }),
    db.aiAsset.count({ where: { organizationId, deletedAt: null, status: { in: ["UNKNOWN", "UNREVIEWED"] } } }),
    db.aiAsset.count({ where: { organizationId, deletedAt: null, status: "UNAPPROVED", lastSeenAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
    db.aiAsset.count({ where: { organizationId, deletedAt: null, status: { not: "APPROVED" }, firstSeenAt: { gte: selected.from, lt: selected.to } } }),
  ]);

  // ── Spesa: run rate (costo mensile attuale) e addebiti per mese ──
  const costed = savings.assets
    .map((a) => ({ id: a.id, name: a.name, vendor: a.vendor, m: monthlyOf(a) }))
    .filter((x) => x.m && x.m.eur > 0)
    .sort((x, y) => y.m!.eur - x.m!.eur);
  const monthlyRunRate = costed.reduce((s, x) => s + x.m!.eur, 0);

  const byMonth = new Map<string, number>();
  for (const r of records) {
    const k = r.date.toISOString().slice(0, 7);
    byMonth.set(k, (byMonth.get(k) ?? 0) + r.amountEur);
  }
  const hasCharges = records.length > 0;
  const sumRange = (from: Date, to: Date) => records.filter((r) => r.date >= from && r.date < to).reduce((s, r) => s + r.amountEur, 0);

  // Ultimi 12 mesi completi; si parte dal primo mese con addebiti (gli zeri iniziali falserebbero la retta).
  const series: number[] = [];
  for (let i = 12; i >= 1; i--) series.push(byMonth.get(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7)) ?? 0);
  const start = series.findIndex((v) => v > 0);
  const fitted = start >= 0 ? series.slice(start) : [];
  const reg = linearForecast(fitted, 3 + 12);

  // Trimestri: i 4 che finiscono con quello scelto (reali), poi 4 stimati dopo quello corrente.
  const bars: QuarterBar[] = [];
  for (let i = 3; i >= 0; i--) {
    const q = shiftQuarter(selected, -i);
    const toDate = q.key === current.key;
    bars.push({ key: q.key, label: `Q${q.q} ${q.year}`, eur: hasCharges ? sumRange(q.from, q.to) : 0, kind: toDate ? "to-date" : "actual" });
  }
  // Stima: mesi dal prossimo mese in poi (per il trimestre corrente: reale finora + stima dei mesi mancanti).
  const forecastBars: QuarterBar[] = [];
  const method: "regression" | "run-rate" = reg ? "regression" : "run-rate";
  const monthEstimate = (offset: number) => (reg ? reg.values[offset] : monthlyRunRate); // offset 0 = mese corrente
  let currentQuarterEstimate: number | null = null;
  {
    const monthsLeftInCurrent = 3 - (now.getUTCMonth() % 3); // incluso il mese corrente
    let est = hasCharges ? sumRange(current.from, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))) : 0;
    for (let i = 0; i < monthsLeftInCurrent; i++) est += monthEstimate(i);
    currentQuarterEstimate = est;
    let offset = monthsLeftInCurrent;
    for (let k = 1; k <= 4; k++) {
      const q = shiftQuarter(current, k);
      let eur = 0;
      for (let i = 0; i < 3; i++) eur += monthEstimate(offset++);
      forecastBars.push({ key: q.key, label: `Q${q.q} ${q.year}`, eur, kind: "estimate" });
    }
  }

  const selectedActual = hasCharges ? sumRange(selected.from, selected.to) : null;
  const prevActual = hasCharges ? sumRange(shiftQuarter(selected, -1).from, shiftQuarter(selected, -1).to) : null;
  const yearAgo = hasCharges ? sumRange(shiftQuarter(selected, -4).from, shiftQuarter(selected, -4).to) : null;

  // ── Edge ──
  const onlineSince = new Date(now.getTime() - EDGE.onlineMinutes * 60 * 1000);
  const edgeOnline = edgeSensors.filter((s) => s.lastSeenAt && s.lastSeenAt >= onlineSince && !(s.kind === "device" && !s.device)).length;
  const devices = new Set(edgeEvents.filter((e) => e.client && e.client !== "*").map((e) => e.client)).size;

  return {
    org,
    now,
    current,
    selected,
    quarters: Array.from({ length: 4 }, (_, i) => shiftQuarter(current, -i)),
    spend: {
      monthlyRunRate,
      annualRunRate: monthlyRunRate * 12,
      hasCharges,
      selectedActual,
      prevActual,
      yearAgo,
      bars,
      forecastBars,
      currentQuarterEstimate,
      method,
      fittedMonths: fitted.length,
      slopePerMonth: reg?.slope ?? 0,
      nextYearEstimate: forecastBars.reduce((s, b) => s + b.eur, 0),
    },
    perEmployee: bench,
    savings: {
      identifiedMonthly: savings.totalMonthly,
      realisedMonthly: saved?.verifiedMonthly ?? 0,
      doneMonthly: saved?.doneMonthly ?? 0,
      acceptedMonthly: saved?.acceptedMonthly ?? 0,
      top: savings.items.slice(0, 3).map((s) => ({ title: s.title, monthlyEur: s.monthlyEur })),
    },
    topTools: costed.slice(0, 6).map((x) => ({ name: x.name, vendor: x.vendor, monthlyEur: x.m!.eur, estimated: x.m!.estimated })),
    aiCount: savings.assets.length,
    shadow: { toReview: reviewCount, blockedInUse, newInQuarter },
    aiAct: { score: ai.score, total: ai.total, classified: ai.classified, highRisk: ai.highRisk, missingOwners: ai.missingOwners, literacy: !!ai.literacy, checks: ai.checks },
    edge: {
      sensors: edgeSensors.length,
      online: edgeOnline,
      devices7d: devices,
      queries7d: edgeEvents.reduce((s, e) => s + e.hits, 0),
      blocked7d: edgeEvents.reduce((s, e) => s + e.blocked, 0),
    },
  };
}

export type BoardPack = Awaited<ReturnType<typeof buildBoardPack>>;

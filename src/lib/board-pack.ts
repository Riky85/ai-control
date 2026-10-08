/**
 * Board / CFO pack trimestrale: spesa AI e andamento, stima dei prossimi 4
 * trimestri (regressione lineare sugli ultimi 12 mesi di addebiti, sempre
 * etichettata come stima), spesa per dipendente vs benchmark, risparmi
 * realizzati, AI principali, shadow AI, stato AI Act e copertura Edge.
 *
 * angar Engine: Angar Score (voto, assi, andamento 90 giorni), previsione a
 * 12 mesi (forecastSpend), risparmi verificati sugli addebiti, rischi
 * principali e un riassunto esecutivo di 3 righe scritto in modo
 * deterministico (executiveSummary, niente LLM). Il motore è in sola lettura.
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

// ── angar Engine nel board pack ──────────────────────────────────────────

export interface BoardRisk {
  label: string;
  detail: string;
  severity: "critical" | "warning" | "info";
}

/**
 * Rischi principali: anomalie gravi, AI non consentite ancora in uso e i
 * driver degli indici di rischio e governance (control.ts, fuori dall'angar
 * Score dal metodo 2) che pesano di più. Pura.
 */
export function topRisks(
  input: {
    anomalies: { severity: string; title: string; body: string }[];
    blockedInUse: number;
    drivers: { axis: string; label: string; scoreImpact: number; missingData?: boolean }[];
  },
  n = 5
): BoardRisk[] {
  const out: BoardRisk[] = [];
  if (input.blockedInUse > 0) {
    out.push({ label: `${input.blockedInUse} AI not allowed but still used`, detail: "Seen in the last 30 days despite the policy.", severity: "critical" });
  }
  for (const a of input.anomalies.filter((x) => x.severity === "critical" || x.severity === "warning").slice(0, 3)) {
    out.push({ label: a.title, detail: a.body, severity: a.severity as BoardRisk["severity"] });
  }
  const seen = new Set(out.map((r) => r.label.toLowerCase()));
  const drivers = input.drivers
    .filter((d) => (d.axis === "risk" || d.axis === "governance") && d.scoreImpact < 0 && !d.missingData && !/not allowed but still used/i.test(d.label))
    .sort((a, b) => a.scoreImpact - b.scoreImpact);
  for (const d of drivers) {
    if (seen.has(d.label.toLowerCase())) continue;
    out.push({ label: d.label, detail: `Costs ${Math.abs(Math.round(d.scoreImpact * 10) / 10)} points of the ${d.axis} index.`, severity: d.scoreImpact <= -5 ? "warning" : "info" });
  }
  const order = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, n);
}

export interface SummaryInput {
  aiCount: number;
  monthlyRunRate: number;
  quarterLabel: string;
  quarterSpend: number | null;
  quarterToDate: boolean;
  qoqPct: number | null;
  next12Eur: number | null;
  growthPct: number | null;
  verifiedMonthly: number;
  doneMonthly: number;
  identifiedMonthly: number;
  score: number | null;
  grade: string | null;
  scoreDelta90: number | null;
  topRisk: string | null;
  aiActScore: number;
}

const eur0 = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n))}`;

/** Riassunto esecutivo in 3 righe: spesa e previsione, risparmi, controllo e rischio. Deterministico. */
export function executiveSummary(i: SummaryInput): [string, string, string] {
  const spend =
    (i.monthlyRunRate > 0
      ? `${i.aiCount} AI tools cost ${eur0(i.monthlyRunRate)} a month (${eur0(i.monthlyRunRate * 12)} a year at today's rate)`
      : `${i.aiCount} AI tools in use, no costs recorded yet`) +
    (i.quarterSpend != null ? `; ${i.quarterLabel} charges${i.quarterToDate ? " so far" : ""} ${eur0(i.quarterSpend)}${i.qoqPct != null && !i.quarterToDate ? ` (${signed(i.qoqPct)}% on the previous quarter)` : ""}` : "") +
    (i.next12Eur != null && i.next12Eur > 0 ? `. Forecast for the next 12 months: ${eur0(i.next12Eur)}${i.growthPct != null && Math.abs(i.growthPct) >= 1 ? `, with the run rate ${i.growthPct > 0 ? "rising" : "falling"} ${Math.abs(Math.round(i.growthPct))}%` : ", flat"}.` : ".");
  const savedNow = i.verifiedMonthly + i.doneMonthly;
  const savings =
    savedNow >= 1
      ? `${eur0(savedNow)} a month saved (${eur0(savedNow * 12)} a year)${i.verifiedMonthly >= 1 ? `, ${eur0(i.verifiedMonthly)} of it verified on the charges` : ", confirmed on the next charges"}${i.identifiedMonthly >= 1 ? `; ${eur0(i.identifiedMonthly)} a month more identified.` : "."}`
      : i.identifiedMonthly >= 1
        ? `${eur0(i.identifiedMonthly)} a month of savings identified (${eur0(i.identifiedMonthly * 12)} a year), not yet acted on.`
        : "No waste found in the current AI estate.";
  const control =
    (i.score != null ? `Angar Score ${i.score} (${i.grade})${i.scoreDelta90 != null && Math.abs(i.scoreDelta90) >= 1 ? `, ${signed(i.scoreDelta90)} points in 90 days` : ""}` : `AI Act readiness ${i.aiActScore}%`) +
    (i.topRisk ? `; top risk: ${/^[A-Z][a-z]/.test(i.topRisk) ? i.topRisk.charAt(0).toLowerCase() + i.topRisk.slice(1) : i.topRisk}.` : "; no open high risks.");
  return [spend, savings, control];
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

  // ── angar Engine (sola lettura; ogni parte può mancare senza rompere il pack) ──
  const [{ computeScore, scoreHistory }, { forecastSpend, detectAnomalies }] = await Promise.all([import("@/lib/engine/score"), import("@/lib/engine/forecast")]);
  const [score, history, forecast, anomalies, verifiedRows] = await Promise.all([
    computeScore(organizationId).catch((err) => (console.error("[board-pack] score failed", err), null)),
    scoreHistory(organizationId, 90, now).catch(() => []),
    forecastSpend(organizationId, 12).catch((err) => (console.error("[board-pack] forecast failed", err), null)),
    detectAnomalies(organizationId).catch(() => []),
    db.savingAction.findMany({ where: { organizationId, status: "verified" }, orderBy: { verifiedMonthlyEur: "desc" }, take: 5, select: { title: true, verifiedMonthlyEur: true, expectedMonthlyEur: true, verifiedAt: true } }),
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

  const quarterToDate = selected.key === current.key;
  const qoqPct = selectedActual != null && prevActual ? Math.round(((selectedActual - prevActual) / prevActual) * 100) : null;
  const trend = history.map((p) => ({ day: p.day, score: p.score }));
  const scoreDelta90 = score && trend.length ? score.score - trend[0].score : null;
  // Rischi: indici di controllo (impatto ×0,25 come il peso che avevano nel vecchio punteggio).
  const risks = topRisks({ anomalies, blockedInUse, drivers: (score?.control.drivers ?? []).map((d) => ({ ...d, scoreImpact: Math.round(d.impact * 2.5) / 10 })) });
  const engine = {
    score: score
      ? {
          score: score.score,
          levelLabel: score.levelLabel,
          verdict: score.verdict,
          confidence: score.confidenceLabel,
          savingsMonthlyEur: score.savingsMonthlyEur,
          // Dimensioni misurate (quelle senza dati non hanno un valore da mostrare).
          axes: score.dimensions.map((d) => ({ key: d.axis, label: d.label, value: d.status === "measured" || d.status === "partial" ? d.value : null, levelLabel: d.levelLabel })),
          trend,
          delta90: scoreDelta90,
        }
      : null,
    forecast: forecast
      ? {
          next12Eur: forecast.next12Eur,
          growthPct: forecast.growthPct,
          runRateEur: forecast.runRateEur,
          basis: forecast.growthBasis,
          drivers: forecast.drivers,
          history: forecast.history.slice(-12),
          projection: forecast.projection.slice(0, 12),
        }
      : null,
    verified: verifiedRows.map((r) => ({ title: r.title, monthlyEur: r.verifiedMonthlyEur ?? r.expectedMonthlyEur, verifiedAt: r.verifiedAt })),
    risks,
  };
  const summary = executiveSummary({
    aiCount: savings.assets.length,
    monthlyRunRate,
    quarterLabel: `Q${selected.q} ${selected.year}`,
    quarterSpend: selectedActual,
    quarterToDate,
    qoqPct,
    next12Eur: forecast?.next12Eur ?? null,
    growthPct: forecast?.growthPct ?? null,
    verifiedMonthly: saved?.verifiedMonthly ?? 0,
    doneMonthly: saved?.doneMonthly ?? 0,
    identifiedMonthly: savings.totalMonthly,
    score: score?.score ?? null,
    grade: score?.levelLabel ?? null,
    scoreDelta90,
    topRisk: risks[0]?.label ?? null,
    aiActScore: ai.score,
  });

  return {
    org,
    now,
    engine,
    summary,
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

/**
 * angar Score — "AI spend efficiency" (metodo 2): dal database ai fatti, e
 * storico. Il calcolo vero è in score-model.ts (puro, con la formula
 * documentata); qui si leggono solo i fatti.
 *
 * Deterministico e spiegabile: nessun LLM. Riusa i motori esistenti: risparmi
 * (savings.ts: posti, doppioni, annuale, modelli…), posti attivi (seats.ts),
 * soglie delle anomalie (forecast.ts), Gateway e connettori di fatturazione.
 *
 * Governance e rischio non sono più nel punteggio: restano come indici a
 * parte (control.ts) per la pagina Governance e il report per il board.
 */
import * as React from "react";
import { db } from "@/lib/db";
import { computeSavingsCached, monthlyOf, categoryOf, type Saving } from "@/lib/savings";
import { assessAssetRisk } from "@/lib/risk-engine";
import { SEAT_WINDOW_DAYS, countActive } from "@/lib/seats";
import { vendorRiskFor, planTier, trainsOnYourData } from "@/lib/vendor-risk";
import { PLANS, categoryPlural, type Category } from "@/lib/pricing/catalog";
import { ANOMALY, median } from "@/lib/engine/forecast";
import { AXES, SCORE_METHOD, type Axes } from "@/lib/engine/score-meta";
import { scoreFromFacts, scoreActions, type ScoreFacts, type ScoreResult, type Opportunity, type GrowthItem, type SeatTool } from "@/lib/engine/score-model";
import { controlFromFacts, type ControlFacts, type ControlResult } from "@/lib/engine/control";

const DAY = 86400000;

export { AXES, AXIS_WEIGHT, AXIS_LABEL, AXIS_HINT, LEVEL_LABEL, CONFIDENCE_LABEL, levelOf, verdictOf } from "@/lib/engine/score-meta";
export type { Axis, Axes, Level, ScoreConfidence } from "@/lib/engine/score-meta";
export { scoreFromFacts, scoreActions, applyFix, topImprovement, allocate } from "@/lib/engine/score-model";
export type { ScoreFacts, ScoreResult, Driver, Dimension, ScoreAction, ActionPlan, Fix } from "@/lib/engine/score-model";

/** Risultato completo: punteggio, indici di controllo (fuori dal punteggio) e risparmi totali per la frase. */
export interface FullScore extends ScoreResult {
  control: ControlResult;
  /** Risparmi trovati (savings.ts, stesso totale della pagina Savings). */
  savingsMonthlyEur: number;
}

const SENSITIVE = ["PII", "FINANCIAL", "SOURCE_CODE"];
/** Fatturazione del fornitore o del cloud: spesa a consumo vista alla fonte. */
const BILLING_PROVIDERS = new Set([
  "OPENAI",
  "ANTHROPIC",
  "GOOGLE_GEMINI",
  "MISTRAL",
  "GROQ",
  "COHERE",
  "DEEPSEEK",
  "XAI",
  "TOGETHER",
  "OPENROUTER",
  "HUGGINGFACE",
  "AZURE_OPENAI",
  "AWS_BEDROCK",
  "GOOGLE_VERTEX",
]);

// ── Dal database ai fatti ────────────────────────────────────────────────

export async function loadScoreFacts(orgId: string, now = new Date()): Promise<{ facts: ScoreFacts; control: ControlFacts; savingsMonthlyEur: number }> {
  const t = now.getTime();
  const cutoff = new Date(t - SEAT_WINDOW_DAYS * DAY);
  const [assets, savings, activePolicies, records, devices, connectors, gwNow, gwBefore, seatDone] = await Promise.all([
    db.aiAsset.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: {
        cost: true,
        usages: { select: { id: true, firstSeenAt: true, lastSeenAt: true, userId: true, externalUserRef: true } },
        connectedSystems: true,
        dataAccess: { include: { dataAsset: true } },
        activities: { orderBy: { occurredAt: "desc" }, take: 50 },
      },
    }),
    computeSavingsCached(orgId),
    db.policy.count({ where: { organizationId: orgId, enabled: true } }),
    db.spendRecord.findMany({ where: { organizationId: orgId, date: { gte: new Date(t - 200 * DAY) } }, select: { date: true, amountEur: true, aiAssetId: true, source: true }, orderBy: { date: "asc" } }),
    db.desktopDevice.aggregate({ where: { organizationId: orgId }, _count: { _all: true }, _min: { firstSeenAt: true } }),
    db.connector.findMany({ where: { organizationId: orgId, status: { in: ["CONNECTED", "SYNCING"] }, provider: { notIn: ["JIRA", "SERVICENOW"] } }, select: { provider: true } }),
    db.gatewayRequest.groupBy({ by: ["provider"], where: { organizationId: orgId, createdAt: { gte: new Date(t - 30 * DAY) } }, _sum: { costEur: true }, _count: { _all: true } }),
    db.gatewayRequest.groupBy({ by: ["provider"], where: { organizationId: orgId, createdAt: { gte: new Date(t - 60 * DAY), lt: new Date(t - 30 * DAY) } }, _sum: { costEur: true } }),
    // Posti tolti segnati "fatti" nel registro dei risparmi (il numero di posti si aggiorna solo col prossimo addebito).
    db.savingAction.findMany({ where: { organizationId: orgId, status: { in: ["done", "verified"] }, savingKey: { startsWith: "seats:" } }, select: { savingKey: true, expectedMonthlyEur: true, doneAt: true } }),
  ]);
  const anyRecords = await db.spendRecord.groupBy({ by: ["source"], where: { organizationId: orgId }, _count: { _all: true } });

  const providers = new Set(connectors.map((c) => c.provider as string));
  const recent = (d: Date | null | undefined) => !!d && d.getTime() >= cutoff.getTime();
  const active = assets.filter((a) => a.status !== "UNAPPROVED");

  // ── Spesa, stime, responsabili, consumo ──
  let spend = 0;
  let estimated = 0;
  let estimatedCount = 0;
  let owned = 0;
  let unowned = 0;
  let consumption = 0;
  let shadow = 0;
  let trainsOnData = 0;
  const bases = new Set<string>();
  const apiIds = new Set<string>();
  const monthly = new Map<string, number>();
  for (const a of active) {
    // I server MCP non sono AI a pagamento: fuori da spesa, account personali e addestramento sui dati.
    if (a.type === "MCP_SERVER") continue;
    const m = monthlyOf(a);
    const plan = a.cost?.planId ? PLANS.find((p) => p.id === a.cost!.planId) : undefined;
    const tier = planTier({ type: a.type, planBusiness: plan ? plan.business : null, paidByCompany: !!m && m.eur > 0 && !m.estimated });
    if (trainsOnYourData(vendorRiskFor(a), tier) === "yes") trainsOnData += 1;
    if (!m || m.eur <= 0) {
      shadow += 1;
      continue;
    }
    monthly.set(a.id, m.eur);
    if (a.cost?.basis) bases.add(a.cost.basis);
    spend += m.eur;
    if (m.estimated) {
      estimated += m.eur;
      estimatedCount += 1;
    }
    if (a.ownerId) owned += m.eur;
    else unowned += 1;
    if (a.type === "AI_API" || categoryOf(a) === "api") {
      consumption += m.eur;
      apiIds.add(a.id);
    }
  }

  // ── Posti: AI a posti con prezzo noto; posti tolti e segnati fatti dopo l'ultimo aggiornamento del costo ──
  const removedSeats = new Map<string, { eur: number; at: Date }[]>();
  for (const r of seatDone) {
    const id = r.savingKey!.slice("seats:".length);
    if (r.doneAt) removedSeats.set(id, [...(removedSeats.get(id) ?? []), { eur: r.expectedMonthlyEur, at: r.doneAt }]);
  }
  const seatTools: SeatTool[] = [];
  let removedEur = 0;
  for (const a of active) {
    const m = monthly.get(a.id);
    const seats = a.cost?.seats && a.cost.seats > 0 ? a.cost.seats : null;
    if (!m || !seats || apiIds.has(a.id)) continue;
    const seatEur = m / seats;
    let paid = seats;
    for (const r of removedSeats.get(a.id) ?? []) {
      if (a.cost && r.at.getTime() <= a.cost.updatedAt.getTime()) continue; // già nel costo aggiornato
      const n = Math.min(paid, Math.round(r.eur / seatEur));
      paid -= n;
      removedEur += n * seatEur;
    }
    if (paid <= 0) continue;
    seatTools.push({ assetId: a.id, name: a.name, paidSeats: paid, activeSeats: countActive(a.usages, SEAT_WINDOW_DAYS, t), knownPeople: a.usages.length, seatEur: Math.round(seatEur * 100) / 100 });
  }
  spend = Math.max(0, spend - removedEur);

  // ── Risparmi trovati (anche quelli accettati ma non ancora fatti) ──
  const byId = new Map(assets.map((a) => [a.id, a]));
  const activeKey = (u: { userId: string | null; externalUserRef: string | null; id: string }) => u.userId ?? u.externalUserRef ?? u.id;
  const toOpp = (s: Saving, inProgress: boolean): Opportunity => {
    const ids = s.assets.map((x) => x.id);
    let overlap: number | null = null;
    if (s.kind === "duplicate") {
      const count = new Map<string, number>();
      let known = false;
      for (const id of ids)
        for (const u of byId.get(id)?.usages ?? []) {
          known = true;
          if (recent(u.lastSeenAt)) count.set(activeKey(u), (count.get(activeKey(u)) ?? 0) + 1);
        }
      overlap = known ? [...count.values()].filter((n) => n >= 2).length : null;
    }
    const cat = s.kind === "duplicate" ? (s.key.split(":")[1] as Category) : null;
    return {
      key: s.key,
      kind: s.kind,
      title: s.title,
      detail: s.detail,
      monthlyEur: Math.round(s.monthlyEur * 100) / 100,
      confidence: s.confidence,
      href: s.href,
      assetIds: ids,
      assetNames: s.assets.map((x) => x.name),
      assetMonthlyEur: ids.map((id) => Math.round((monthly.get(id) ?? 0) * 100) / 100),
      ...(cat ? { label: categoryPlural(cat) } : {}),
      ...(s.kind === "duplicate" ? { overlapPeople: overlap } : {}),
      ...(inProgress ? { inProgress: true } : {}),
    };
  };
  const seen = new Set<string>();
  const opportunities: Opportunity[] = [];
  for (const s of savings.items) if (!seen.has(s.key) && seen.add(s.key)) opportunities.push(toOpp(s, false));
  for (const s of savings.inProgress ?? []) if (!seen.has(s.key) && seen.add(s.key)) opportunities.push(toOpp(s, true));

  // ── Addebiti: fonti e quota attribuita a un'AI nota (ultimi 90 giorni) ──
  const sourceSeen = new Set(anyRecords.map((r) => r.source));
  const last90 = records.filter((r) => r.date.getTime() >= t - 90 * DAY);
  const total90 = last90.reduce((s, r) => s + Math.max(0, r.amountEur), 0);
  const attributed90 = last90.filter((r) => r.aiAssetId).reduce((s, r) => s + Math.max(0, r.amountEur), 0);
  const unclassified = last90.filter((r) => !r.aiAssetId && r.amountEur > 0).length;

  // ── Consumo: crescita sopra l'atteso (stesse soglie degli avvisi di anomalia) ──
  const growth: GrowthItem[] = [];
  const charges = new Map<string, { date: Date; eur: number }[]>();
  for (const r of records) if (r.aiAssetId && apiIds.has(r.aiAssetId) && r.amountEur > 0) charges.set(r.aiAssetId, [...(charges.get(r.aiAssetId) ?? []), { date: r.date, eur: r.amountEur }]);
  let apiChargeHistory = false;
  for (const [id, c] of charges) {
    if (c.length >= 3) apiChargeHistory = true;
    if (c.length < 3) continue;
    const last = c[c.length - 1];
    const ref = median(c.slice(-4, -1).map((x) => x.eur));
    if (t - last.date.getTime() <= ANOMALY.recentChargeDays * DAY && ref > 0 && (last.eur - ref) / ref > ANOMALY.priceJump && last.eur - ref >= ANOMALY.priceMinEur)
      growth.push({ key: `charge:${id}`, assetId: id, name: byId.get(id)?.name ?? "API", currentEur: Math.round(last.eur * 100) / 100, expectedEur: Math.round(ref * 100) / 100, href: `/assets/${id}?tab=spend` });
  }
  const gwPrev = new Map(gwBefore.map((g) => [g.provider, g._sum.costEur ?? 0]));
  let gwSpend = 0;
  for (const g of gwNow) {
    const cur = g._sum.costEur ?? 0;
    gwSpend += cur;
    const prev = gwPrev.get(g.provider) ?? 0;
    // Gateway: ultimi 30 giorni contro i 30 precedenti, oltre +50% e almeno €20.
    if (prev > 0 && cur / prev - 1 > 0.5 && cur - prev >= 20)
      growth.push({ key: `gateway:${g.provider}`, assetId: null, name: `${g.provider} through the Gateway`, currentEur: Math.round(cur * 100) / 100, expectedEur: Math.round(prev * 100) / 100, href: "/gateway" });
  }
  const gwTraffic = gwNow.some((g) => g._count._all > 0);
  const billing = [...providers].some((p) => BILLING_PROVIDERS.has(p)) || bases.has("billing_connector") || gwTraffic;
  const consumptionSpend = consumption > 0 ? consumption : gwSpend;

  // ── Uso: da quanto tempo angar lo misura ──
  let firstUse: number | null = devices._min.firstSeenAt ? devices._min.firstSeenAt.getTime() : null;
  let anyUsage = false;
  for (const a of assets)
    for (const u of a.usages) {
      if (!u.lastSeenAt) continue;
      anyUsage = true;
      const f = u.firstSeenAt.getTime();
      if (firstUse == null || f < firstUse) firstUse = f;
    }
  const usageKnown = anyUsage || devices._count._all > 0;

  const facts: ScoreFacts = {
    aiCount: assets.length,
    monthlySpendEur: Math.round(spend * 100) / 100,
    costKnown: spend > 0 || sourceSeen.size > 0,
    estimatedShare: spend > 0 ? Math.min(1, estimated / spend) : 0,
    estimatedCount,
    classifiedShare: total90 > 0 ? attributed90 / total90 : null,
    unclassifiedCharges: unclassified,
    ownedShare: spend > 0 ? Math.min(1, owned / (spend + removedEur)) : 1,
    unownedCount: unowned,
    sources: {
      bank: sourceSeen.has("bank") || providers.has("BANK") || providers.has("ACCOUNTING") || bases.has("bank"),
      invoices: sourceSeen.has("invoice") || providers.has("FATTURE_IN_CLOUD") || bases.has("invoice"),
      billing,
      billingNeeded: consumptionSpend > 0,
      usage: usageKnown,
    },
    subscriptionSpendEur: Math.max(0, Math.round((spend - consumption) * 100) / 100),
    seatTools,
    opportunities,
    consumption: { measured: consumptionSpend > 0 && (billing || apiChargeHistory), spendEur: Math.round(consumptionSpend * 100) / 100, growth },
    usageDays: usageKnown && firstUse != null ? Math.max(0, Math.floor((t - firstUse) / DAY)) : usageKnown ? 0 : null,
  };

  // ── Indici di controllo (fuori dal punteggio) ──
  const control: ControlFacts = {
    aiCount: assets.length,
    activeAiCount: active.length,
    costKnown: facts.costKnown,
    reviewedCount: assets.filter((a) => a.status === "APPROVED" || a.status === "UNAPPROVED").length,
    ownedCount: active.filter((a) => a.ownerId).length,
    tieredCount: active.filter((a) => a.euAiActTier !== "UNCLASSIFIED").length,
    activePolicies,
    unapprovedInUse: assets.filter((a) => a.status === "UNAPPROVED" && (recent(a.lastSeenAt) || a.usages.some((u) => recent(u.lastSeenAt)) || recent(a.activities[0]?.occurredAt))).length,
    highRiskCount: active.filter((a) => {
      const r = assessAssetRisk(a);
      return r.level === "HIGH" || r.level === "CRITICAL";
    }).length,
    sensitiveExposed: assets.filter((a) => a.status !== "APPROVED" && a.dataAccess.some((x) => SENSITIVE.includes(x.dataAsset.sensitivity))).length,
    shadowCount: shadow,
    trainsOnDataCount: trainsOnData,
  };
  return { facts, control, savingsMonthlyEur: savings.totalMonthly };
}

export async function computeScore(orgId: string): Promise<FullScore> {
  const { facts, control, savingsMonthlyEur } = await loadScoreFacts(orgId);
  return { ...scoreFromFacts(facts), control: controlFromFacts(control), savingsMonthlyEur };
}

/** computeScore una volta sola per richiesta (fuori da React: funzione normale). */
const reactCache = (React as { cache?: <T extends (...a: never[]) => unknown>(fn: T) => T }).cache;
export const computeScoreCached = reactCache ? reactCache(computeScore) : computeScore;

// ── Storico ─────────────────────────────────────────────────────────────

/** Giorno AAAA-MM-GG all'ora di Roma. */
export function romeDay(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}`;
}

/** Salva (o aggiorna) la fotografia di oggi, con la versione del metodo. `result` evita di ricalcolare. */
export async function recordScoreSnapshot(orgId: string, now = new Date(), result?: ScoreResult) {
  const r = result ?? (await computeScore(orgId));
  const day = romeDay(now);
  const data = {
    score: r.score,
    axes: { v: SCORE_METHOD, ...r.axes, confidence: r.confidence },
    monthlySpendEur: r.facts.costKnown ? Math.round(r.facts.monthlySpendEur * 100) / 100 : null,
    wasteMonthlyEur: r.facts.costKnown ? Math.round(r.facts.opportunities.reduce((s, o) => s + o.monthlyEur, 0) * 100) / 100 : null,
  };
  await db.engineSnapshot.upsert({
    where: { organizationId_day: { organizationId: orgId, day } },
    create: { organizationId: orgId, day, ...data },
    update: data,
  });
  return r;
}

export interface ScorePoint {
  day: string;
  score: number;
  /** null per le fotografie del metodo precedente (assi diversi). */
  axes: Axes | null;
  method: number;
  monthlySpendEur: number | null;
}

/** Fotografie dal database; le vecchie (metodo 1, assi efficiency/governance/risk/adoption) restano col solo totale. */
export async function scoreHistoryAll(orgId: string, days = 90, now = new Date()): Promise<ScorePoint[]> {
  const from = romeDay(new Date(now.getTime() - days * DAY));
  const rows = await db.engineSnapshot.findMany({
    where: { organizationId: orgId, day: { gte: from } },
    orderBy: { day: "asc" },
    select: { day: true, score: true, axes: true, monthlySpendEur: true },
  });
  return rows.map((r) => {
    const a = (r.axes ?? {}) as Record<string, unknown>;
    const method = typeof a.v === "number" ? a.v : 1;
    const axes = method === SCORE_METHOD ? (Object.fromEntries(AXES.map((k) => [k, typeof a[k] === "number" ? (a[k] as number) : null])) as Axes) : null;
    return { day: r.day, score: r.score, axes, method, monthlySpendEur: r.monthlySpendEur };
  });
}

/** Solo le fotografie del metodo attuale: le uniche confrontabili col punteggio di oggi. */
export async function scoreHistory(orgId: string, days = 90, now = new Date()): Promise<ScorePoint[]> {
  return (await scoreHistoryAll(orgId, days, now)).filter((p) => p.method === SCORE_METHOD);
}

/**
 * "What changed": dopo l'ultima azione di risparmio fatta, punteggio prima →
 * adesso e risparmio realizzato. Solo con una fotografia vera di prima
 * dell'azione: altrimenti null (nessun numero inventato).
 */
export async function whatChanged(orgId: string, current: { score: number; monthlySpendEur: number }, history?: ScorePoint[]) {
  const done = await db.savingAction.findMany({
    where: { organizationId: orgId, status: { in: ["done", "verified"] }, doneAt: { not: null } },
    orderBy: { doneAt: "desc" },
    take: 200,
    select: { doneAt: true, expectedMonthlyEur: true, verifiedMonthlyEur: true, status: true, kind: true, title: true },
  });
  if (!done.length) return null;
  const points = history ?? (await scoreHistory(orgId, 180));
  const lastDay = romeDay(done[0].doneAt!);
  const before = [...points].reverse().find((p) => p.day < lastDay);
  if (!before) return null;
  const since = done.filter((d) => romeDay(d.doneAt!) > before.day);
  const saved = since.reduce((s, d) => s + (d.status === "verified" ? d.verifiedMonthlyEur ?? d.expectedMonthlyEur : d.expectedMonthlyEur), 0);
  const seats = since.filter((d) => d.kind === "seat_removed").length;
  return {
    from: before.score,
    to: current.score,
    since: before.day,
    savedMonthlyEur: Math.round(saved * 100) / 100,
    actions: since.length,
    seatActions: seats,
    spendFrom: before.monthlySpendEur,
    spendTo: Math.round(current.monthlySpendEur * 100) / 100,
  };
}

/** Il piano d'azione per l'azienda (stesse azioni di /score/improve). */
export async function computeActionPlan(orgId: string) {
  const r = await computeScoreCached(orgId);
  return { result: r, plan: scoreActions(r.facts, r) };
}

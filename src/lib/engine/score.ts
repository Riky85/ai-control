/**
 * angar Score — il "credit score" del parco AI di un'azienda (0–100, voto A–E).
 *
 * Deterministico e spiegabile: si calcola solo da fatti nel database, mai da
 * un LLM. Ogni asse parte da 100 e ogni punto perso (o recuperato) è un
 * "driver" con etichetta e link per sistemarlo: la somma dei driver di un asse
 * dà esattamente il suo valore. Dove mancano i dati l'asse vale 50 (neutro),
 * con un driver che dice cosa collegare, e la confidenza scende.
 *
 * Assi (più alto = meglio):
 *  - efficiency  (30%) spreco trovato dal motore dei risparmi rispetto alla spesa, bonus per i risparmi verificati
 *  - governance  (25%) AI revisionate, con un responsabile, classificate AI Act, policy attive
 *  - risk        (25%) AI non consentite ancora in uso, AI ad alto rischio, dati sensibili, AI non pagate dall'azienda,
 *                      AI il cui fornitore addestra i modelli sui vostri dati di default (vendor-risk.ts)
 *  - adoption    (20%) persone che usano AI approvate negli ultimi 30 giorni, quota d'uso su AI approvate
 */
import * as React from "react";
import { db } from "@/lib/db";
import { computeSavingsCached, monthlyOf, type Saving } from "@/lib/savings";
import { assessAssetRisk } from "@/lib/risk-engine";
import { SEAT_WINDOW_DAYS } from "@/lib/seats";
import { vendorRiskFor, planTier, trainsOnYourData } from "@/lib/vendor-risk";
import { PLANS } from "@/lib/pricing/catalog";
import { AXES, AXIS_WEIGHT, NEUTRAL, GRADE_VERDICT, gradeOf, type Axis, type Axes, type Grade, type ScoreConfidence } from "@/lib/engine/score-meta";

const DAY = 86400000;

export { AXES, AXIS_WEIGHT, AXIS_LABEL, NEUTRAL, GRADE_VERDICT, gradeOf } from "@/lib/engine/score-meta";
export type { Axis, Axes, Grade, ScoreConfidence } from "@/lib/engine/score-meta";

export interface Driver {
  axis: Axis;
  label: string;
  /** Punti sull'asse (con segno): negativo = persi, positivo = recuperati. */
  impact: number;
  /** Stesso driver pesato sul punteggio totale (con segno, un decimale). */
  scoreImpact: number;
  href: string;
  /** true = manca il dato, non è un problema dell'azienda. */
  missingData?: boolean;
}

/** Fatti già letti dal database: l'unico input del calcolo (funzione pura). */
export interface ScoreFacts {
  aiCount: number;
  /** AI non respinte (tutte tranne "Not allowed"). */
  activeAiCount: number;
  monthlySpendEur: number;
  /** C'è almeno un costo reale (estratto conto, fatture, connettore) o una stima. */
  costKnown: boolean;
  /** Parte della spesa stimata da listino (0..1). */
  estimatedShare: number;
  wasteMonthlyEur: number;
  wasteByKind: { kind: Saving["kind"]; eur: number }[];
  verifiedMonthlyEur: number;
  reviewedCount: number;
  ownedCount: number;
  tieredCount: number;
  activePolicies: number;
  unapprovedInUse: number;
  highRiskCount: number;
  sensitiveExposed: number;
  shadowCount: number;
  /** AI in uso il cui fornitore addestra sui dati di default, col piano in uso (facoltativo: 0 se assente). */
  trainsOnDataCount?: number;
  usageKnown: boolean;
  activePeople: number;
  activeApprovedPeople: number;
  peopleBase: number;
  approvedUseRows: number;
  allUseRows: number;
  sources: { costs: boolean; usage: boolean; discovery: boolean; employees: boolean };
}

export interface ScoreResult {
  score: number;
  grade: Grade;
  verdict: string;
  axes: Axes;
  drivers: Driver[];
  facts: ScoreFacts & { reviewedPct: number; ownedPct: number };
  confidence: ScoreConfidence;
  /** Cosa collegare per alzare la confidenza. */
  gaps: { label: string; href: string }[];
}

// ── Funzioni pure ─────────────────────────────────────────────────────────

const WASTE_LABEL: Record<Saving["kind"], string> = {
  seats: "unused seats",
  duplicate: "tools that do the same job",
  annual: "monthly billing (yearly is cheaper)",
  premium: "premium plans few people need",
  model: "oversized API models",
  idle: "AI nobody uses",
  alternative: "pricier options than needed",
};

const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Ripartisce `total` punti interi in proporzione ai pesi (resto più grande), così la somma torna esatta. */
export function splitPoints(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!sum || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (w / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((s, n) => s + n, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

type RawDriver = Omit<Driver, "scoreImpact">;

function efficiency(f: ScoreFacts): RawDriver[] {
  const d: RawDriver[] = [];
  if (!f.costKnown || f.monthlySpendEur <= 0)
    return [{ axis: "efficiency", label: "Add costs to measure efficiency", impact: -NEUTRAL, href: "/sources", missingData: true }];
  // Spreco: 1 punto ogni 0,625% della spesa (25% di spreco = −40), massimo −80.
  const share = Math.min(1, f.wasteMonthlyEur / f.monthlySpendEur);
  const penalty = Math.min(80, Math.round(share * 160));
  const kinds = f.wasteByKind.filter((k) => k.eur > 0).sort((a, b) => b.eur - a.eur);
  const parts = splitPoints(penalty, kinds.map((k) => k.eur));
  kinds.forEach((k, i) => {
    if (parts[i] > 0) d.push({ axis: "efficiency", label: `${eur(k.eur)} a month on ${WASTE_LABEL[k.kind]}`, impact: -parts[i], href: "/savings" });
  });
  // Risparmi verificati: recuperano fino a 15 punti (mai oltre quanto perso).
  if (f.verifiedMonthlyEur > 0 && penalty > 0) {
    const bonus = Math.min(penalty, 15, Math.round((f.verifiedMonthlyEur / f.monthlySpendEur) * 100));
    if (bonus > 0) d.push({ axis: "efficiency", label: `${eur(f.verifiedMonthlyEur)} a month saved and verified`, impact: bonus, href: "/savings" });
  }
  return d;
}

function governance(f: ScoreFacts): RawDriver[] {
  const d: RawDriver[] = [];
  if (f.aiCount === 0) return [{ axis: "governance", label: "No AI found yet", impact: -NEUTRAL, href: "/connect", missingData: true }];
  const toReview = f.aiCount - f.reviewedCount;
  const p1 = Math.round(40 * (toReview / f.aiCount));
  if (p1 > 0) d.push({ axis: "governance", label: `${plural(toReview, "AI", "AI")} not reviewed yet`, impact: -p1, href: "/review" });
  if (f.activeAiCount > 0) {
    const noOwner = f.activeAiCount - f.ownedCount;
    const p2 = Math.round(25 * (noOwner / f.activeAiCount));
    if (p2 > 0) d.push({ axis: "governance", label: `${plural(noOwner, "AI", "AI")} without an owner`, impact: -p2, href: "/governance" });
    const noTier = f.activeAiCount - f.tieredCount;
    const p3 = Math.round(20 * (noTier / f.activeAiCount));
    if (p3 > 0) d.push({ axis: "governance", label: `${plural(noTier, "AI", "AI")} without an AI Act class`, impact: -p3, href: "/compliance" });
  }
  if (f.activePolicies === 0) d.push({ axis: "governance", label: "No AI policy active", impact: -15, href: "/policies" });
  else if (f.activePolicies === 1) d.push({ axis: "governance", label: "Only one AI policy active", impact: -5, href: "/policies" });
  return d;
}

function risk(f: ScoreFacts): RawDriver[] {
  const d: RawDriver[] = [];
  if (f.aiCount === 0) return [{ axis: "risk", label: "No AI found yet", impact: -NEUTRAL, href: "/connect", missingData: true }];
  if (f.unapprovedInUse > 0)
    d.push({ axis: "risk", label: `${plural(f.unapprovedInUse, "AI", "AI")} not allowed but still used`, impact: -Math.min(35, f.unapprovedInUse * 12), href: "/?status=UNAPPROVED#your-ai" });
  if (f.highRiskCount > 0)
    d.push({ axis: "risk", label: `${plural(f.highRiskCount, "AI", "AI")} at high risk`, impact: -Math.min(25, Math.max(3, Math.round(50 * (f.highRiskCount / f.aiCount)))), href: "/governance" });
  if (f.sensitiveExposed > 0)
    d.push({ axis: "risk", label: `${plural(f.sensitiveExposed, "AI", "AI")} reach sensitive data without approval`, impact: -Math.min(20, f.sensitiveExposed * 7), href: "/data" });
  // Le AI non pagate dall'azienda contano solo se angar conosce i costi (altrimenti tutto sembrerebbe "non pagato").
  if (f.costKnown && f.shadowCount > 0 && f.activeAiCount > 0) {
    const p = Math.min(20, Math.round(40 * (f.shadowCount / f.activeAiCount)));
    if (p > 0) d.push({ axis: "risk", label: `${plural(f.shadowCount, "AI", "AI")} on personal or free accounts`, impact: -p, href: "/?paid=no#your-ai" });
  }
  // Fornitori che addestrano sui vostri dati di default: −3 per AI, massimo −9, mai oltre lo spazio rimasto sull'asse
  // (così la somma dei driver resta uguale al valore dell'asse, che non scende sotto 0).
  const trains = f.trainsOnDataCount ?? 0;
  if (trains > 0) {
    const used = -d.reduce((s, x) => s + x.impact, 0);
    const p = Math.min(9, trains * 3, 100 - used);
    if (p > 0) d.push({ axis: "risk", label: `${plural(trains, "AI", "AI")} in use ${trains === 1 ? "trains" : "train"} on your data by default`, impact: -p, href: "/governance#vendor-risk" });
  }
  return d;
}

function adoption(f: ScoreFacts): RawDriver[] {
  const d: RawDriver[] = [];
  if (!f.usageKnown) return [{ axis: "adoption", label: "Connect the desktop app to measure adoption", impact: -NEUTRAL, href: "/connect", missingData: true }];
  // Portata: obiettivo pieno = metà delle persone attive su AI approvate negli ultimi 30 giorni.
  const base = Math.max(f.peopleBase, f.activePeople, 1);
  const reach = f.activeApprovedPeople / base;
  const p1 = Math.round(60 * (1 - Math.min(1, reach / 0.5)));
  if (p1 > 0) d.push({ axis: "adoption", label: `${f.activeApprovedPeople} of ${base} people use approved AI`, impact: -p1, href: "/usage" });
  if (f.allUseRows > 0) {
    const off = 1 - f.approvedUseRows / f.allUseRows;
    const p2 = Math.round(40 * off);
    if (p2 > 0) d.push({ axis: "adoption", label: `${Math.round(off * 100)}% of AI use is on AI not approved`, impact: -p2, href: "/review" });
  }
  return d;
}

/** Il calcolo intero, dai fatti al voto. Pura: stessi fatti, stesso risultato. */
export function scoreFromFacts(f: ScoreFacts): ScoreResult {
  const raw = [...efficiency(f), ...governance(f), ...risk(f), ...adoption(f)];
  const axes = Object.fromEntries(AXES.map((a) => [a, clamp(100 + raw.filter((d) => d.axis === a).reduce((s, d) => s + d.impact, 0))])) as Axes;
  const score = Math.round(AXES.reduce((s, a) => s + axes[a] * AXIS_WEIGHT[a], 0));
  const drivers: Driver[] = raw
    .map((d) => ({ ...d, scoreImpact: Math.round(d.impact * AXIS_WEIGHT[d.axis] * 10) / 10 }))
    .sort((a, b) => a.scoreImpact - b.scoreImpact);
  const grade = gradeOf(score);

  // Confidenza: quante fonti ha angar, e quanti assi sono misurati davvero.
  const s = f.sources;
  const signals = [s.costs, s.usage, s.discovery, s.employees].filter(Boolean).length;
  const neutralAxes = drivers.filter((d) => d.missingData).length;
  const confidence: ScoreConfidence =
    s.costs && s.usage && signals >= 3 && neutralAxes === 0 && f.estimatedShare < 0.5 ? "high" : signals >= 2 && neutralAxes <= 1 ? "medium" : "low";
  const gaps: ScoreResult["gaps"] = [];
  if (!s.costs) gaps.push({ label: "Add a bank statement or invoices", href: "/sources" });
  if (!s.usage) gaps.push({ label: "Install the desktop app", href: "/download" });
  if (!s.discovery && s.usage) gaps.push({ label: "Turn on AI discovery", href: "/connect" });
  if (!s.employees) gaps.push({ label: "Set the number of employees", href: "/settings" });

  return {
    score,
    grade,
    verdict: GRADE_VERDICT[grade],
    axes,
    drivers,
    facts: {
      ...f,
      reviewedPct: f.aiCount ? Math.round((f.reviewedCount / f.aiCount) * 100) : 0,
      ownedPct: f.activeAiCount ? Math.round((f.ownedCount / f.activeAiCount) * 100) : 0,
    },
    confidence,
    gaps,
  };
}

/** Il driver che fa guadagnare più punti al totale (esclusi i recuperi già fatti). */
export function topImprovement(r: Pick<ScoreResult, "drivers">): Driver | null {
  return r.drivers.filter((d) => d.impact < 0).sort((a, b) => a.scoreImpact - b.scoreImpact)[0] ?? null;
}

// ── Dal database ai fatti ────────────────────────────────────────────────

const SENSITIVE = ["PII", "FINANCIAL", "SOURCE_CODE"];

export async function loadScoreFacts(orgId: string, now = new Date()): Promise<ScoreFacts> {
  const cutoff = new Date(now.getTime() - SEAT_WINDOW_DAYS * DAY);
  const [org, assets, savings, verified, activePolicies, knownUsers, spendCount, devices, connectors] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId }, select: { employees: true } }),
    db.aiAsset.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: {
        cost: true,
        usages: { select: { id: true, lastSeenAt: true, userId: true, externalUserRef: true } },
        connectedSystems: true,
        dataAccess: { include: { dataAsset: true } },
        activities: { orderBy: { occurredAt: "desc" }, take: 50 },
      },
    }),
    computeSavingsCached(orgId),
    db.savingAction.aggregate({ where: { organizationId: orgId, status: "verified" }, _sum: { verifiedMonthlyEur: true } }),
    db.policy.count({ where: { organizationId: orgId, enabled: true } }),
    db.user.count({ where: { organizationId: orgId } }),
    db.spendRecord.count({ where: { organizationId: orgId } }),
    db.desktopDevice.count({ where: { organizationId: orgId } }),
    db.connector.findMany({ where: { organizationId: orgId, status: { in: ["CONNECTED", "SYNCING"] }, provider: { notIn: ["JIRA", "SERVICENOW"] } }, select: { provider: true } }),
  ]);

  const active = assets.filter((a) => a.status !== "UNAPPROVED");
  let spend = 0;
  let estimated = 0;
  let realCost = false;
  let shadow = 0;
  let trainsOnData = 0;
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
    spend += m.eur;
    if (m.estimated) estimated += m.eur;
    else realCost = true;
  }

  const recent = (d: Date | null | undefined) => !!d && d.getTime() >= cutoff.getTime();
  const unapprovedInUse = assets.filter(
    (a) => a.status === "UNAPPROVED" && (recent(a.lastSeenAt) || a.usages.some((u) => recent(u.lastSeenAt)) || recent(a.activities[0]?.occurredAt))
  ).length;
  const highRiskCount = active.filter((a) => {
    const r = assessAssetRisk(a);
    return r.level === "HIGH" || r.level === "CRITICAL";
  }).length;
  const sensitiveExposed = assets.filter((a) => a.status !== "APPROVED" && a.dataAccess.some((x) => SENSITIVE.includes(x.dataAsset.sensitivity))).length;

  // Persone attive (30 giorni): chiave = utente noto, altrimenti riferimento esterno.
  const people = new Set<string>();
  const approvedPeople = new Set<string>();
  let allUseRows = 0;
  let approvedUseRows = 0;
  let anyUsage = false;
  for (const a of assets) {
    for (const u of a.usages) {
      if (u.lastSeenAt) anyUsage = true;
      if (!recent(u.lastSeenAt)) continue;
      const who = u.userId ?? u.externalUserRef ?? u.id;
      allUseRows += 1;
      people.add(who);
      if (a.status === "APPROVED") {
        approvedUseRows += 1;
        approvedPeople.add(who);
      }
    }
  }

  const providers = new Set(connectors.map((c) => c.provider));
  const usageKnown = anyUsage || devices > 0;
  const employees = org?.employees && org.employees > 0 ? org.employees : null;

  return {
    aiCount: assets.length,
    activeAiCount: active.length,
    monthlySpendEur: spend,
    costKnown: spend > 0 || spendCount > 0,
    estimatedShare: spend > 0 ? estimated / spend : 0,
    wasteMonthlyEur: savings.totalMonthly,
    wasteByKind: [...savings.byKind].map(([kind, v]) => ({ kind, eur: v.monthly })),
    verifiedMonthlyEur: verified._sum.verifiedMonthlyEur ?? 0,
    reviewedCount: assets.filter((a) => a.status === "APPROVED" || a.status === "UNAPPROVED").length,
    ownedCount: active.filter((a) => a.ownerId).length,
    tieredCount: active.filter((a) => a.euAiActTier !== "UNCLASSIFIED").length,
    activePolicies,
    unapprovedInUse,
    highRiskCount,
    sensitiveExposed,
    shadowCount: shadow,
    trainsOnDataCount: trainsOnData,
    usageKnown,
    activePeople: people.size,
    activeApprovedPeople: approvedPeople.size,
    peopleBase: employees ?? knownUsers,
    approvedUseRows,
    allUseRows,
    sources: {
      costs: spendCount > 0 || realCost,
      usage: usageKnown,
      discovery: devices > 0 || providers.has("NETWORK") || providers.has("MICROSOFT_365") || providers.has("GOOGLE_WORKSPACE"),
      employees: employees != null,
    },
  };
}

export async function computeScore(orgId: string): Promise<ScoreResult> {
  return scoreFromFacts(await loadScoreFacts(orgId));
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

/** Salva (o aggiorna) la fotografia di oggi. `result` evita di ricalcolare se c'è già. */
export async function recordScoreSnapshot(orgId: string, now = new Date(), result?: ScoreResult) {
  const r = result ?? (await computeScore(orgId));
  const day = romeDay(now);
  const data = {
    score: r.score,
    axes: r.axes,
    monthlySpendEur: r.facts.costKnown ? Math.round(r.facts.monthlySpendEur * 100) / 100 : null,
    wasteMonthlyEur: r.facts.costKnown ? Math.round(r.facts.wasteMonthlyEur * 100) / 100 : null,
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
  axes: Axes;
}

export async function scoreHistory(orgId: string, days = 90, now = new Date()): Promise<ScorePoint[]> {
  const from = romeDay(new Date(now.getTime() - days * DAY));
  const rows = await db.engineSnapshot.findMany({
    where: { organizationId: orgId, day: { gte: from } },
    orderBy: { day: "asc" },
    select: { day: true, score: true, axes: true },
  });
  return rows.map((r) => {
    const a = (r.axes ?? {}) as Partial<Axes>;
    return { day: r.day, score: r.score, axes: Object.fromEntries(AXES.map((k) => [k, typeof a[k] === "number" ? a[k]! : NEUTRAL])) as Axes };
  });
}

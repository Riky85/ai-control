/**
 * angar Engine — Negoziatore dei rinnovi.
 *
 * Per il prossimo rinnovo di un'AI prepara un dossier: date (rinnovo e
 * preavviso), prezzo di un posto contro mercato o listino, posti usati e
 * non usati, andamento dell'uso, prezzo obiettivo, la richiesta da fare al
 * fornitore e una bozza di email pronta da inviare.
 *
 * Deterministico: solo dati del database (nessun LLM). La parte di calcolo
 * (buildDossier) è pura e testabile; loadDossier legge il database.
 */
import { db } from "@/lib/db";
import { currentTermEnd, noticeDeadline, daysUntil } from "@/lib/contracts";
import { upcomingRenewals } from "@/lib/renewals";
import { priceForAsset, listSeatEur } from "@/lib/engine/price-index";
import { loadAssets, monthlyOf, serviceOf, categoryOf } from "@/lib/savings";
import { countActive, SEAT_WINDOW_DAYS } from "@/lib/seats";
import { CATEGORY_LABEL, type Category } from "@/lib/pricing/catalog";
import { legacyPlanById } from "@/lib/pricing/service";
import type { PeerStats } from "@/lib/benchmark";
import { fmtDate, fmtEur } from "@/lib/format";

const DAY = 86400000;
/** Settimane dell'andamento dell'uso. */
export const TREND_WEEKS = 12;
const PERSON_EVENTS = ["desktop.active", "extension.active", "signin", "copilot.active"];

export type Strength = "strong" | "fair" | "weak";

/** Ingresso del calcolo puro: solo numeri e date già letti. */
export interface DossierInput {
  now: number;
  orgName: string;
  sender: string | null;
  asset: { id: string; name: string; vendor: string | null; planName: string | null; category: Category | null };
  /** Date del registro contratti (se inserite). */
  contract: { termEnd: Date | null; deadline: Date | null; noticeDays: number | null; autoRenew: boolean | null; owner: string | null } | null;
  /** Prossimo addebito stimato dagli addebiti reali (se non c'è il contratto). */
  billedRenewal: Date | null;
  monthlyEur: number | null;
  estimated: boolean;
  annual: boolean;
  /** Prezzo annuale del piano rispetto al mensile (es. 0.8), null se non c'è. */
  annualRatio: number | null;
  seats: number | null;
  known: number;
  active: number;
  price: { yourSeatEur: number | null; peers: PeerStats | null; listSeatEur: number | null; verdict: "above" | "fair" | "below" | "unknown"; deltaPct: number | null } | null;
  /** Persone attive ogni settimana (dalla più vecchia alla più recente). */
  weekly: number[];
  /** Altre AI della stessa categoria già in uso nell'azienda. */
  alternatives: { id: string; name: string; active: number }[];
}

export interface Lever {
  key: "seats" | "price" | "yearly";
  label: string;
  yearlyEur: number;
}

export interface Dossier {
  asset: DossierInput["asset"] & { categoryLabel: string | null };
  renewal: { date: Date | null; source: "contract" | "billing" | null; deadline: Date | null; daysToDeadline: number | null; daysToRenewal: number | null; autoRenew: boolean | null; noticeDays: number | null; owner: string | null };
  cost: { monthlyEur: number | null; yearlyEur: number | null; estimated: boolean; annual: boolean };
  seats: { paid: number | null; active: number; known: number; unused: number; utilisation: number | null };
  price: { yourSeatEur: number | null; reference: number | null; referenceLabel: "market median" | "list price" | null; peers: PeerStats | null; listSeatEur: number | null; verdict: "above" | "fair" | "below" | "unknown"; deltaPct: number | null };
  trend: { weekly: number[]; changePct: number | null; direction: "up" | "down" | "flat" | null };
  alternatives: DossierInput["alternatives"];
  target: { seats: number | null; seatEur: number | null; monthlyEur: number | null; yearlyEur: number | null; saveYearlyEur: number };
  levers: Lever[];
  ask: string;
  strength: { level: Strength; reasons: string[] };
  email: { subject: string; body: string; mailto: string };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Prezzo di un posto: "€26" se intero, altrimenti "€21.50". */
const seatFmt = (n: number) => fmtEur(n, { decimals: Math.abs(round2(n) % 1) >= 0.01 && n < 100 });
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** Variazione tra le ultime 4 settimane e le 4 prima (in %), null senza dati. */
export function trendChange(weekly: number[]): number | null {
  if (weekly.length < 8) return null;
  const last = weekly.slice(-4).reduce((t, v) => t + v, 0);
  const prev = weekly.slice(-8, -4).reduce((t, v) => t + v, 0);
  if (prev === 0) return last > 0 ? 100 : null;
  return Math.round(((last - prev) / prev) * 100);
}

/** Il dossier completo, dai fatti. Pura: stessi fatti, stesso risultato. */
export function buildDossier(i: DossierInput): Dossier {
  // Date: prima il contratto, poi il prossimo addebito.
  const date = i.contract?.termEnd ?? i.billedRenewal ?? null;
  const source = i.contract?.termEnd ? "contract" : i.billedRenewal ? "billing" : null;
  const deadline = i.contract?.termEnd ? i.contract.deadline : null;

  // Posti: non usati solo se si sa chi la usa.
  const paid = i.seats && i.seats > 0 ? i.seats : null;
  const measured = paid != null && i.known > 0;
  const active = Math.min(i.active, paid ?? i.active);
  const unused = measured ? Math.max(0, paid! - active) : 0;
  const utilisation = measured ? active / paid! : null;

  // Prezzo di un posto: tuo (reale o dal costo stimato), riferimento = mediana di mercato o listino.
  const p = i.price;
  const yourSeat = p?.yourSeatEur ?? (i.monthlyEur != null && paid ? i.monthlyEur / paid : null);
  const peers = p?.peers ?? null;
  const reference = peers ? peers.median : p?.listSeatEur ?? null;
  const referenceLabel = peers ? "market median" : p?.listSeatEur != null ? "list price" : null;
  const verdict = p?.verdict ?? "unknown";

  // Obiettivo: posti = persone attive (almeno 1), prezzo = riferimento se paghi di più.
  const targetSeats = measured && unused > 0 ? Math.max(1, active) : paid;
  const priceHigh = yourSeat != null && reference != null && yourSeat > reference * 1.02;
  const targetSeat = yourSeat != null ? (priceHigh ? reference! : yourSeat) : null;
  const yearly = i.monthlyEur != null ? i.monthlyEur * 12 : null;

  const levers: Lever[] = [];
  if (targetSeats != null && paid != null && targetSeats < paid && yourSeat != null) {
    levers.push({ key: "seats", label: `Reduce to ${plural(targetSeats, "seat")}`, yearlyEur: round2((paid - targetSeats) * yourSeat * 12) });
  }
  if (priceHigh && targetSeats != null) {
    levers.push({ key: "price", label: `Match the ${referenceLabel} ${seatFmt(reference!)}`, yearlyEur: round2((yourSeat! - reference!) * targetSeats * 12) });
  }
  let targetMonthly = targetSeats != null && targetSeat != null ? targetSeats * targetSeat : i.monthlyEur;
  // Impegno annuale in cambio del prezzo annuale, solo se si paga al mese e il piano lo prevede.
  if (!i.annual && i.annualRatio != null && i.annualRatio < 1 && targetMonthly != null && targetMonthly > 0) {
    const save = targetMonthly * (1 - i.annualRatio) * 12;
    if (save >= 50) {
      levers.push({ key: "yearly", label: `Commit yearly for ${Math.round((1 - i.annualRatio) * 100)}% off`, yearlyEur: round2(save) });
      targetMonthly *= i.annualRatio;
    }
  }
  const targetYearly = targetMonthly != null ? targetMonthly * 12 : null;
  const saveYearly = Math.max(0, levers.reduce((t, l) => t + l.yearlyEur, 0));

  const headline = levers.filter((l) => l.key !== "yearly");
  const askParts = (headline.length ? headline : levers).map((l, n) => (n === 0 ? l.label : l.label.charAt(0).toLowerCase() + l.label.slice(1)));
  const askSave = (headline.length ? headline : levers).reduce((t, l) => t + l.yearlyEur, 0);
  const ask = askParts.length
    ? `${askParts.join(" and ")} → save ${fmtEur(askSave)} a year`
    : `Keep ${paid ? plural(paid, "seat") : "the plan"} at the same price — ask for flexibility to reduce seats mid-term`;

  // Andamento dell'uso.
  const changePct = trendChange(i.weekly);
  const direction = changePct == null ? null : changePct <= -10 ? "down" : changePct >= 10 ? "up" : "flat";

  // Forza negoziale: prezzo sopra mercato, posti non usati, alternative già in uso, uso in calo.
  let pts = 0;
  const reasons: string[] = [];
  if (verdict === "above") {
    pts += 2;
    reasons.push(`You pay ${p?.deltaPct != null ? `${p.deltaPct}% ` : ""}above the ${referenceLabel ?? "reference"}`);
  } else if (verdict === "fair") reasons.push(`Your price is in line with the ${referenceLabel ?? "reference"}`);
  else if (verdict === "below") {
    pts -= 1;
    reasons.push(`You already pay below the ${referenceLabel ?? "reference"}`);
  }
  if (utilisation != null) {
    if (utilisation <= 0.8) {
      pts += 2;
      reasons.push(`${plural(unused, "seat")} unused in 30 days`);
    } else if (unused > 0) {
      pts += 1;
      reasons.push(`${plural(unused, "seat")} unused in 30 days`);
    } else reasons.push("Every seat is used");
  }
  const alts = i.alternatives;
  if (alts.length) {
    pts += Math.min(2, alts.length);
    reasons.push(`${alts.map((a) => a.name).slice(0, 2).join(" and ")} already in use as an alternative`);
  }
  if (direction === "down") {
    pts += 1;
    reasons.push(`Use down ${Math.abs(changePct!)}% in the last 4 weeks`);
  } else if (direction === "up") {
    pts -= 1;
    reasons.push(`Use up ${changePct}% in the last 4 weeks`);
  }
  const level: Strength = pts >= 4 ? "strong" : pts >= 2 ? "fair" : "weak";

  const email = draftEmail(i, {
    date,
    deadline,
    paid,
    active,
    measured,
    yourSeat,
    reference,
    referenceLabel,
    priceHigh,
    targetSeats,
    yearly,
    targetYearly,
    levers,
  });

  return {
    asset: { ...i.asset, categoryLabel: i.asset.category ? CATEGORY_LABEL[i.asset.category] : null },
    renewal: {
      date,
      source,
      deadline,
      daysToDeadline: deadline ? daysUntil(deadline, i.now) : null,
      daysToRenewal: date ? daysUntil(date, i.now) : null,
      autoRenew: i.contract?.autoRenew ?? null,
      noticeDays: i.contract?.noticeDays ?? null,
      owner: i.contract?.owner ?? null,
    },
    cost: { monthlyEur: i.monthlyEur, yearlyEur: yearly, estimated: i.estimated, annual: i.annual },
    seats: { paid, active, known: i.known, unused, utilisation },
    price: { yourSeatEur: yourSeat, reference, referenceLabel, peers, listSeatEur: p?.listSeatEur ?? null, verdict, deltaPct: p?.deltaPct ?? null },
    trend: { weekly: i.weekly, changePct, direction },
    alternatives: i.alternatives,
    target: {
      seats: targetSeats,
      seatEur: targetSeat,
      monthlyEur: targetMonthly != null ? round2(targetMonthly) : null,
      yearlyEur: targetYearly != null ? round2(targetYearly) : null,
      saveYearlyEur: round2(saveYearly),
    },
    levers,
    ask,
    strength: { level, reasons },
    email,
  };
}

/** Bozza di email al fornitore: tono neutro e professionale, solo fatti. */
function draftEmail(
  i: DossierInput,
  d: {
    date: Date | null;
    deadline: Date | null;
    paid: number | null;
    active: number;
    measured: boolean;
    yourSeat: number | null;
    reference: number | null;
    referenceLabel: string | null;
    priceHigh: boolean;
    targetSeats: number | null;
    yearly: number | null;
    targetYearly: number | null;
    levers: Lever[];
  },
) {
  const product = i.asset.planName ?? i.asset.name;
  const subject = `${i.asset.name} renewal${d.date ? ` on ${fmtDate(d.date)}` : ""} — ${i.orgName}`;
  const facts: string[] = [];
  if (d.paid) facts.push(d.measured ? `We pay for ${plural(d.paid, "seat")}; ${d.active} ${d.active === 1 ? "was" : "were"} active in the last 30 days.` : `We pay for ${plural(d.paid, "seat")}.`);
  if (d.yourSeat != null && d.reference != null && d.priceHigh) {
    facts.push(
      d.referenceLabel === "market median"
        ? `We pay ${seatFmt(d.yourSeat)} for each seat a month; comparable companies pay a median of ${seatFmt(d.reference)}.`
        : `We pay ${seatFmt(d.yourSeat)} for each seat a month; the list price is ${seatFmt(d.reference)}.`,
    );
  }
  if (i.alternatives.length) facts.push(`We also use ${i.alternatives.map((a) => a.name).slice(0, 2).join(" and ")} and are reviewing which tools to keep.`);

  const asks: string[] = [];
  for (const l of d.levers) {
    if (l.key === "seats") asks.push(`Reduce the subscription to ${plural(d.targetSeats!, "seat")}.`);
    if (l.key === "price") asks.push(`Set the price at ${seatFmt(d.reference!)} for each seat a month.`);
    if (l.key === "yearly") asks.push("Move to yearly billing at the yearly rate.");
  }
  if (!asks.length) asks.push("Keep the current price, with the option to reduce seats during the term.");

  const lines = [
    "Hello,",
    "",
    `Our ${product} subscription ${d.date ? `renews on ${fmtDate(d.date)}` : "is coming up for renewal"}. Ahead of the renewal we reviewed our usage and pricing.`,
    ...(facts.length ? ["", ...facts.map((f) => `- ${f}`)] : []),
    "",
    "For the renewal we would like to:",
    ...asks.map((a) => `- ${a}`),
  ];
  if (d.yearly != null && d.targetYearly != null && d.targetYearly < d.yearly - 1) {
    lines.push("", `This would bring our yearly cost from ${fmtEur(d.yearly)} to ${fmtEur(d.targetYearly)}.`);
  }
  lines.push("", `Could you send an updated offer${d.deadline ? ` before ${fmtDate(d.deadline)}` : d.date ? ` before ${fmtDate(d.date)}` : ""}?`, "", "Kind regards,", i.sender ?? "", i.orgName);
  const body = lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { subject, body, mailto };
}

// ───────────────────────── dal database ─────────────────────────

/** Persone attive ogni settimana (ultime TREND_WEEKS settimane) da attività con una persona. */
async function weeklyActive(assetId: string, now: number): Promise<number[]> {
  const since = new Date(now - TREND_WEEKS * 7 * DAY);
  const events = await db.aiAssetActivity.findMany({
    where: { aiAssetId: assetId, occurredAt: { gte: since }, OR: [{ eventType: { in: PERSON_EVENTS } }, { eventType: { startsWith: "oauth." } }] },
    select: { actorRef: true, occurredAt: true },
    take: 20000,
  });
  const weeks = Array.from({ length: TREND_WEEKS }, () => new Set<string>());
  for (const e of events) {
    if (!e.actorRef) continue;
    const w = TREND_WEEKS - 1 - Math.floor((now - e.occurredAt.getTime()) / (7 * DAY));
    if (w >= 0 && w < TREND_WEEKS) weeks[w].add(e.actorRef.toLowerCase());
  }
  return weeks.map((s) => s.size);
}

/** Dossier di un'AI dell'azienda (null se non esiste o non appartiene all'azienda). */
export async function loadDossier(orgId: string, assetId: string, sender: string | null = null, now = Date.now()): Promise<Dossier | null> {
  const [asset, org] = await Promise.all([
    db.aiAsset.findFirst({ where: { id: assetId, organizationId: orgId, deletedAt: null }, include: { cost: true, usages: { select: { lastSeenAt: true } } } }),
    db.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
  ]);
  if (!asset) return null;

  const [price, renewals, weekly, all] = await Promise.all([
    priceForAsset(orgId, assetId).catch(() => null),
    asset.cost?.contractEnd ? Promise.resolve([]) : upcomingRenewals(orgId, 400).catch(() => []),
    weeklyActive(assetId, now),
    loadAssets(orgId),
  ]);

  const c = asset.cost;
  const contract = c?.contractEnd
    ? { termEnd: currentTermEnd(c, now), deadline: noticeDeadline(c, now), noticeDays: c.noticeDays, autoRenew: c.autoRenew, owner: c.contractOwnerEmail }
    : null;
  const m = monthlyOf(asset);
  const svc = serviceOf(asset);
  const plan = legacyPlanById(c?.planId);
  const category = categoryOf(asset);
  const annualRatio = plan?.annualMonthlyUsd && plan.annualMonthlyUsd < plan.monthlyUsd ? plan.annualMonthlyUsd / plan.monthlyUsd : null;

  // Listino se l'indice non ha una riga (es. costo solo stimato).
  const list = svc ? listSeatEur(svc, c?.planId, Boolean(c?.annualBilling)) : null;
  const priceIn: DossierInput["price"] = price
    ? { yourSeatEur: price.yourSeatEur, peers: price.peers, listSeatEur: price.listSeatEur, verdict: price.verdict, deltaPct: price.deltaPct }
    : list
      ? { yourSeatEur: null, peers: null, listSeatEur: list.eur, verdict: "unknown", deltaPct: null }
      : null;

  const alternatives =
    category && category !== "api" && category !== "local"
      ? all
          .filter((a) => a.id !== asset.id && categoryOf(a) === category && a.status !== "UNAPPROVED")
          .map((a) => ({ id: a.id, name: a.name, active: countActive(a.usages, SEAT_WINDOW_DAYS, now) }))
          .filter((a) => a.active > 0)
          .sort((x, y) => y.active - x.active)
      : [];

  return buildDossier({
    now,
    orgName: org?.name ?? "Our company",
    sender,
    asset: { id: asset.id, name: asset.name, vendor: asset.vendor, planName: plan?.name ?? null, category },
    contract,
    billedRenewal: renewals.find((r) => r.assetId === asset.id)?.date ?? null,
    monthlyEur: m?.eur ?? null,
    estimated: m?.estimated ?? false,
    annual: Boolean(c?.annualBilling),
    annualRatio,
    seats: c?.seats ?? null,
    known: asset.usages.length,
    active: countActive(asset.usages, SEAT_WINDOW_DAYS, now),
    price: priceIn,
    weekly,
    alternatives,
  });
}

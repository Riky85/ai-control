/**
 * Opportunities — caricamento dal database (solo server). La logica è in generate.ts (pura).
 *
 *   loadOpportunities(orgId) → { list, summary, estate }
 *
 * Ogni fonte è indipendente: se una fallisce (es. tabella nuova non ancora nel database) le
 * altre opportunità restano.
 */
import * as React from "react";
import { db } from "@/lib/db";
import { computeSavingsCached, monthlyOf } from "@/lib/savings";
import { computeScoreCached, scoreActions } from "@/lib/engine/score";
import { loadEstateCached } from "@/lib/estate/graph";
import { loadMarketFeed } from "@/lib/market/service";
import { changeHeadline, simulateHref } from "@/lib/market/format";
import { priceIndexFor } from "@/lib/engine/price-index";
import { upcomingRenewals } from "@/lib/renewals";
import { contractRows } from "@/lib/contracts";
import { generateOpportunities, summarize, RENEWAL_DAYS, type GenInput, type MarketIn, type PriceAboveIn, type RenewalIn } from "./generate";
import { isStatus, type StatusInput } from "./status";
import type { Status } from "./types";

export * from "./types";
export { summarize } from "./generate";

const safe = async <T,>(p: Promise<T>, fallback: T, what: string): Promise<T> => {
  try {
    return await p;
  } catch (err) {
    console.error(`[opportunities] ${what} failed`, err);
    return fallback;
  }
};

async function loadStatus(orgId: string): Promise<StatusInput> {
  const [states, ledger, dismissed] = await Promise.all([
    // Tabella nuova (OpportunityState): se non è ancora nel database si parte da "new".
    safe(db.opportunityState.findMany({ where: { organizationId: orgId }, select: { key: true, status: true } }), [], "states"),
    db.savingAction.findMany({ where: { organizationId: orgId, savingKey: { not: null }, status: { not: "failed" } }, select: { savingKey: true, status: true } }),
    db.savingDismissal.findMany({ where: { organizationId: orgId }, select: { key: true } }),
  ]);
  return {
    states: new Map(states.filter((s) => isStatus(s.status)).map((s) => [s.key, s.status as Status])),
    ledger: new Map(ledger.map((l) => [l.savingKey!, l.status as "accepted" | "done" | "verified"])),
    dismissed: new Set(dismissed.map((d) => d.key)),
  };
}

export async function loadOpportunities(orgId: string, now = new Date()) {
  const [savings, estate, status] = await Promise.all([computeSavingsCached(orgId), safe(loadEstateCached(orgId), null, "estate"), loadStatus(orgId)]);
  const hasAi = savings.assets.length > 0;
  const [score, feed, prices, renewals, contracts] = await Promise.all([
    hasAi ? safe(computeScoreCached(orgId).then((r) => scoreActions(r.facts, r).actions), [], "score") : Promise.resolve([]),
    safe(loadMarketFeed(orgId, { now }), [], "market"),
    hasAi ? safe(priceIndexFor(orgId), { rows: [], networkCompanies: null, minCompanies: 0 }, "price index") : Promise.resolve({ rows: [], networkCompanies: null, minCompanies: 0 }),
    safe(upcomingRenewals(orgId, RENEWAL_DAYS), [], "renewals"),
    safe(contractRows(orgId), [], "contracts"),
  ]);

  const assetMonthly = new Map<string, { eur: number; estimated: boolean }>();
  for (const a of savings.assets) {
    const m = monthlyOf(a);
    if (m && m.eur > 0) assetMonthly.set(a.id, m);
  }

  const market: MarketIn[] = feed.map((r) => ({
    changeId: r.change.id,
    key: r.change.key ?? r.change.id,
    changeType: r.change.changeType,
    providerId: r.change.providerId,
    modelId: r.change.modelId,
    headline: changeHeadline(r.change, now),
    systemIds: r.systemIds,
    annualDeltaEur: r.annualDeltaEur,
    exposedActualEur: r.exposedActualEur,
    exposedEstimatedEur: r.exposedEstimatedEur,
    alternatives: r.alternatives,
    daysUntil: r.daysUntil,
    simulateHref: simulateHref(r.change),
    sourceUrl: r.change.sourceUrl,
    confidence: r.change.confidence,
  }));

  // Prezzo del posto sopra il listino: solo dal confronto col listino (mai stimato).
  const aboveList: PriceAboveIn[] = prices.rows
    .filter((r) => r.yourSeatEur != null && r.listSeatEur != null && r.listSeatEur > 0)
    .map((r) => ({ serviceId: r.serviceId, name: r.name, vendor: r.vendor, assetIds: r.assetIds, seats: r.seats, yourSeatEur: r.yourSeatEur!, listSeatEur: r.listSeatEur!, planName: r.planName }));

  // Rinnovi: annuali dagli addebiti, e termini di contratto con preavviso (le date del contratto vincono).
  const ren: RenewalIn[] = [
    ...contracts.filter((c) => c.termEnd).map((c) => ({ assetId: c.assetId, name: c.name, vendor: c.vendor, date: c.termEnd!, amountEur: c.monthlyEur ?? 0, annual: true, from: "contract" as const, noticeBy: c.deadline })),
    ...renewals.filter((r) => r.annual).map((r) => ({ assetId: r.assetId, name: r.name, vendor: r.vendor, date: r.date, amountEur: r.amountEur, annual: r.annual, from: "charges" as const })),
  ];

  const input: GenInput = {
    now,
    savings: { items: savings.items, inProgress: savings.inProgress, counted: savings.counted, assetMonthly },
    score,
    estate,
    market,
    pricing: { aboveList, renewals: ren },
    status,
  };
  const list = generateOpportunities(input);
  return { list, summary: summarize(list), estate, savingsTotal: savings.totalMonthly };
}

/** Una lettura per richiesta (Overview e pagina condividono il calcolo). */
const reactCache = (React as { cache?: <T extends (...a: never[]) => unknown>(fn: T) => T }).cache;
export const loadOpportunitiesCached = reactCache ? reactCache(loadOpportunities) : loadOpportunities;

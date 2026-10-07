/**
 * AI Market Change engine — impatto per azienda nel database, feed e avvisi.
 *
 * refreshOrgImpacts: calcola l'impatto di ogni cambiamento attivo sull'estate dell'azienda
 * (market/impact.ts) e lo salva in AiMarketChangeImpact (una riga per cambiamento che tocca
 * almeno un AI system). Il feed legge da lì; se il calcolo è vecchio lo rifà (cache).
 * marketAlerts: un avviso (campanella, Slack/Teams) per ogni cambiamento materiale nuovo.
 */
import { db } from "@/lib/db";
import { createAlert } from "@/lib/alerts";
import { computeImpact, type ImpactResult } from "./impact";
import { changeHeadline, impactLine } from "./format";

/** Età massima del calcolo prima di rifarlo alla lettura del feed. */
export const IMPACT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export async function refreshOrgImpacts(orgId: string, now = new Date()) {
  const { loadEstate } = await import("@/lib/estate/graph");
  const [estate, changes] = await Promise.all([loadEstate(orgId, now), db.aiMarketChange.findMany({ where: { status: "active" } })]);
  const results = changes.map((ch) => ({ ch, r: computeImpact(estate, ch, now) })).filter((x) => x.r.systems.length > 0);
  // La deprecazione di un modello con anche una data di ritiro: la riga del ritiro basta (niente doppioni nel feed).
  const retiring = new Set(results.filter((x) => x.ch.changeType === "retirement" && x.r.material).map((x) => x.ch.modelId));
  for (const x of results) if (x.ch.changeType === "deprecation" && retiring.has(x.ch.modelId)) (x.r.material = false), (x.r.reason = "Shown with the retirement date");

  const keep: string[] = [];
  for (const { ch, r } of results) {
    keep.push(ch.id);
    const data = {
      systems: r.systems.length,
      applications: r.applications.length,
      teams: r.teams.length,
      systemIds: r.systems.map((s) => s.id),
      exposedActualEur: r.exposedActualEur,
      exposedEstimatedEur: r.exposedEstimatedEur,
      annualDeltaEur: r.annualDeltaEur,
      deltaBasis: r.deltaBasis,
      alternatives: r.alternatives.length,
      daysUntil: r.daysUntil,
      material: r.material,
      detail: { systems: r.systems, applications: r.applications, teams: r.teams, alternatives: r.alternatives, reason: r.reason } as object,
      computedAt: now,
    };
    await db.aiMarketChangeImpact.upsert({ where: { organizationId_changeId: { organizationId: orgId, changeId: ch.id } }, create: { organizationId: orgId, changeId: ch.id, ...data }, update: data });
  }
  // Cambiamenti che non toccano più l'azienda (AI tolta, modello cambiato): via dal feed.
  await db.aiMarketChangeImpact.deleteMany({ where: { organizationId: orgId, changeId: { notIn: keep } } });
  return results.length;
}

export type FeedRow = Awaited<ReturnType<typeof readFeed>>[number];

async function readFeed(orgId: string, materialOnly: boolean) {
  return db.aiMarketChangeImpact.findMany({
    where: { organizationId: orgId, ...(materialOnly ? { material: true } : {}), change: { status: "active" } },
    include: { change: true },
  });
}

/** Ordine del feed: prima ciò che sta per succedere (più vicino), poi il passato recente, poi senza data. */
export function feedOrder(a: { daysUntil: number | null; annualDeltaEur: number | null; exposedActualEur: number; exposedEstimatedEur: number }, b: typeof a) {
  const rank = (x: typeof a) => (x.daysUntil == null ? 2 : x.daysUntil >= 0 ? 0 : 1);
  return rank(a) - rank(b) || (rank(a) === 0 ? a.daysUntil! - b.daysUntil! : rank(a) === 1 ? b.daysUntil! - a.daysUntil! : 0) || Math.abs(b.annualDeltaEur ?? 0) - Math.abs(a.annualDeltaEur ?? 0) || b.exposedActualEur + b.exposedEstimatedEur - (a.exposedActualEur + a.exposedEstimatedEur);
}

/** Feed dei cambiamenti che toccano l'azienda (solo materiali di default). Ricalcola se vecchio. */
export async function loadMarketFeed(orgId: string, opts: { materialOnly?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const latest = await db.aiMarketChangeImpact.findFirst({ where: { organizationId: orgId }, orderBy: { computedAt: "desc" }, select: { computedAt: true } });
  const anyChange = latest ? true : (await db.aiMarketChange.count({ where: { status: "active" } })) > 0;
  if (anyChange && (!latest || now.getTime() - latest.computedAt.getTime() > IMPACT_MAX_AGE_MS)) {
    await refreshOrgImpacts(orgId, now).catch((err) => console.error("[market] impact refresh failed", orgId, err));
  }
  const rows = await readFeed(orgId, opts.materialOnly ?? true);
  // daysUntil salvato al calcolo: lo si riallinea alla data di oggi.
  for (const r of rows) r.daysUntil = r.change.effectiveAt ? Math.ceil((r.change.effectiveAt.getTime() - now.getTime()) / 86_400_000) : null;
  return rows.sort(feedOrder);
}

/** Quanti cambiamenti attivi NON toccano materialmente l'azienda (nota a piè del feed). */
export async function otherChangesCount(orgId: string) {
  const [all, material] = await Promise.all([db.aiMarketChange.count({ where: { status: "active" } }), db.aiMarketChangeImpact.count({ where: { organizationId: orgId, material: true, change: { status: "active" } } })]);
  return Math.max(0, all - material);
}

/** Avviso: il cambiamento è da segnalare adesso? (in arrivo, appena successo, o un ciclo di vita su un modello in uso) */
export function alertWorthy(changeType: string, days: number | null) {
  if (changeType === "deprecation" || changeType === "retirement") return true;
  if (days == null) return false;
  return days >= -14;
}

/** Un avviso per ogni cambiamento materiale nuovo (dedupe: chiave del cambiamento). */
export async function marketAlerts(orgId: string, now = new Date()) {
  const rows = await db.aiMarketChangeImpact.findMany({ where: { organizationId: orgId, material: true, alertedAt: null, change: { status: "active" } }, include: { change: true } });
  let n = 0;
  for (const r of rows) {
    const days = r.change.effectiveAt ? Math.ceil((r.change.effectiveAt.getTime() - now.getTime()) / 86_400_000) : null;
    if (!alertWorthy(r.change.changeType, days)) continue;
    const head = changeHeadline(r.change, now);
    const up = (r.annualDeltaEur ?? 0) > 0;
    const severity = r.change.changeType === "retirement" && days != null && days <= 30 ? "critical" : r.change.changeType === "retirement" || r.change.changeType === "deprecation" || up ? "warning" : "info";
    const created = await createAlert(orgId, {
      kind: "market",
      severity,
      title: `${head.provider} · ${head.subject}: ${head.change}`,
      body: `${impactLine(r)}. Source: ${r.change.sourceUrl ?? "catalog"}.`,
      href: `/market/${r.change.id}`,
      dedupeKey: `market:${r.change.key ?? r.change.id}`,
    });
    await db.aiMarketChangeImpact.update({ where: { id: r.id }, data: { alertedAt: now } });
    if (created) n++;
  }
  return n;
}

/** Cambiamenti materiali da mettere nel brief settimanale (in arrivo entro 120 giorni, o ciclo di vita). */
export async function briefMarketItems(orgId: string, now = new Date()) {
  const rows = await loadMarketFeed(orgId, { now });
  return rows
    .filter((r) => r.change.changeType === "deprecation" || r.change.changeType === "retirement" || (r.daysUntil != null && r.daysUntil >= -7 && r.daysUntil <= 120))
    .map((r) => {
      const h = changeHeadline(r.change, now);
      return { id: r.change.key ?? r.change.id, changeId: r.change.id, type: r.change.changeType, title: `${h.provider} · ${h.subject}: ${h.change}`, detail: impactLine(r), daysUntil: r.daysUntil, annualDeltaEur: r.annualDeltaEur };
    });
}

export type { ImpactResult };

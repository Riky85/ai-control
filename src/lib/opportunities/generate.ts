/**
 * Opportunities — generatore deterministico e puro (nessun database, nessun LLM).
 *
 * Unisce in un solo elenco, senza doppioni:
 *  1. motore dei risparmi (savings.ts)            → SAVE / CONSOLIDATE / REMOVE / SWITCH
 *  2. piano "Improve my score" (score-model.ts)    → punti sulle opportunità già trovate; FIX e REVIEW per il resto
 *  3. AI estate (estate/assemble.ts)               → FIX (owner), REDUCE_DEPENDENCY (dipendenze alte, concentrazione,
 *                                                    nessuna alternativa provata sui sistemi critici)
 *  4. cambi di mercato (market/)                   → REVIEW (aumenti di prezzo), SWITCH (deprecazioni / ritiri)
 *  5. Replaceability / Impact Simulator            → SWITCH (alternativa compatibile e più economica)
 *  6. prezzi (price-index, rinnovi)                → SAVE (contratto sopra listino), REVIEW (rinnovi entro 60 giorni)
 *
 * Regole sui soldi: il totale somma SOLO la quota "counted" del motore dei risparmi (stesso tetto
 * per AI, nessun doppio conteggio). Le altre cifre si mostrano con la loro base ma non si sommano.
 */
import type { Saving } from "@/lib/savings";
import type { ScoreAction } from "@/lib/engine/score-model";
import type { EstateData } from "@/lib/estate/assemble";
import { impactOf, nodeKey, type ImpactSet } from "@/lib/estate/graph-core";
import { productByIdOf } from "@/lib/pricing/service";
import { applyStatus, type StatusInput } from "./status";
import { CATEGORIES, type AffectedSystem, type Category, type Conf, type Effort, type Engine, type Figure, type Opportunity, type OpportunitySummary, type Risk } from "./types";

// ───────────────────────── input ─────────────────────────

export interface MarketIn {
  changeId: string;
  /** Chiave stabile del cambiamento (AiMarketChange.key, altrimenti id). */
  key: string;
  changeType: string;
  providerId: string | null;
  modelId: string | null;
  headline: { provider: string; subject: string; change: string };
  systemIds: string[];
  annualDeltaEur: number | null;
  exposedActualEur: number;
  exposedEstimatedEur: number;
  alternatives: number;
  daysUntil: number | null;
  simulateHref: string | null;
  sourceUrl: string | null;
  confidence: string;
}

export interface PriceAboveIn {
  serviceId: string;
  name: string;
  vendor: string | null;
  assetIds: string[];
  seats: number | null;
  yourSeatEur: number;
  listSeatEur: number;
  planName: string | null;
}

export interface RenewalIn {
  assetId: string;
  name: string;
  vendor: string | null;
  date: Date;
  amountEur: number;
  annual: boolean;
  /** "charges" = dagli addebiti; "contract" = dal termine del contratto (preavviso). */
  from: "charges" | "contract";
  noticeBy?: Date | null;
}

export interface GenInput {
  now: Date;
  savings: {
    items: Saving[];
    /** Accettati nel registro ma non ancora fatti: restano visibili come "Accepted". */
    inProgress: Saving[];
    /** Quota sommata al totale per chiave (computeSavings.counted). */
    counted: Map<string, number>;
    /** Costo mensile di ogni AI (monthlyOf): reale o stimato. */
    assetMonthly: Map<string, { eur: number; estimated: boolean }>;
  };
  score: ScoreAction[];
  estate: EstateData | null;
  market: MarketIn[];
  pricing: { aboveList: PriceAboveIn[]; renewals: RenewalIn[] };
  status: StatusInput;
}

// ───────────────────────── regole documentate ─────────────────────────

/** Concentrazione su un fornitore oltre la quale si apre un'opportunità (quota della spesa). */
export const CONCENTRATION_MIN = 0.6;
/** Compatibilità minima per proporre un cambio di modello (stessa soglia dello scenario di budget). */
export const SWITCH_MIN_COMPATIBILITY = 70;
/** Rinnovi considerati: entro N giorni. */
export const RENEWAL_DAYS = 60;
/** Prezzo del posto sopra il listino di almeno questa quota. */
export const ABOVE_LIST_MIN = 0.02;

/** Ordinamento: fiducia × (1 + euro/100) × (1 + punti Score/5) ÷ impegno ÷ rischio. */
export const RANK = {
  conf: { HIGH: 1, MEDIUM: 0.7, LOW: 0.4 } as Record<Conf, number>,
  effort: { Low: 1, Medium: 1.5, High: 2.5 } as Record<Effort, number>,
  risk: { Low: 1, Medium: 1.2, High: 1.5 } as Record<Risk, number>,
  /** Le opportunità senza euro (rischio, dati) pesano la spesa esposta a questo tasso. */
  exposureWeight: 0.1,
} as const;

const SAVING_CATEGORY: Record<Saving["kind"], Category> = { seats: "SAVE", annual: "SAVE", premium: "SAVE", duplicate: "CONSOLIDATE", idle: "REMOVE", model: "SWITCH", alternative: "SWITCH" };
const SAVING_EFFORT: Record<Saving["kind"], Effort> = { seats: "Low", annual: "Low", premium: "Low", idle: "Low", duplicate: "Medium", model: "Medium", alternative: "Medium" };
const SAVING_RISK: Record<Saving["kind"], Risk> = { seats: "Low", annual: "Medium", premium: "Low", idle: "Medium", duplicate: "Medium", model: "Medium", alternative: "Medium" };
const SAVING_ACTION: Record<Saving["kind"], string> = {
  seats: "Remove the seats nobody uses",
  annual: "Switch to yearly billing for the seats you keep",
  premium: "Move light users to the standard plan",
  duplicate: "Standardise on one tool and cancel the others",
  idle: "Check with the team, then cancel",
  model: "Route simple requests to the cheaper model",
  alternative: "Test the alternative, then switch",
};
const CERT_CONF: Record<ScoreAction["certainty"], Conf> = { high: "HIGH", medium: "MEDIUM", investigate: "LOW" };

// ───────────────────────── utilità ─────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;
export const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fig = (n: number, kind: Figure["kind"], basis: string): Figure => ({ eur: r2(n), kind, basis });

interface Ctx {
  input: GenInput;
  names: Map<string, AffectedSystem>;
  impact: (systemId: string) => ImpactSet | null;
}

function ctxOf(input: GenInput): Ctx {
  const names = new Map<string, AffectedSystem>();
  for (const r of input.estate?.rows ?? []) names.set(r.id, { id: r.id, name: r.name, vendor: r.vendor });
  for (const s of [...input.savings.items, ...input.savings.inProgress]) for (const a of s.assets) if (!names.has(a.id)) names.set(a.id, { id: a.id, name: a.name, vendor: a.vendor });
  const memo = new Map<string, ImpactSet | null>();
  return {
    input,
    names,
    impact: (id) => {
      if (!input.estate) return null;
      if (!memo.has(id)) memo.set(id, impactOf(input.estate.graph, nodeKey("system", id)));
      return memo.get(id)!;
    },
  };
}

const sys = (c: Ctx, id: string, fallback?: string): AffectedSystem => c.names.get(id) ?? { id, name: fallback ?? "AI system", vendor: null };

/** Processi (dal grafo) che dipendono dalle AI indicate, senza doppioni, in ordine. */
function processesOf(c: Ctx, ids: string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) for (const p of c.impact(id)?.processes ?? []) out.add(p.label);
  return [...out].sort((a, b) => a.localeCompare(b));
}

/** Impatto di migrazione: processi e applicazioni che dipendono dalle AI coinvolte. */
function migrationOf(c: Ctx, ids: string[], prefix?: string): string {
  const procs = processesOf(c, ids);
  const apps = new Set<string>();
  for (const id of ids) for (const a of c.impact(id)?.applications ?? []) apps.add(a.label);
  const parts = [procs.length ? plural(procs.length, "process", "processes") : null, apps.size ? plural(apps.size, "application") : null].filter(Boolean);
  const touch = parts.length ? `Touches ${parts.join(" and ")}` : "No process or application depends on it";
  return prefix ? `${prefix}. ${touch}` : touch;
}

const costOf = (c: Ctx, id: string): Figure | null => {
  const m = c.input.savings.assetMonthly.get(id);
  if (m) return fig(m.eur, m.estimated ? "estimated" : "actual", m.estimated ? "List price × seats or users" : "Billed amount");
  const row = c.input.estate?.rows.find((r) => r.id === id);
  if (row?.cost.actualEur != null) return fig(row.cost.actualEur, "actual", row.cost.actualSource ?? "Billed amount");
  if (row?.cost.estimatedEur != null) return fig(row.cost.estimatedEur, "estimated", row.cost.estimatedBasis ?? "List price");
  return null;
};

const sumFig = (list: (Figure | null)[], basis: string): Figure | null => {
  const ok = list.filter((x): x is Figure => !!x);
  if (!ok.length || ok.length !== list.length) return null;
  return fig(ok.reduce((t, x) => t + x.eur, 0), ok.some((x) => x.kind === "estimated") ? "estimated" : ok.some((x) => x.kind === "calculated") ? "calculated" : "actual", basis);
};

/** Bozza: tutti i campi tranne stato e rango (li calcola finish). */
type Draft = Omit<Opportunity, "status" | "rank" | "scorePoints"> & { scorePoints?: number | null; exposureEur?: number };

function rankOf(o: Draft): number {
  const money = o.savings?.eur ?? (o.exposureEur ?? 0) * RANK.exposureWeight;
  const v = (RANK.conf[o.confidence] * (1 + money / 100) * (1 + Math.max(0, o.scorePoints ?? 0) / 5)) / RANK.effort[o.effort] / RANK.risk[o.risk];
  return Math.round(v * 1000) / 1000;
}

// ───────────────────────── 1. motore dei risparmi ─────────────────────────

function fromSavings(c: Ctx, s: Saving, accepted: boolean): Draft {
  const ids = s.assets.map((a) => a.id);
  const systems = s.assets.map((a) => sys(c, a.id, a.name));
  const current = s.kind === "duplicate" ? sumFig(ids.map((id) => costOf(c, id)), `${s.assets.map((a) => a.name).join(" + ")}`) : costOf(c, ids[0]);
  const savingsKind: Figure["kind"] = s.confidence === "HIGH" ? (current?.kind === "actual" ? "calculated" : "estimated") : "estimated";
  const saving = fig(s.monthlyEur, savingsKind, s.detail);
  const counted = accepted ? 0 : c.input.savings.counted.get(s.key) ?? 0;
  const expected = current ? fig(Math.max(0, current.eur - s.monthlyEur), current.kind === "actual" ? "calculated" : "estimated", `${eur(current.eur)} − ${eur(s.monthlyEur)}`) : null;
  const notCountedWhy = accepted
    ? "Accepted: tracked under In progress"
    : counted < s.monthlyEur - 0.5
      ? counted > 0
        ? `Only ${eur(counted)} counted: other savings on the same AI already use the rest of its cost`
        : "Other savings on the same AI already use its whole cost"
      : null;
  const keep = s.kind === "duplicate" ? s.assets[0] : null;
  const drop = s.kind === "duplicate" ? s.assets[1] : null;
  const simulate =
    s.kind === "duplicate" && keep && drop
      ? `/impact?s=consolidate&from=${encodeURIComponent(drop.id)}&to=${encodeURIComponent(keep.id)}`
      : s.kind === "idle"
        ? `/impact?s=remove-system&system=${encodeURIComponent(ids[0])}`
        : s.kind === "model" || s.kind === "alternative"
          ? switchHref(c, ids[0])
          : null;
  const migration =
    s.kind === "duplicate" && keep
      ? migrationOf(c, ids.slice(1), `Users of ${s.assets.slice(1).map((a) => a.name).join(", ")} move to ${keep.name}`)
      : s.kind === "idle"
        ? migrationOf(c, ids, "Cancel the subscription")
        : s.kind === "model" || s.kind === "alternative"
          ? migrationOf(c, ids, "Change the model behind the system")
          : s.kind === "seats"
            ? "No migration: inactive people lose their seat"
            : "No migration: billing change only";
  return {
    key: s.key,
    title: s.title,
    category: SAVING_CATEGORY[s.kind],
    systems,
    evidence: [s.detail],
    reason: s.kind === "duplicate" ? "You pay for tools that do the same job" : s.kind === "idle" ? "You pay for an AI nobody seems to use" : `You can pay ${eur(s.monthlyEur)} a month less`,
    currentCost: current,
    expectedCost: expected,
    savings: saving,
    countedMonthlyEur: r2(counted),
    notCountedWhy,
    effort: SAVING_EFFORT[s.kind],
    migrationImpact: migration,
    risk: SAVING_RISK[s.kind],
    confidence: s.confidence,
    processes: processesOf(c, s.kind === "duplicate" ? ids.slice(1) : ids),
    recommendedAction: SAVING_ACTION[s.kind],
    calculation: [`Saving: ${eur(s.monthlyEur)} a month (${savingsKind}) · ${s.detail}`, ...(current ? [`Current cost: ${eur(current.eur)} a month (${current.kind}) · ${current.basis}`] : [])],
    engines: ["savings"],
    href: accepted ? "/opportunities?view=progress" : s.href,
    simulateHref: simulate,
    ledger: "savings",
  };
}

/** Link "Simulate" per cambiare il modello di un AI system (alternativa migliore se c'è). */
function switchHref(c: Ctx, id: string): string | null {
  const row = c.input.estate?.rows.find((r) => r.id === id);
  const repl = c.input.estate?.assessments.get(id)?.repl;
  if (!row) return null;
  const primary = [...row.uses].sort((a, b) => (b.share ?? 0) - (a.share ?? 0))[0];
  const from = primary?.modelId ?? null;
  if (from && repl?.best?.type === "model") return `/impact?s=replace-model&from=${encodeURIComponent(from)}&to=${encodeURIComponent(repl.best.id)}&system=${encodeURIComponent(id)}`;
  if (from) return `/impact?s=replace-model&from=${encodeURIComponent(from)}&system=${encodeURIComponent(id)}`;
  // Prodotto a posti: cambio di fornitore verso l'alternativa migliore.
  const fromProvider = productByIdOf(row.seatProductId)?.providerId ?? null;
  if (repl?.best?.type === "product") {
    if (fromProvider && fromProvider !== repl.best.providerId) return `/impact?s=replace-provider&from=${encodeURIComponent(fromProvider)}&to=${encodeURIComponent(repl.best.providerId)}&system=${encodeURIComponent(id)}`;
  }
  return null;
}

// ───────────────────────── 3. estate ─────────────────────────

function fromEstate(c: Ctx, skipSwitch: Set<string>): Draft[] {
  const est = c.input.estate;
  if (!est) return [];
  const out: Draft[] = [];

  // a) AI senza owner: una sola opportunità FIX (il piano dello Score vi aggiunge i suoi punti).
  if (est.metrics.unownedIds.length) {
    const ids = est.metrics.unownedIds;
    const spend = ids.reduce((t, id) => t + (costOf(c, id)?.eur ?? 0), 0);
    out.push({
      key: "fix:owners",
      title: `Assign an owner to ${plural(ids.length, "AI system")}`,
      category: "FIX",
      systems: ids.map((id) => sys(c, id)),
      evidence: [`${plural(ids.length, "AI system")} with no owner in the estate`, ...(spend > 0 ? [`${eur(spend)} a month of spend nobody answers for`] : [])],
      reason: "Nobody answers for their cost, renewals or changes",
      currentCost: null,
      expectedCost: null,
      savings: null,
      countedMonthlyEur: 0,
      notCountedWhy: null,
      effort: "Low",
      migrationImpact: "None",
      risk: "Low",
      confidence: "HIGH",
      processes: processesOf(c, ids),
      recommendedAction: "Name an owner for each AI system",
      calculation: ["Owner: an \"owned by\" link to a person or team in the estate graph"],
      engines: ["estate"],
      href: "/governance",
      simulateHref: null,
      ledger: "state",
      exposureEur: spend,
    });
  }

  // b) Dipendenze alte e sistemi critici senza alternativa provata: una per AI system.
  const critical = new Set(est.metrics.criticalIds);
  const high = new Set(est.metrics.highDependencyIds);
  for (const r of est.rows) {
    const a = est.assessments.get(r.id);
    if (!a) continue;
    const untested = a.repl.applicable && !a.repl.all.some((x) => x.tested);
    const isHigh = high.has(r.id);
    const isCritical = critical.has(r.id) && untested;
    if (!isHigh && !isCritical) continue;
    const cost = costOf(c, r.id);
    const best = a.repl.bestOtherProvider ?? a.repl.best;
    out.push({
      key: `dep:${r.id}`,
      title: isHigh ? `Reduce dependency of ${r.name}` : `Test an alternative for ${r.name}`,
      category: "REDUCE_DEPENDENCY",
      systems: [sys(c, r.id, r.name)],
      evidence: [
        `Exit readiness ${a.exit.score}/100 · ${a.exit.status}`,
        ...(a.repl.score != null ? [`Replaceability ${a.repl.score}/100`] : []),
        ...a.exit.blockers.slice(0, 3),
        ...(isCritical ? ["A critical business process depends on it", "No alternative tested"] : []),
      ],
      reason: isHigh ? "If the provider changes price or retires the model, you can't move quickly" : "A critical process depends on it and no alternative has been tested",
      currentCost: cost,
      expectedCost: null,
      savings: null,
      countedMonthlyEur: 0,
      notCountedWhy: null,
      effort: a.repl.effort ?? "Medium",
      migrationImpact: migrationOf(c, [r.id]),
      risk: "High",
      confidence: "MEDIUM",
      processes: processesOf(c, [r.id]),
      recommendedAction: best ? `Test ${best.name} on real tasks and set up a fallback` : "Record what the system needs, then look for an alternative",
      calculation: [`Exit readiness: ${a.exit.checks.filter((k) => k.applicable).map((k) => `${k.label} ${k.earned}/${k.points}`).join(" · ")}`, ...(a.repl.score != null ? [`Replaceability: ${a.repl.components.map((k) => `${k.label} ${k.score ?? "not tested"}`).join(" · ")}`] : [])],
      engines: ["estate"],
      href: `/assets/${r.id}?tab=estate`,
      simulateHref: switchHref(c, r.id) ?? `/impact?s=remove-system&system=${encodeURIComponent(r.id)}`,
      ledger: "state",
      exposureEur: cost?.eur ?? 0,
    });
  }

  // c) Concentrazione su un fornitore ≥ 60% della spesa.
  for (const p of est.concentration.rows) {
    if (p.share < CONCENTRATION_MIN || est.concentration.total <= 0) continue;
    const pid = p.providerKey.startsWith("provider:") ? p.providerKey.slice("provider:".length) : null;
    const catalogId = pid && !pid.startsWith("name:") ? pid : null;
    const ids = est.rows.filter((r) => impactOf(est.graph, p.providerKey)?.systems.some((s) => s.node.id === r.id)).map((r) => r.id);
    out.push({
      key: `conc:${p.providerKey}`,
      title: `${Math.round(p.share * 100)}% of AI spend depends on ${p.label}`,
      category: "REDUCE_DEPENDENCY",
      systems: ids.map((id) => sys(c, id)),
      evidence: [`${eur(p.spendEur)} of ${eur(est.concentration.total)} a month`, `${plural(p.systems, "AI system")} depend on ${p.label}`],
      reason: "A price change or outage at one provider hits most of your AI",
      currentCost: fig(p.spendEur, "calculated", "Spend of the AI systems that depend on the provider, weighted by the share of their work"),
      expectedCost: null,
      savings: null,
      countedMonthlyEur: 0,
      notCountedWhy: null,
      effort: "High",
      migrationImpact: migrationOf(c, ids),
      risk: "High",
      confidence: "HIGH",
      processes: processesOf(c, ids),
      recommendedAction: `Move the AI systems easiest to replace away from ${p.label}`,
      calculation: [`Concentration: ${eur(p.spendEur)} ÷ ${eur(est.concentration.total)} = ${Math.round(p.share * 100)}% (threshold ${CONCENTRATION_MIN * 100}%)`],
      engines: ["estate"],
      href: catalogId ? `/opportunities?goal=dependency&provider=${encodeURIComponent(catalogId)}` : "/providers",
      simulateHref: catalogId ? `/impact?s=outage&provider=${encodeURIComponent(catalogId)}` : null,
      ledger: "state",
      exposureEur: p.spendEur,
    });
  }

  // d) Cambio di modello compatibile e più economico (Replaceability, stesse soglie dello scenario di budget).
  for (const r of est.rows) {
    if (skipSwitch.has(r.id)) continue;
    const best = est.assessments.get(r.id)?.repl.best;
    if (!best || best.type !== "model" || best.savingEur == null || best.savingEur < 1) continue;
    if (best.gaps.length || best.compatibility < SWITCH_MIN_COMPATIBILITY) continue;
    const cost = costOf(c, r.id);
    out.push({
      key: `switch:${r.id}:${best.id}`,
      title: `Switch ${r.name} to ${best.name}`,
      category: "SWITCH",
      systems: [sys(c, r.id, r.name)],
      evidence: [`Compatibility ${best.compatibility}% · ${best.tested ? "tested" : "not tested"}`, `Replaceability ${best.score}/100`],
      reason: `${best.name} covers every requirement and costs less`,
      currentCost: cost,
      expectedCost: best.estimatedMonthlyEur != null ? fig(best.estimatedMonthlyEur, "estimated", best.estimateBasis) : null,
      savings: fig(best.savingEur, "estimated", best.estimateBasis),
      countedMonthlyEur: 0,
      notCountedWhy: best.tested ? "Estimated from list prices: not added to the total" : "Not tested yet: estimated from list prices, not added to the total",
      effort: best.effort,
      migrationImpact: migrationOf(c, [r.id], "Change the model behind the system"),
      risk: best.tested && best.compatibility >= 85 ? "Low" : "Medium",
      confidence: best.confidence,
      processes: processesOf(c, [r.id]),
      recommendedAction: best.tested ? `Switch to ${best.name}` : `Test ${best.name} on real tasks, then switch`,
      calculation: [`Saving: current ${cost ? eur(cost.eur) : "UNKNOWN"} − ${best.name} ${best.estimatedMonthlyEur != null ? eur(best.estimatedMonthlyEur) : "UNKNOWN"} = ${eur(best.savingEur)} a month (${best.estimateBasis})`, `Compatibility: ${best.components.map((k) => `${k.label} ${k.score ?? "not tested"}`).join(" · ")}`],
      engines: ["impact"],
      href: `/assets/${r.id}?tab=estate`,
      simulateHref: switchHref(c, r.id),
      ledger: "state",
    });
  }
  return out;
}

// ───────────────────────── 4. cambi di mercato ─────────────────────────

function fromMarket(c: Ctx): Draft[] {
  const out: Draft[] = [];
  for (const m of c.input.market) {
    const ids = m.systemIds.filter((id) => c.names.has(id) || !c.input.estate);
    const exposed = m.exposedActualEur + m.exposedEstimatedEur;
    const current = exposed > 0 ? fig(exposed, m.exposedActualEur > 0 && m.exposedEstimatedEur === 0 ? "actual" : m.exposedActualEur > 0 ? "calculated" : "estimated", "Spend of the AI systems that use it, for the share that uses it") : null;
    const title = `${m.headline.provider} ${m.headline.subject}: ${m.headline.change}`;
    const evidence = [`${plural(ids.length, "AI system")} affected`, ...(m.sourceUrl ? [`Source: ${m.sourceUrl}`] : []), `${m.confidence[0]}${m.confidence.slice(1).toLowerCase()} confidence`];
    const efforts = ids.map((id) => c.input.estate?.assessments.get(id)?.repl.effort ?? null).filter((x): x is Effort => !!x);
    const effort: Effort = efforts.includes("High") ? "High" : efforts.includes("Medium") ? "Medium" : efforts.length ? "Low" : "Medium";
    if (m.changeType === "price_change") {
      if (m.annualDeltaEur == null || m.annualDeltaEur < 1) continue;
      out.push({
        key: `mkt:${m.key}`,
        title,
        category: "REVIEW",
        systems: ids.map((id) => sys(c, id)),
        evidence: [...evidence, `${eur(m.annualDeltaEur)} a year more on the same usage`],
        reason: "A price you depend on goes up",
        currentCost: current,
        expectedCost: current ? fig(current.eur + m.annualDeltaEur / 12, "estimated", `${eur(current.eur)} + ${eur(m.annualDeltaEur / 12)} (new price on the last 30 days of usage)`) : null,
        savings: null,
        countedMonthlyEur: 0,
        notCountedWhy: null,
        effort,
        migrationImpact: migrationOf(c, ids),
        risk: "Medium",
        confidence: m.confidence === "HIGH" ? "HIGH" : m.confidence === "LOW" ? "LOW" : "MEDIUM",
        processes: processesOf(c, ids),
        recommendedAction: m.alternatives > 0 ? `Compare ${plural(m.alternatives, "alternative")} before it takes effect` : "Simulate the increase and plan the budget",
        calculation: [`Annual change: ${eur(m.annualDeltaEur)} (new − old price × observed usage)`],
        engines: ["market"],
        href: `/market/${m.changeId}`,
        simulateHref: m.simulateHref,
        ledger: "state",
        exposureEur: m.annualDeltaEur / 12 / RANK.exposureWeight,
      });
    } else if (m.changeType === "deprecation" || m.changeType === "retirement") {
      const soon = m.daysUntil != null && m.daysUntil <= 30;
      const alts = ids.map((id) => c.input.estate?.assessments.get(id)?.repl.best).filter((x): x is NonNullable<typeof x> => !!x);
      out.push({
        key: `mkt:${m.key}`,
        title: `Migrate off ${m.headline.subject} (${m.headline.change.toLowerCase()})`,
        category: "SWITCH",
        systems: ids.map((id) => sys(c, id)),
        evidence: [...evidence, ...alts.slice(0, 2).map((a) => `Best fit: ${a.name} · ${a.compatibility}%`)],
        reason: `${m.headline.provider} is retiring a model you use`,
        currentCost: current,
        expectedCost: null,
        savings: null,
        countedMonthlyEur: 0,
        notCountedWhy: null,
        effort,
        migrationImpact: migrationOf(c, ids, "Change the model behind each system"),
        risk: soon ? "High" : "Medium",
        confidence: "HIGH",
        processes: processesOf(c, ids),
        recommendedAction: alts[0] ? `Test ${alts[0].name} and migrate before the date` : "Pick a replacement model and migrate before the date",
        calculation: [m.daysUntil != null ? `Effective in ${plural(m.daysUntil, "day")}` : "Date not known"],
        engines: ["market"],
        href: `/market/${m.changeId}`,
        simulateHref: m.simulateHref,
        ledger: "state",
        exposureEur: exposed * (soon ? 3 : 1.5),
      });
    }
  }
  return out;
}

// ───────────────────────── 6. prezzi ─────────────────────────

function fromPricing(c: Ctx): Draft[] {
  const out: Draft[] = [];
  for (const p of c.input.pricing.aboveList) {
    if (p.yourSeatEur <= p.listSeatEur * (1 + ABOVE_LIST_MIN) || !p.seats) continue;
    const save = (p.yourSeatEur - p.listSeatEur) * p.seats;
    if (save < 1) continue;
    const current = fig(p.yourSeatEur * p.seats, "actual", `${p.seats} seats × ${eur(p.yourSeatEur)} billed`);
    out.push({
      key: `price:${p.serviceId}`,
      title: `${p.name} costs more than list price`,
      category: "SAVE",
      systems: p.assetIds.map((id) => sys(c, id, p.name)),
      evidence: [`You pay ${eur(p.yourSeatEur)} a seat; list price ${eur(p.listSeatEur)}${p.planName ? ` (${p.planName})` : ""}`, `${p.seats} seats`],
      reason: "Your contract is above the public price",
      currentCost: current,
      expectedCost: fig(p.listSeatEur * p.seats, "estimated", `${p.seats} seats × ${eur(p.listSeatEur)} list price`),
      savings: fig(save, "calculated", `(${eur(p.yourSeatEur)} − ${eur(p.listSeatEur)}) × ${p.seats} seats`),
      countedMonthlyEur: 0,
      notCountedWhy: "Depends on the negotiation: not added to the total",
      effort: "Medium",
      migrationImpact: "No migration: contract change only",
      risk: "Low",
      confidence: "MEDIUM",
      processes: processesOf(c, p.assetIds),
      recommendedAction: "Negotiate the seat price at renewal",
      calculation: [`(${eur(p.yourSeatEur)} − ${eur(p.listSeatEur)}) × ${p.seats} seats = ${eur(save)} a month`],
      engines: ["pricing"],
      href: `/negotiate/${p.assetIds[0]}`,
      simulateHref: null,
      ledger: "state",
    });
  }
  const seen = new Set<string>();
  for (const r of [...c.input.pricing.renewals].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    if (seen.has(r.assetId)) continue;
    const days = Math.ceil((r.date.getTime() - c.input.now.getTime()) / 86_400_000);
    if (days < 0 || days > RENEWAL_DAYS) continue;
    seen.add(r.assetId);
    const month = r.date.toISOString().slice(0, 7);
    out.push({
      key: `renewal:${r.assetId}:${month}`,
      title: `${r.name} renews in ${plural(days, "day")}`,
      category: "REVIEW",
      systems: [sys(c, r.assetId, r.name)],
      evidence: [`${r.annual ? "Yearly" : "Monthly"} renewal on ${r.date.toISOString().slice(0, 10)}`, ...(r.noticeBy ? [`Notice by ${r.noticeBy.toISOString().slice(0, 10)}`] : []), `Last charge ${eur(r.amountEur)}`],
      reason: "Decide seats, plan and price before it renews",
      currentCost: costOf(c, r.assetId),
      expectedCost: null,
      savings: null,
      countedMonthlyEur: 0,
      notCountedWhy: null,
      effort: "Low",
      migrationImpact: "None",
      risk: r.annual ? "Medium" : "Low",
      confidence: r.from === "contract" ? "HIGH" : "MEDIUM",
      processes: processesOf(c, [r.assetId]),
      recommendedAction: "Review seats and price, then renew or cancel",
      calculation: [r.from === "contract" ? "Date: contract term end" : `Date: last charge + ${r.annual ? "12 months" : "1 month"}`],
      engines: ["pricing"],
      href: `/assets/${r.assetId}`,
      simulateHref: null,
      ledger: "state",
      exposureEur: r.annual ? r.amountEur / 12 : r.amountEur,
    });
  }
  return out;
}

// ───────────────────────── tutto insieme ─────────────────────────

/** Elenco completo, deduplicato, con stato e rango. Funzione pura: stesso input → stesso output. */
export function generateOpportunities(input: GenInput): Opportunity[] {
  const c = ctxOf(input);
  const byKey = new Map<string, Draft>();
  const add = (d: Draft) => {
    if (!byKey.has(d.key)) byKey.set(d.key, d);
  };

  // 1. Motore dei risparmi (prima i suggerimenti aperti, poi quelli accettati ma non fatti).
  for (const s of input.savings.items) add(fromSavings(c, s, false));
  for (const s of input.savings.inProgress) add(fromSavings(c, s, true));

  // Sistemi che hanno già un cambio di modello (risparmi) o una migrazione obbligata (mercato): niente doppio SWITCH.
  const skipSwitch = new Set<string>();
  for (const s of [...input.savings.items, ...input.savings.inProgress]) if (s.kind === "model" || s.kind === "alternative") skipSwitch.add(s.assets[0]?.id ?? "");
  const market = fromMarket(c);
  for (const m of market) if (m.category === "SWITCH") for (const s of m.systems) skipSwitch.add(s.id);

  // Prima del dedupe: il cambio di modello di Replaceability, se l'AI ha già un risparmio "model"/"alternative", arricchisce quello.
  const est = input.estate;
  if (est)
    for (const d of byKey.values()) {
      if (d.category !== "SWITCH" || d.engines[0] !== "savings") continue;
      const best = est.assessments.get(d.systems[0]?.id ?? "")?.repl.best;
      if (best) {
        d.evidence.push(`Replaceability: ${best.name} fits ${best.compatibility}% · ${best.tested ? "tested" : "not tested"}`);
        d.engines.push("impact");
      }
    }

  // 3–6. Estate, mercato, prezzi.
  for (const d of fromEstate(c, skipSwitch)) add(d);
  for (const d of market) {
    // Migrazione obbligata: le alternative di Replaceability stanno già nell'evidenza.
    add(d);
  }
  for (const d of fromPricing(c)) add(d);

  // 2. Piano "Improve my score": punti sulle opportunità già trovate, nuove solo se mancano.
  for (const a of input.score) {
    const target = a.key.startsWith("opp:") ? a.key.slice(4) : a.key.startsWith("seats:") ? a.key : a.key === "owners" ? "fix:owners" : null;
    const hit = target ? byKey.get(target) : null;
    if (hit) {
      hit.scorePoints = Math.max(hit.scorePoints ?? 0, a.points);
      if (!hit.engines.includes("score")) hit.engines.push("score");
      if (a.basis && !hit.calculation.includes(a.basis)) hit.calculation.push(`Score plan: ${a.basis}`);
      continue;
    }
    if (a.key.startsWith("opp:") || a.key.startsWith("seats:")) continue; // risparmio già contato altrove o nascosto
    if (a.key.startsWith("growth:")) {
      add({
        key: a.key,
        title: a.title,
        category: "REVIEW",
        systems: [],
        evidence: [a.detail],
        reason: "Usage-based spend is above what the previous months suggest",
        currentCost: null,
        expectedCost: null,
        savings: a.monthlyEur != null ? fig(a.monthlyEur, "estimated", a.basis ?? a.detail) : null,
        countedMonthlyEur: 0,
        notCountedWhy: "Needs investigation: not added to the total",
        effort: "Medium",
        migrationImpact: "None",
        risk: "Low",
        confidence: "LOW",
        processes: [],
        recommendedAction: "Find what drove the increase",
        calculation: a.basis ? [a.basis] : [],
        engines: ["score"],
        href: a.href,
        simulateHref: null,
        ledger: "state",
        scorePoints: a.points,
      });
      continue;
    }
    add({
      key: a.key === "owners" ? "fix:owners" : `score:${a.key}`,
      title: a.title,
      category: "FIX",
      systems: [],
      evidence: [a.detail],
      reason: "Better data makes every number more precise",
      currentCost: null,
      expectedCost: null,
      savings: null,
      countedMonthlyEur: 0,
      notCountedWhy: null,
      effort: "Low",
      migrationImpact: "None",
      risk: "Low",
      confidence: CERT_CONF[a.certainty],
      processes: [],
      recommendedAction: a.cta,
      calculation: [`+${a.points} angar Score points`],
      engines: ["score"],
      href: a.href,
      simulateHref: null,
      ledger: "state",
      scorePoints: a.points,
    });
  }

  const drafts = [...byKey.values()];
  const withRank = drafts.map((d) => {
    const { exposureEur: _x, ...rest } = d;
    void _x;
    return { ...rest, scorePoints: d.scorePoints ?? null, status: "new" as const, rank: rankOf(d) };
  });
  const ordered = withRank.sort((a, b) => b.rank - a.rank || (b.savings?.eur ?? 0) - (a.savings?.eur ?? 0) || a.key.localeCompare(b.key));
  return applyStatus(ordered, input.status);
}

/** Riepilogo: totale senza doppi conteggi (solo quote "counted" delle opportunità aperte), conteggi per categoria. */
export function summarize(list: Opportunity[]): OpportunitySummary {
  const open = list.filter((o) => o.status === "new" || o.status === "accepted" || o.status === "in_progress");
  const byCategory = Object.fromEntries(CATEGORIES.map((k) => [k, 0])) as Record<Category, number>;
  for (const o of open) byCategory[o.category]++;
  const totalMonthly = r2(list.filter((o) => o.status === "new").reduce((t, o) => t + o.countedMonthlyEur, 0));
  // Euro mostrati ma non sommati: solo opportunità nuove (quelle accettate sono già nel registro).
  const notCountedMonthly = r2(list.filter((o) => o.status === "new").reduce((t, o) => t + (o.savings ? Math.max(0, o.savings.eur - o.countedMonthlyEur) : 0), 0));
  return { totalMonthly, notCountedMonthly, open: open.length, byCategory };
}

export type { Engine };

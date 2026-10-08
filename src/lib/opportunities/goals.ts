/**
 * Decision intelligence (spec §13) — obiettivi predefiniti, ciascuno con un piano ordinato.
 * Puro: lavora sul contesto dell'Impact Simulator (estate + catalogo + risparmi), nessun database,
 * nessun LLM. Ogni risposta rimanda a /impact per il dettaglio.
 *
 *   "Save €X a year"                 → scenario di budget dell'Impact Simulator
 *   "Reduce dependency on <provider>" → sistemi più sostituibili, alternative di altri fornitori, delta di costo
 *   "Go EU-only"                     → scenario EU-only
 *   "Prepare for a deprecation"      → sistemi coinvolti e candidati di migrazione
 *   "Which AI can we migrate?"       → classifica per risparmio, Replaceability, rischio, impegno, impatto, fiducia
 */
import { runScenario, type ImpactContext } from "@/lib/impact/engine";
import { impactHref } from "@/lib/impact/params";
import type { SystemImpact, Val } from "@/lib/impact/types";
import { impactOf, nodeKey } from "@/lib/estate/graph-core";
import { modelById, providerNameOf, resolveModel } from "@/lib/pricing/service";
import type { Alternative } from "@/lib/estate/replaceability";
import type { Conf, Effort, Figure, Risk } from "./types";

export type GoalKind = "save" | "dependency" | "eu-only" | "deprecation" | "migrate";

export const GOALS: { kind: GoalKind; label: string }[] = [
  { kind: "save", label: "Save money" },
  { kind: "dependency", label: "Reduce dependency" },
  { kind: "eu-only", label: "Go EU-only" },
  { kind: "deprecation", label: "Prepare for a deprecation" },
  { kind: "migrate", label: "Which AI can we migrate?" },
];

export interface GoalStep {
  key: string;
  title: string;
  detail: string;
  systems: { id: string; name: string }[];
  /** Variazione mensile (negativa = risparmio); null = non nota. */
  monthly: Figure | null;
  effort: Effort | null;
  risk: Risk | null;
  confidence: Conf | null;
  compatibility: number | null;
  /** Il passo fa parte del piano (es. scelto per raggiungere l'obiettivo di budget). */
  picked: boolean;
  href: string | null;
}

export interface GoalAnswer {
  kind: GoalKind;
  title: string;
  /** Frase di sintesi (numeri con la loro base). */
  summary: string;
  steps: GoalStep[];
  impactHref: string | null;
  /** Regola di ordinamento, visibile. */
  basis: string;
  empty: string | null;
}

export interface GoalParams {
  target?: number | null;
  provider?: string | null;
  model?: string | null;
}

/** Regola "Which AI can we migrate?": stessa forma dello scenario di budget, più Replaceability e impatto. */
export const MIGRATE_RANK = {
  conf: { HIGH: 1, MEDIUM: 0.7, LOW: 0.4 } as Record<Conf, number>,
  effort: { Low: 1, Medium: 1.5, High: 2.5 } as Record<Effort, number>,
  risk: { Low: 1, Medium: 1.3, High: 2 } as Record<Risk, number>,
  /** Ogni processo o applicazione che dipende dal sistema pesa così sull'impatto. */
  impactEach: 0.25,
} as const;

const r2 = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => `${n < 0 ? "−" : ""}€${Math.round(Math.abs(n)).toLocaleString("en-GB")}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const figOfVal = (v: Val | null | undefined): Figure | null =>
  v && v.eur != null ? { eur: r2(v.eur), kind: v.kind === "observed" ? "actual" : v.kind === "calculated" ? "calculated" : "estimated", basis: v.basis } : null;

const stepOf = (s: SystemImpact, href: string | null, extra: Partial<GoalStep> = {}): GoalStep => ({
  key: s.id,
  title: s.name,
  detail: [s.change, s.status].filter(Boolean).join(" · "),
  systems: [{ id: s.id, name: s.name }],
  monthly: figOfVal(s.delta),
  effort: s.effort,
  risk: s.risk,
  confidence: s.confidence,
  compatibility: s.compat.score,
  picked: true,
  href,
  ...extra,
});

// ───────────────────────── modelli e fornitori dell'estate (per i moduli) ─────────────────────────

/** Fornitori del catalogo da cui dipende l'estate, per quota di spesa. */
export function estateProviders(ctx: ImpactContext): { id: string; label: string; share: number }[] {
  return ctx.est.concentration.rows
    .filter((r) => r.providerKey.startsWith("provider:") && !r.providerKey.startsWith("provider:name:") && r.providerKey !== "provider:angar")
    .map((r) => ({ id: r.providerKey.slice("provider:".length), label: r.label, share: r.share }));
}

/** Modelli usati nell'estate con una data di ritiro o già deprecati, dal più vicino. */
export function retiringModels(ctx: ImpactContext): { id: string; label: string; date: string | null }[] {
  const seen = new Map<string, { id: string; label: string; date: string | null; t: number }>();
  for (const r of ctx.est.rows)
    for (const u of r.uses) {
      const id = u.modelId ?? resolveModel(u.rawModel)?.model.id ?? null;
      const m = id ? modelById(id) : null;
      if (!m || seen.has(m.id)) continue;
      if (m.lifecycle === "active" && !m.retiresAt) continue;
      if (m.lifecycle === "preview" && !m.retiresAt) continue;
      seen.set(m.id, { id: m.id, label: `${m.name} (${m.lifecycle})`, date: m.retiresAt ? m.retiresAt.toISOString().slice(0, 10) : null, t: m.retiresAt?.getTime() ?? Infinity });
    }
  return [...seen.values()].sort((a, b) => a.t - b.t || a.label.localeCompare(b.label)).map(({ t: _t, ...x }) => (void _t, x));
}

// ───────────────────────── 1. risparmiare €X l'anno ─────────────────────────

export function goalSave(ctx: ImpactContext, target: number): GoalAnswer {
  const sc = { s: "budget" as const, target };
  const res = runScenario(ctx, sc);
  const b = res.budget;
  const actions = b?.actions ?? [];
  const steps: GoalStep[] = actions.slice(0, 12).map((a) => ({
    key: a.key,
    title: a.title,
    detail: a.detail,
    systems: a.systems.map((s) => ({ id: s.id, name: s.label })),
    monthly: a.monthly.eur != null ? { eur: -r2(a.monthly.eur), kind: a.monthly.kind === "calculated" ? "calculated" : "estimated", basis: a.monthly.basis } : null,
    effort: a.effort,
    risk: null,
    confidence: a.confidence,
    compatibility: a.compatibility,
    picked: a.picked,
    href: a.systems[0]?.href ?? null,
  }));
  const total = b?.total.eur ?? 0;
  const picked = actions.filter((a) => a.picked).length;
  return {
    kind: "save",
    title: `Save ${eur(target)} a year`,
    summary: !actions.length
      ? "No saving action found in the estate."
      : b?.reached
        ? `Reached with ${plural(picked, "action")}: ${eur(total)} a year (${b.total.kind}).`
        : `The actions found add up to ${eur(total)} a year, ${eur(target - total)} short.`,
    steps,
    impactHref: impactHref(sc),
    basis: "Annual saving × confidence ÷ effort; picked in order until the target is reached. Same rule as the Impact Simulator budget scenario.",
    empty: res.empty ?? null,
  };
}

// ───────────────────────── 2. ridurre la dipendenza da un fornitore ─────────────────────────

/** Alternativa migliore di un ALTRO fornitore (ordine di Replaceability, mai per prezzo). */
const otherProvider = (all: Alternative[], provider: string) => all.find((a) => a.providerId !== provider) ?? null;

export function goalDependency(ctx: ImpactContext, provider: string): GoalAnswer {
  const name = providerNameOf(provider);
  const set = impactOf(ctx.est.graph, nodeKey("provider", provider));
  const steps: (GoalStep & { sortScore: number })[] = [];
  for (const s of set?.systems ?? []) {
    const row = ctx.est.rows.find((r) => r.id === s.node.id);
    const a = ctx.est.assessments.get(s.node.id);
    if (!row || !a) continue;
    const alt = otherProvider(a.repl.all, provider);
    const current = row.cost.actualEur ?? row.cost.estimatedEur;
    const delta = alt?.estimatedMonthlyEur != null && current != null ? alt.estimatedMonthlyEur - current * s.fraction : null;
    const primary = [...row.uses].sort((x, y) => (y.share ?? 0) - (x.share ?? 0))[0];
    const from = primary?.modelId ?? null;
    const href = alt
      ? alt.type === "model" && from
        ? `/impact?s=replace-model&from=${encodeURIComponent(from)}&to=${encodeURIComponent(alt.id)}&system=${encodeURIComponent(row.id)}`
        : `/impact?s=replace-provider&from=${encodeURIComponent(provider)}&to=${encodeURIComponent(alt.providerId)}&system=${encodeURIComponent(row.id)}`
      : `/assets/${row.id}?tab=estate`;
    steps.push({
      key: row.id,
      title: row.name,
      detail: alt ? `→ ${alt.name} (${alt.providerName}) · fit ${alt.compatibility}% · ${alt.tested ? "tested" : "not tested"}` : `No alternative outside ${name} in the catalog`,
      systems: [{ id: row.id, name: row.name }],
      monthly: delta != null ? { eur: r2(delta), kind: row.cost.actualEur != null ? "calculated" : "estimated", basis: `${alt!.name} ${eur(alt!.estimatedMonthlyEur!)} − current ${eur(current! * s.fraction)} (${alt!.estimateBasis})` } : null,
      effort: alt?.effort ?? a.repl.effort,
      risk: alt ? (alt.tested ? "Low" : alt.compatibility >= 70 ? "Medium" : "High") : "High",
      confidence: alt?.confidence ?? null,
      compatibility: alt?.compatibility ?? null,
      picked: !!alt && alt.gaps.length === 0,
      href,
      sortScore: alt ? alt.score : -1,
    });
  }
  steps.sort((a, b) => b.sortScore - a.sortScore || (a.monthly?.eur ?? 0) - (b.monthly?.eur ?? 0) || a.title.localeCompare(b.title));
  const movable = steps.filter((s) => s.picked);
  const delta = movable.reduce((t, s) => t + (s.monthly?.eur ?? 0), 0);
  const exposed = (set?.monthly.actualEur ?? 0) + (set?.monthly.estimatedEur ?? 0);
  return {
    kind: "dependency",
    title: `Reduce dependency on ${name}`,
    summary: !steps.length
      ? `No AI system depends on ${name}.`
      : `${plural(steps.length, "AI system")} depend on ${name}${exposed > 0 ? ` (${eur(exposed)} a month)` : ""}. ${movable.length ? `${plural(movable.length, "system")} can move with no capability gap; cost change ${delta <= 0 ? "" : "+"}${eur(delta)} a month.` : "None can move without a capability gap yet."}`,
    steps: steps.map(({ sortScore: _s, ...x }) => (void _s, x)),
    impactHref: `/impact?s=outage&provider=${encodeURIComponent(provider)}`,
    basis: "Ranked by Replaceability score of the best alternative from another provider, then by cost change. Never by price alone.",
    empty: steps.length ? null : `No AI system depends on ${name}.`,
  };
}

// ───────────────────────── 3. solo UE ─────────────────────────

export function goalEuOnly(ctx: ImpactContext): GoalAnswer {
  const sc = { s: "eu-only" as const };
  const res = runScenario(ctx, sc);
  const order: Record<string, number> = { "Change model": 0, "Move deployment": 1, "Fix in settings": 2, "Not known": 3, EU: 4 };
  const todo = res.systems.filter((s) => s.status && s.status !== "EU");
  const steps = [...todo]
    .sort((a, b) => (order[a.status ?? ""] ?? 5) - (order[b.status ?? ""] ?? 5) || a.name.localeCompare(b.name))
    .map((s) => stepOf(s, `/impact?s=eu-only#sys-${s.id}`));
  const ok = res.systems.length - todo.length;
  return {
    kind: "eu-only",
    title: "Go EU-only",
    summary: res.systems.length ? `${plural(ok, "AI system")} already ${ok === 1 ? "keeps" : "keep"} data in the EU; ${todo.length} ${todo.length === 1 ? "needs" : "need"} a change.` : "No AI system in the estate yet.",
    steps,
    impactHref: impactHref(sc),
    basis: "Change model first, then deployment moves, then settings. Same checks as the Impact Simulator EU-only scenario.",
    empty: res.empty ?? (todo.length ? null : "Every AI system already keeps data in the EU."),
  };
}

// ───────────────────────── 4. prepararsi a una deprecazione ─────────────────────────

export function goalDeprecation(ctx: ImpactContext, model?: string | null): GoalAnswer {
  const options = retiringModels(ctx);
  const id = model && modelById(model) ? model : options[0]?.id ?? null;
  if (!id) return { kind: "deprecation", title: "Prepare for a deprecation", summary: "No model in use is deprecated or retiring.", steps: [], impactHref: null, basis: "Models from the angar catalog with a deprecated or retired lifecycle, or a retirement date.", empty: "No model in use is deprecated or retiring." };
  const sc = { s: "deprecation" as const, model: id };
  const res = runScenario(ctx, sc);
  const steps = [...res.systems].sort((a, b) => (b.compat.score ?? -1) - (a.compat.score ?? -1) || a.name.localeCompare(b.name)).map((s) => stepOf(s, `/assets/${s.id}?tab=estate`));
  const name = modelById(id)?.name ?? id;
  const fits = steps.filter((s) => (s.compatibility ?? 0) >= 70).length;
  return {
    kind: "deprecation",
    title: res.title,
    summary: steps.length ? `${plural(steps.length, "AI system")} ${steps.length === 1 ? "uses" : "use"} ${name}; ${fits} ${fits === 1 ? "has" : "have"} a candidate that fits at least 70%.` : `No AI system uses ${name}.`,
    steps,
    impactHref: impactHref(sc),
    basis: "Candidate: the replacement named in the catalog, otherwise the most compatible active model (never the cheapest).",
    empty: res.empty ?? null,
  };
}

// ───────────────────────── 5. quali AI si possono migrare ─────────────────────────

export function goalMigrate(ctx: ImpactContext): GoalAnswer {
  const steps: (GoalStep & { sortScore: number })[] = [];
  for (const row of ctx.est.rows) {
    const a = ctx.est.assessments.get(row.id);
    const best = a?.repl.best;
    if (!a || !a.repl.applicable || !best || a.repl.score == null) continue;
    const imp = impactOf(ctx.est.graph, nodeKey("system", row.id));
    const touched = (imp?.processes.length ?? 0) + (imp?.applications.length ?? 0);
    const saving = best.savingEur ?? 0;
    const risk: Risk = best.gaps.length || best.compatibility < 70 ? "High" : best.tested ? "Low" : "Medium";
    const score =
      ((a.repl.score / 100) * MIGRATE_RANK.conf[best.confidence] * (1 + Math.max(0, saving) / 100)) /
      MIGRATE_RANK.effort[best.effort] /
      MIGRATE_RANK.risk[risk] /
      (1 + touched * MIGRATE_RANK.impactEach);
    const primary = [...row.uses].sort((x, y) => (y.share ?? 0) - (x.share ?? 0))[0];
    const from = primary?.modelId ?? null;
    steps.push({
      key: row.id,
      title: row.name,
      detail: `→ ${best.name} · Replaceability ${a.repl.score}/100 · fit ${best.compatibility}%${touched ? ` · ${plural(touched, "dependent")}` : ""}`,
      systems: [{ id: row.id, name: row.name }],
      monthly: best.savingEur != null ? { eur: -r2(best.savingEur), kind: "estimated", basis: best.estimateBasis } : null,
      effort: best.effort,
      risk,
      confidence: best.confidence,
      compatibility: best.compatibility,
      picked: risk !== "High",
      href: best.type === "model" && from ? `/impact?s=replace-model&from=${encodeURIComponent(from)}&to=${encodeURIComponent(best.id)}&system=${encodeURIComponent(row.id)}` : `/assets/${row.id}?tab=estate`,
      sortScore: Math.round(score * 1000) / 1000,
    });
  }
  steps.sort((a, b) => b.sortScore - a.sortScore || a.title.localeCompare(b.title));
  const ready = steps.filter((s) => s.picked).length;
  return {
    kind: "migrate",
    title: "Which AI can we migrate?",
    summary: steps.length ? `${plural(steps.length, "AI system")} assessed; ${ready} can move without a capability gap.` : "No AI system has a model or product to assess yet.",
    steps: steps.map(({ sortScore: _s, ...x }) => (void _s, x)),
    impactHref: null,
    basis: `Replaceability × confidence (High 1, Medium 0.7, Low 0.4) × (1 + monthly saving ÷ €100) ÷ effort (1 / 1.5 / 2.5) ÷ risk (1 / 1.3 / 2) ÷ (1 + ${MIGRATE_RANK.impactEach} × dependent processes and applications).`,
    empty: steps.length ? null : "No AI system has a model or product to assess yet.",
  };
}

// ───────────────────────── ingresso unico ─────────────────────────

export function answerGoal(ctx: ImpactContext, kind: GoalKind, p: GoalParams = {}): GoalAnswer | null {
  switch (kind) {
    case "save":
      return p.target && p.target > 0 ? goalSave(ctx, p.target) : null;
    case "dependency": {
      const provider = p.provider || estateProviders(ctx)[0]?.id;
      return provider ? goalDependency(ctx, provider) : null;
    }
    case "eu-only":
      return goalEuOnly(ctx);
    case "deprecation":
      return goalDeprecation(ctx, p.model);
    case "migrate":
      return goalMigrate(ctx);
  }
}

export const isGoal = (s: string | null | undefined): s is GoalKind => GOALS.some((g) => g.kind === s);

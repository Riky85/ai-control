/**
 * Exit Readiness (0–100 + stato): "se questo fornitore diventasse troppo caro, non
 * disponibile o non più desiderabile, quanto siamo pronti a lasciarlo?"
 *
 * Controlli con punti fissi; quelli non applicabili (es. deployment di riserva per un
 * prodotto a posti) escono dal totale. Ogni controllo non superato è un blocco.
 * Puro: nessun accesso al database.
 */
import type { Replaceability } from "./replaceability";

export type ExitStatus = "Not ready" | "Partially ready" | "Ready" | "Production-ready";

export interface ExitCheck {
  key: string;
  label: string;
  points: number;
  earned: number;
  applicable: boolean;
  /** Testo del blocco quando il controllo non è superato (o lo è solo in parte). */
  blocker: string | null;
}

export interface ExitReadiness {
  score: number;
  status: ExitStatus;
  checks: ExitCheck[];
  blockers: string[];
}

export interface Fallback {
  /** Riserva configurata davvero (es. Gateway con più fornitori a valle). */
  configured: string | null;
  /** Riserva possibile ma non configurata (stesso modello su un altro deployment del catalogo). */
  available: string | null;
}

export interface ExitInput {
  repl: Replaceability;
  /** Numero di prove registrate per questo AI system (qualsiasi candidato). */
  evaluations: number;
  /** Almeno una prova superata. */
  passedEvaluation: boolean;
  fallback: Fallback;
  contract: { annual: boolean; renewalInDays: number | null } | null;
}

export const EXIT_POINTS = { tested: 25, api: 20, suite: 15, fallback: 20, contract: 10, residency: 10 } as const;

export function statusOf(score: number, tested: boolean, fallbackConfigured: boolean): ExitStatus {
  if (score >= 85 && tested && fallbackConfigured) return "Production-ready";
  if (score >= 65 && tested) return "Ready";
  if (score >= 35) return "Partially ready";
  return "Not ready";
}

export function exitReadiness(i: ExitInput): ExitReadiness {
  const seat = i.repl.kind === "seat";
  // Uscire dal fornitore: conta l'alternativa migliore di un altro fornitore.
  const best = i.repl.bestOtherProvider;
  const apiComp = best?.components.find((c) => c.key === "api");
  const dataComp = best?.components.find((c) => c.key === "data" || c.key === "export");
  const checks: ExitCheck[] = [];
  const add = (key: string, label: string, points: number, earned: number, applicable: boolean, blocker: string | null) => checks.push({ key, label, points, earned: applicable ? earned : 0, applicable, blocker: applicable && earned < points ? blocker : null });

  add("tested", "Tested alternative", EXIT_POINTS.tested, i.passedEvaluation ? EXIT_POINTS.tested : 0, true, seat ? "No pilot of an alternative" : "No tested alternative");
  if (seat) add("api", "Loose coupling", EXIT_POINTS.api, 0, false, null);
  else {
    const ps = i.repl.current.providerSpecific;
    const s = apiComp?.score ?? 0;
    const earned = s >= 80 && !ps.length ? EXIT_POINTS.api : s >= 50 ? EXIT_POINTS.api / 2 : 0;
    add("api", "Loose coupling", EXIT_POINTS.api, earned, true, ps.length ? `Provider-specific features: ${ps.join(", ")}` : best ? "Tightly coupled API" : "No alternative from another provider");
  }
  add("suite", seat ? "Pilot plan" : "Evaluation suite", EXIT_POINTS.suite, i.evaluations > 0 ? EXIT_POINTS.suite : 0, true, seat ? "No pilot recorded" : "No evaluation suite");
  if (seat) add("fallback", "Fallback deployment", EXIT_POINTS.fallback, 0, false, null);
  else add("fallback", "Fallback deployment", EXIT_POINTS.fallback, i.fallback.configured ? EXIT_POINTS.fallback : i.fallback.available ? EXIT_POINTS.fallback / 2 : 0, true, i.fallback.available ? `No fallback configured (available on ${i.fallback.available})` : "No fallback deployment");
  {
    const c = i.contract;
    const far = c?.renewalInDays != null && c.renewalInDays > 90;
    const earned = !c ? EXIT_POINTS.contract : c.annual && far ? 0 : c.annual || far ? EXIT_POINTS.contract / 2 : EXIT_POINTS.contract;
    add("contract", "Contract", EXIT_POINTS.contract, earned, true, [c?.annual ? "annual commitment" : null, far ? `renewal in ${Math.round(c!.renewalInDays! / 30)} months` : null].filter(Boolean).join(", ").replace(/^./, (x) => x.toUpperCase()) || "Contract constraints");
  }
  add("residency", seat ? "Data export" : "Data residency", EXIT_POINTS.residency, (dataComp?.score ?? 0) >= 100 ? EXIT_POINTS.residency : (dataComp?.score ?? 0) >= 50 ? EXIT_POINTS.residency / 2 : 0, true, seat ? "Data export not confirmed" : "No alternative meets data residency");

  const total = checks.filter((c) => c.applicable).reduce((t, c) => t + c.points, 0);
  const earned = checks.reduce((t, c) => t + c.earned, 0);
  const score = total ? Math.round((earned / total) * 100) : 0;
  return { score, status: statusOf(score, i.passedEvaluation, !!i.fallback.configured), checks, blockers: checks.map((c) => c.blocker).filter((b): b is string => !!b) };
}

/** Exit readiness di un fornitore: media dei suoi AI system pesata sulla spesa (uguale se nessuna spesa), blocchi con il conteggio. */
export function providerExit(rows: { exit: ExitReadiness; weight: number }[]): ExitReadiness & { systems: number } {
  if (!rows.length) return { score: 0, status: "Not ready", checks: [], blockers: [], systems: 0 };
  const w = rows.reduce((t, r) => t + r.weight, 0);
  const score = Math.round(w > 0 ? rows.reduce((t, r) => t + r.exit.score * r.weight, 0) / w : rows.reduce((t, r) => t + r.exit.score, 0) / rows.length);
  const count = new Map<string, number>();
  for (const r of rows) for (const c of r.exit.checks) if (c.blocker) count.set(c.label, (count.get(c.label) ?? 0) + 1);
  const blockers = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => `${label} missing · ${n} of ${rows.length} AI`);
  // Il fornitore non è più pronto del suo AI system meno pronto.
  const order: ExitStatus[] = ["Not ready", "Partially ready", "Ready", "Production-ready"];
  const worst = rows.map((r) => order.indexOf(r.exit.status)).reduce((a, b) => Math.min(a, b), 3);
  const byScore = order.indexOf(statusOf(score, true, true));
  return { score, status: order[Math.min(worst, byScore)], checks: [], blockers, systems: rows.length };
}

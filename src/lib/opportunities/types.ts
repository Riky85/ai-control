/**
 * Opportunities — il motore decisionale (spec §12): l'uscita azionabile di tutti i motori
 * (risparmi, Angar Score, estate, cambi di mercato, Impact Simulator, prezzi).
 * Tipi puri: nessun database, nessun "use client".
 *
 * Regola sui numeri: ogni cifra porta il suo tipo (reale / calcolata / stimata) e la base di
 * calcolo. Nessun numero inventato: se un valore non è noto resta null.
 */
import type { Effort, Conf } from "@/lib/estate/replaceability";

export type { Effort, Conf };

export const CATEGORIES = ["SAVE", "CONSOLIDATE", "SWITCH", "REMOVE", "REDUCE_DEPENDENCY", "FIX", "REVIEW"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  SAVE: "Save",
  CONSOLIDATE: "Consolidate",
  SWITCH: "Switch",
  REMOVE: "Remove",
  REDUCE_DEPENDENCY: "Reduce dependency",
  FIX: "Fix",
  REVIEW: "Review",
};

export const STATUSES = ["new", "accepted", "in_progress", "done", "dismissed"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = { new: "New", accepted: "Accepted", in_progress: "In progress", done: "Done", dismissed: "Dismissed" };

export type Risk = "Low" | "Medium" | "High";

/** Tipo di una cifra: reale (fatturata), calcolata (aritmetica su cifre reali), stimata (listino o ipotesi). */
export type FigureKind = "actual" | "calculated" | "estimated";

export interface Figure {
  /** EUR al mese. */
  eur: number;
  kind: FigureKind;
  basis: string;
}

/** Da dove viene l'opportunità (un'opportunità può unire più motori dopo il dedupe). */
export type Engine = "savings" | "score" | "estate" | "market" | "impact" | "pricing";

export interface AffectedSystem {
  id: string;
  name: string;
  vendor: string | null;
}

export interface Opportunity {
  /** Chiave deterministica: stessa situazione → stessa chiave (lo stato si salva su questa). */
  key: string;
  title: string;
  category: Category;
  systems: AffectedSystem[];
  /** Fatti osservati che sostengono l'opportunità (righe brevi). */
  evidence: string[];
  /** Perché conviene considerarla. */
  reason: string;
  currentCost: Figure | null;
  expectedCost: Figure | null;
  /** Risparmio mensile potenziale (annuo = × 12). null = nessun euro (azione sui dati o sul rischio). */
  savings: Figure | null;
  /**
   * Quota del risparmio che entra nel totale (stesso tetto del motore dei risparmi: mai oltre il
   * costo di un'AI, mai due volte). 0 = mostrato ma non sommato (es. alternativa non provata).
   */
  countedMonthlyEur: number;
  /** Perché il risparmio non entra nel totale (se non entra). */
  notCountedWhy: string | null;
  effort: Effort;
  migrationImpact: string;
  risk: Risk;
  confidence: Conf;
  /** Processi aziendali che dipendono dalle AI coinvolte (dal grafo). */
  processes: string[];
  recommendedAction: string;
  status: Status;
  /** Base di calcolo leggibile: come sono nati i numeri. */
  calculation: string[];
  engines: Engine[];
  /** Punti di Angar Score guadagnati (se l'azione è anche nel piano "Improve my score"). */
  scorePoints: number | null;
  /** Link "Review" (pagina dove si agisce). */
  href: string;
  /** Link "Simulate" all'Impact Simulator con i parametri (se c'è uno scenario adatto). */
  simulateHref: string | null;
  /** Lo stato vive nel registro dei risparmi (SavingAction / SavingDismissal) invece che in OpportunityState. */
  ledger: "savings" | "state";
  /** Ordinamento deterministico (più alto = prima). */
  rank: number;
}

export interface OpportunitySummary {
  /** Totale mensile senza doppi conteggi: coincide col totale del motore dei risparmi. */
  totalMonthly: number;
  /** Euro mostrati ma non sommati (alternative non provate, prezzi sopra listino…). */
  notCountedMonthly: number;
  open: number;
  byCategory: Record<Category, number>;
}

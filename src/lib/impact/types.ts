/**
 * Impact Simulator — tipi condivisi (puri, nessun "use client", nessun database).
 *
 * Ogni numero porta con sé il suo tipo (osservato / calcolato / stimato / non noto)
 * e la base di calcolo, così la pagina può mostrarlo senza inventare nulla.
 */
import type { Effort, Conf } from "@/lib/estate/replaceability";

export type { Effort, Conf };

/** Tipo di un valore: osservato (fatturato), calcolato (aritmetica su osservati), stimato (listino o ipotesi), non noto. */
export type Kind = "observed" | "calculated" | "estimated" | "unknown";

export interface Val {
  /** EUR (al mese, salvo dove indicato); null = non noto. */
  eur: number | null;
  kind: Kind;
  basis: string;
}

export type Risk = "Low" | "Medium" | "High";

export type ScenarioKind = "replace-model" | "replace-provider" | "remove-system" | "price-change" | "deprecation" | "outage" | "eu-only" | "budget" | "consolidate";

export type PriceComponent = "all" | "input" | "output" | "seat";

export type Scenario =
  | { s: "replace-model"; from: string; to: string; system?: string }
  | { s: "replace-provider"; from: string; to: string; system?: string }
  | { s: "remove-system"; system: string }
  | { s: "price-change"; provider: string; pct: number; component: PriceComponent; model?: string }
  | { s: "deprecation"; model: string; date?: string }
  | { s: "outage"; provider: string }
  | { s: "eu-only" }
  | { s: "budget"; target: number }
  | { s: "consolidate"; from: string; to: string };

export interface Named {
  id: string;
  label: string;
  sub?: string | null;
  href?: string | null;
}

export type CompatStatus = "fits" | "gaps" | "blocked" | "unknown" | "n/a";

export interface Compat {
  status: CompatStatus;
  /** Testo breve per la tabella ("Fits · not tested", "No reasoning"). */
  label: string;
  /** Compatibilità 0–100 dal punteggio di Replaceability; null = non calcolata. */
  score: number | null;
  gaps: string[];
  checks: { label: string; score: number | null; reason: string }[];
  tested: boolean;
  /** Modello / prodotto / deployment di destinazione. */
  target: string | null;
}

export interface SystemImpact {
  id: string;
  name: string;
  href: string;
  /** Quota del sistema toccata dallo scenario (0..1); null = non nota. */
  fraction: number | null;
  fractionNote: string;
  /** Cosa cambia ("GPT-4o → Claude Sonnet 5.5", "Removed", "Exposed"). */
  change: string;
  current: { actual: Val | null; estimated: Val | null; base: Val };
  projected: Val;
  /** projected − current (negativo = risparmio). */
  delta: Val;
  compat: Compat;
  effort: Effort | null;
  switching: Val;
  risk: Risk;
  riskWhy: string[];
  confidence: Conf;
  confidenceWhy: string;
  /** Stato specifico dello scenario (guasto, solo UE): "No fallback", "Fix in settings"… */
  status?: string | null;
  alternatives?: { name: string; provider: string; compatibility: number; effort: Effort; monthly: Val; gaps: string[] }[];
}

export interface ContractRow {
  systemId: string;
  system: string;
  billingCycle: string | null;
  renewalDate: string | null;
  inDays: number | null;
  source: string | null;
  /** Spesa già impegnata fino al rinnovo (contratti annuali). */
  committed: Val;
}

export interface BudgetAction {
  key: string;
  title: string;
  detail: string;
  lever: "seats" | "annual" | "premium" | "duplicate" | "idle" | "model" | "alternative" | "switch";
  systems: Named[];
  monthly: Val;
  annual: Val;
  effort: Effort;
  confidence: Conf;
  compatibility: number | null;
  /** Punteggio di classifica (vedi BUDGET_RANK). */
  score: number;
  picked: boolean;
  cumulativeAnnual: number | null;
}

export interface CalcLine {
  label: string;
  value: string;
  kind: Kind;
  basis: string;
}

export interface ImpactResult {
  scenario: Scenario;
  title: string;
  /** Riga d'apertura: la domanda in parole semplici. */
  question: string;
  systems: SystemImpact[];
  applications: Named[];
  processes: Named[];
  teams: Named[];
  data: Named[];
  contracts: ContractRow[];
  spend: {
    currentActual: Val;
    currentEstimated: Val;
    /** Sistemi coinvolti senza nessun costo noto. */
    unknown: number;
    current: Val;
    projected: Val;
    delta: Val;
    annualDelta: Val;
    /** Per guasti e solo UE: spesa esposta invece di proiettata. */
    exposedOnly?: boolean;
  };
  effort: Effort | null;
  switching: Val;
  risk: Risk;
  confidence: Conf;
  confidenceWhy: string;
  budget?: { target: number; reached: boolean; total: Val; actions: BudgetAction[] };
  notes: string[];
  calc: CalcLine[];
  /** Nulla da simulare (es. nessun sistema usa il modello). */
  empty?: string | null;
}

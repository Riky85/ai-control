/**
 * Riepilogo dell'AI Spend Check passato alla pagina del report (/check/report).
 * Resta solo nel browser del visitatore (localStorage): numeri aggregati, nomi delle AI
 * e gli addebiti AI già normalizzati (data, importo, servizio; massimo CHECK_MAX_CHARGES),
 * mai il file o le righe non AI. Dopo la registrazione si può importare nel workspace.
 */
import type { QuickLine, QuickSaving } from "@/lib/spend/quick";

export const CHECK_REPORT_KEY = "angar-check-report";
/** Tetto degli addebiti tenuti nello snapshot (lo stesso limite accettato dall'import). */
export const CHECK_MAX_CHARGES = 5000;

/** Addebito AI normalizzato del check (date in ISO). */
export interface CheckCharge {
  date: string;
  amountEur: number;
  description: string;
  service: string;
  seats?: number;
}

export interface CheckSnapshot {
  createdAt: string;
  months: number;
  spend: number;
  save: number;
  lines: Pick<QuickLine, "service" | "name" | "vendor" | "category" | "plan" | "seats" | "monthlyEur">[];
  savings: QuickSaving[];
  /** Assente negli snapshot salvati prima di questa versione (solo aggregati). */
  charges?: CheckCharge[];
}

export function saveSnapshot(s: CheckSnapshot) {
  try {
    const json = JSON.stringify(s);
    localStorage.setItem(CHECK_REPORT_KEY, json);
    sessionStorage.setItem(CHECK_REPORT_KEY, json);
  } catch {
    /* storage non disponibile (navigazione privata): il report resta vuoto */
  }
}

/** Cancella lo snapshot (dopo l'import nel workspace). */
export function clearSnapshot() {
  try {
    localStorage.removeItem(CHECK_REPORT_KEY);
    sessionStorage.removeItem(CHECK_REPORT_KEY);
  } catch {
    /* storage non disponibile */
  }
}

export function loadSnapshot(): CheckSnapshot | null {
  try {
    const raw = sessionStorage.getItem(CHECK_REPORT_KEY) ?? localStorage.getItem(CHECK_REPORT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as CheckSnapshot;
    return Array.isArray(s.lines) && typeof s.spend === "number" ? s : null;
  } catch {
    return null;
  }
}

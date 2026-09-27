/**
 * Riepilogo dell'AI Spend Check passato alla pagina del report (/check/report).
 * Resta solo nel browser del visitatore (localStorage): contiene i numeri
 * aggregati e i nomi delle AI, mai l'estratto conto o le singole righe.
 */
import type { QuickLine, QuickSaving } from "@/lib/spend/quick";

export const CHECK_REPORT_KEY = "angar-check-report";

export interface CheckSnapshot {
  createdAt: string;
  months: number;
  spend: number;
  save: number;
  lines: Pick<QuickLine, "service" | "name" | "vendor" | "category" | "plan" | "seats" | "monthlyEur">[];
  savings: QuickSaving[];
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

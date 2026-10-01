/**
 * Conversione in EUR degli importi letti da estratti conto e fatture.
 *
 * USD: usa USD_TO_EUR del catalogo prezzi (stessa fonte del resto dell'app).
 * Le altre valute europee usano una tabella STATICA e APPROSSIMATIVA
 * (cambi medi indicativi, settembre 2026, NON di mercato): basta a stimare
 * la spesa AI mensile, non a fare contabilità. Valute non in tabella: l'importo
 * resta nella valuta originale e viene marcato (convertible = false).
 */
import { USD_TO_EUR } from "@/lib/pricing/catalog";

/** EUR per 1 unità di valuta — APPROSSIMATIVO, aggiornare a mano se serve. */
const APPROX_EUR_PER_UNIT: Record<string, number> = {
  GBP: 1.17,
  CHF: 1.06,
  SEK: 0.09,
  NOK: 0.086,
  DKK: 0.134,
  PLN: 0.234,
  CZK: 0.04,
  HUF: 0.0025,
  RON: 0.2,
};

export interface FxResult {
  /** Importo in EUR (o nella valuta originale se non convertibile). */
  eur: number;
  currency: string;
  /** false = valuta sconosciuta, importo NON convertito. */
  convertible: boolean;
  /** true = convertito con la tabella statica approssimativa. */
  approximate: boolean;
}

export function toEur(amount: number, currency: string | null | undefined): FxResult {
  const cur = (currency ?? "EUR").trim().toUpperCase() || "EUR";
  if (cur === "EUR") return { eur: amount, currency: cur, convertible: true, approximate: false };
  if (cur === "USD") return { eur: amount * USD_TO_EUR, currency: cur, convertible: true, approximate: false };
  const rate = APPROX_EUR_PER_UNIT[cur];
  if (rate) return { eur: amount * rate, currency: cur, convertible: true, approximate: true };
  return { eur: amount, currency: cur, convertible: false, approximate: false };
}

/** Nota breve da aggiungere alla descrizione dell'addebito (vuota se EUR). */
export function fxNote(original: number, fx: FxResult): string {
  if (fx.currency === "EUR") return "";
  const amt = `${fx.currency} ${original.toFixed(2)}`;
  if (!fx.convertible) return ` [${amt}, not converted]`;
  return ` [${amt}${fx.approximate ? ", approx. rate" : ""}]`;
}

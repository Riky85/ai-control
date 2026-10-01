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

/**
 * Somma in EUR di importi raggruppati per valuta (es. fatturazione OpenAI /
 * Anthropic, che restituisce USD). `original` elenca le valute non EUR con
 * l'importo originale ("USD 12.50"), da mettere nella nota del costo;
 * `unconverted` le valute che non è stato possibile convertire.
 */
export function totalsToEur(totals: Map<string, number> | Record<string, number>): { eur: number; original: string; unconverted: string[] } {
  const entries = totals instanceof Map ? Array.from(totals.entries()) : Object.entries(totals);
  let eur = 0;
  const original: string[] = [];
  const unconverted: string[] = [];
  for (const [currency, amount] of entries) {
    if (!Number.isFinite(amount)) continue;
    const fx = toEur(amount, currency);
    eur += fx.eur;
    if (fx.currency !== "EUR") original.push(`${fx.currency} ${amount.toFixed(2)}`);
    if (!fx.convertible) unconverted.push(fx.currency);
  }
  return { eur: Math.round(eur * 100) / 100, original: original.join(", "), unconverted };
}

/**
 * Nota del costo mensile letto dalla fatturazione di un provider (stesso
 * formato dei connettori cloud). Inizia sempre con "EUR,": è anche il
 * marcatore che distingue le righe già in EUR da quelle vecchie in USD
 * (vedi spend/fx-fix.ts).
 */
export const billingCostNote = (billingName: string, original: string) =>
  `EUR, last 30 days, from ${billingName}${original ? ` (${original} converted)` : ""}`;

/** Nota breve da aggiungere alla descrizione dell'addebito (vuota se EUR). */
export function fxNote(original: number, fx: FxResult): string {
  if (fx.currency === "EUR") return "";
  const amt = `${fx.currency} ${original.toFixed(2)}`;
  if (!fx.convertible) return ` [${amt}, not converted]`;
  return ` [${amt}${fx.approximate ? ", approx. rate" : ""}]`;
}

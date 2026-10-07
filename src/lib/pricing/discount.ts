/**
 * Calcoli minimi sugli abbonamenti inseriti a mano, SENZA import: li usa anche il modulo
 * client dell'editor (niente catalogo nel bundle del browser).
 */

export type Period = "month" | "quarter" | "year";

/** Mesi in un periodo di fatturazione. */
export const monthsIn = (p: string | null | undefined) => (p === "year" ? 12 : p === "quarter" ? 3 : 1);

/** Importo mensile da un importo espresso in un periodo ("year" → ÷ 12). */
export const toMonthly = (amount: number, p: string | null | undefined) => amount / monthsIn(p);

/**
 * Sconto del prezzo di contratto sul listino, come frazione (0.15 = 15% sotto il listino;
 * negativo = sopra il listino). Entrambi gli importi nella stessa valuta e allo stesso periodo.
 * null se manca il listino (mai inventato) o il prezzo di contratto.
 */
export function discountPct(list: number | null | undefined, contract: number | null | undefined): number | null {
  if (list == null || contract == null || !Number.isFinite(list) || !Number.isFinite(contract) || list <= 0) return null;
  return (list - contract) / list;
}

/** "15% below list", "3% above list", "Same as list". */
export function discountText(d: number | null): string {
  if (d == null) return "Discount UNKNOWN";
  const pct = Math.round(Math.abs(d) * 1000) / 10;
  if (pct < 0.05) return "Same as list";
  return d > 0 ? `${pct}% below list` : `${pct}% above list`;
}

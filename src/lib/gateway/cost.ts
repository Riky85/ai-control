/**
 * angar Gateway — costo di una richiesta dai token misurati (puro).
 *
 * Prezzi: la tabella API_MODELS del catalogo (stessa fonte di Savings e del
 * simulatore). Gli embedding non sono in quella tabella: piccola tabella qui
 * sotto. Conversione USD → EUR con spend/fx.ts.
 */
import { apiModelFor } from "@/lib/pricing/catalog";
import { toEur } from "@/lib/spend/fx";

/** Embedding: prezzo di listino, settembre 2026 (USD per 1M token in ingresso). */
const EMBEDDING_USD: [RegExp, number][] = [
  [/text-embedding-3-large/i, 0.13],
  [/text-embedding-3-small/i, 0.02],
  [/text-embedding-ada/i, 0.1],
  [/embed/i, 0.1],
];

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** Anthropic: token scritti / letti dalla cache del prompt (già esclusi da inputTokens). */
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
}

export interface Price {
  inUsd: number;
  outUsd: number;
  known: boolean;
}

export function priceFor(model: string | null | undefined): Price {
  if (!model) return { inUsd: 0, outUsd: 0, known: false };
  for (const [re, usd] of EMBEDDING_USD) if (re.test(model)) return { inUsd: usd, outUsd: 0, known: true };
  const m = apiModelFor(model);
  return m ? { inUsd: m.inUsd, outUsd: m.outUsd, known: true } : { inUsd: 0, outUsd: 0, known: false };
}

/** Costo in USD e in EUR. Cache Anthropic: scrittura 1,25×, lettura 0,1× del prezzo di ingresso. */
export function costOf(model: string | null | undefined, u: Usage): { usd: number; eur: number; known: boolean } {
  const p = priceFor(model);
  const inEq = u.inputTokens + (u.cacheWriteTokens ?? 0) * 1.25 + (u.cacheReadTokens ?? 0) * 0.1;
  const usd = (inEq * p.inUsd + u.outputTokens * p.outUsd) / 1_000_000;
  return { usd, eur: toEur(usd, "USD").eur, known: p.known };
}

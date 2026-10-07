/**
 * angar Gateway — costo di una richiesta dai token misurati (puro).
 *
 * Prezzi: dal servizio prezzi (pricing/service.ts), cioè dal catalogo versionato
 * con provenienza — stessa fonte di Savings e del simulatore, embedding compresi.
 * Il costo è una STIMA (token × listino), convertita in EUR con spend/fx.ts.
 */
import { estimateTokenCost, getPrice } from "@/lib/pricing/service";

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

/** Prezzo di listino (API diretta) di input e output per 1M token. */
export function priceFor(model: string | null | undefined): Price {
  if (!model) return { inUsd: 0, outUsd: 0, known: false };
  const i = getPrice(model, null, null, "input");
  if (!i) return { inUsd: 0, outUsd: 0, known: false };
  const o = getPrice(model, null, null, "output");
  return { inUsd: i.price, outUsd: o?.price ?? 0, known: true };
}

/** Costo stimato in valuta di listino e in EUR (cache: voci del catalogo, altrimenti 1,25× / 0,1× l'input). */
export function costOf(model: string | null | undefined, u: Usage): { usd: number; eur: number; known: boolean } {
  const e = estimateTokenCost({
    model: model ?? "",
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    cacheWriteTokens: u.cacheWriteTokens,
    cachedInputTokens: u.cacheReadTokens,
  });
  return { usd: e.amount, eur: e.eur, known: e.known };
}

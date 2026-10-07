/**
 * Funzioni di comodo per scrivere il catalogo in modo compatto e leggibile.
 * Solo costruzione di dati: nessun prezzo qui dentro.
 */
import type { Confidence, Provenance, SeedComponent, ServiceTier } from "./types";

/** Data dell'ultima verifica manuale delle pagine ufficiali. */
export const VERIFIED_ON = "2026-10-07";

export const official = (url: string, note?: string): Provenance => ({ url, type: "official", verified: VERIFIED_ON, confidence: "HIGH", note });

/** Valore non verificato oggi su una pagina ufficiale: mai "official". */
export const secondary = (url: string | null, verified: string, confidence: Confidence = "MEDIUM", note?: string): Provenance => ({
  url,
  type: "secondary",
  verified,
  confidence,
  note,
});

/** Stima di angar (es. un moltiplicatore applicato a un prezzo ufficiale). */
export const estimate = (note: string, verified = VERIFIED_ON, confidence: Confidence = "LOW", url: string | null = null): Provenance => ({
  url,
  type: "angar_estimate",
  verified,
  confidence,
  note,
});

export interface TokenPrices {
  input: number;
  output: number;
  cached?: number;
  cacheWrite?: number;
  cacheWrite1h?: number;
}

export interface Where {
  from: string;
  until?: string;
  region?: string;
  tier?: ServiceTier;
  contextAbove?: number;
  currency?: "USD" | "EUR";
  note?: string;
}

/** Voci a token (prezzi per 1M token). */
export function tokens(src: Provenance, p: TokenPrices, w: Where): SeedComponent[] {
  const base = { unit: "1M_tokens" as const, currency: w.currency ?? ("USD" as const), region: w.region, serviceTier: w.tier, contextAbove: w.contextAbove, from: w.from, until: w.until, src, note: w.note };
  const out: SeedComponent[] = [
    { ...base, kind: "input", price: p.input },
    { ...base, kind: "output", price: p.output },
  ];
  if (p.cached != null) out.push({ ...base, kind: "cached_input", price: p.cached });
  if (p.cacheWrite != null) out.push({ ...base, kind: "cache_write", price: p.cacheWrite });
  if (p.cacheWrite1h != null) out.push({ ...base, kind: "cache_write_1h", price: p.cacheWrite1h });
  return out;
}

/** Moltiplica dei prezzi a token (sconto Batch, sovrapprezzo regionale, contesto lungo). */
export function scaled(p: TokenPrices, f: { input: number; output?: number; cache?: number }): TokenPrices {
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  const o = f.output ?? f.input;
  const c = f.cache ?? f.input;
  return {
    input: r(p.input * f.input),
    output: r(p.output * o),
    cached: p.cached != null ? r(p.cached * c) : undefined,
    cacheWrite: p.cacheWrite != null ? r(p.cacheWrite * c) : undefined,
    cacheWrite1h: p.cacheWrite1h != null ? r(p.cacheWrite1h * c) : undefined,
  };
}

/** Posti: prezzo mensile (fatturazione mensile) e mensile equivalente con fatturazione annuale. */
export function seat(src: Provenance, p: { monthly?: number; annual?: number }, w: Where, annualSrc: Provenance = src): SeedComponent[] {
  const base = { unit: "seat_month" as const, currency: w.currency ?? ("USD" as const), region: w.region, serviceTier: w.tier, from: w.from, until: w.until, note: w.note };
  const out: SeedComponent[] = [];
  if (p.monthly != null) out.push({ ...base, kind: "seat_monthly", price: p.monthly, src });
  if (p.annual != null) out.push({ ...base, kind: "seat_annual", price: p.annual, src: annualSrc });
  return out;
}

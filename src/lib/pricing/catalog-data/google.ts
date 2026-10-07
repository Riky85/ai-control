/**
 * Google — Gemini API (livello a pagamento). Verificati il 2026-10-07 su
 * ai.google.dev/gemini-api/docs/pricing e /deprecations.
 *
 * Variazione annunciata: Gemini 3.8 / 3.7 / 3.6 Flash costano il prezzo attuale
 * fino al 31/12/2026 e il DOPPIO dall'1/01/2027 → due versioni con date.
 * Prompt oltre 200K token (modelli Pro): prezzi dedicati. Ricerca Google
 * (grounding): 5.000 richieste gratuite al mese, poi $14 ogni 1.000.
 */
import { official, secondary, tokens, scaled, type TokenPrices } from "./helpers";
import type { Capabilities, Lifecycle, SeedComponent, SeedModel, Tier } from "./types";

const PRICING = "https://ai.google.dev/gemini-api/docs/pricing";
const DEPRECATIONS = "https://ai.google.dev/gemini-api/docs/deprecations";
const src = official(PRICING);
const DOUBLING = "2027-01-01";

const CAPS: Capabilities = { toolCalling: true, structuredOutput: true, vision: true, audio: true, reasoning: true, batch: true, caching: true, streaming: true, embeddings: false, fineTuning: false };
const SEARCH = (from: string): SeedComponent => ({ kind: "search", unit: "1K_requests", price: 14, currency: "USD", from, src: official(PRICING, "5,000 free search requests a month (shared across Gemini 3.x), then $14 / 1K"), note: "Grounding with Google Search" });

/** Standard + Batch + Flex + Priority dalla tabella ufficiale. */
function tiers(p: TokenPrices, batch: TokenPrices, priority: TokenPrices, w: { from: string; until?: string; contextAbove?: number }): SeedComponent[] {
  return [
    ...tokens(src, p, w),
    ...tokens(src, batch, { ...w, tier: "batch" }),
    ...tokens(src, batch, { ...w, tier: "flex" }),
    ...tokens(src, priority, { ...w, tier: "priority" }),
  ];
}

function gemini(
  apiId: string,
  name: string,
  family: string,
  tier: Tier,
  lifecycle: Lifecycle,
  meta: Partial<SeedModel>,
  components: SeedComponent[],
): SeedModel {
  return {
    provider: "google",
    apiId,
    name,
    family,
    tier,
    lifecycle,
    in: ["text", "image", "audio", "video", "pdf"],
    out: ["text"],
    caps: CAPS,
    contextWindow: 1_048_576,
    src: official(DEPRECATIONS),
    ...meta,
    rules: [{ deployment: "google-direct", components }],
  };
}

/** Flash 3.6 / 3.7 / 3.8: prezzo fino al 31/12/2026, doppio dall'1/01/2027. */
function flashDoubling(release: string): SeedComponent[] {
  const now: TokenPrices = { input: 0.75, cached: 0.075, output: 3.75 };
  const batch: TokenPrices = { input: 0.375, output: 1.875 };
  const prio: TokenPrices = { input: 1.35, output: 6.75 };
  return [
    ...tiers(now, batch, prio, { from: release, until: DOUBLING }),
    ...tiers(scaled(now, { input: 2 }), scaled(batch, { input: 2 }), scaled(prio, { input: 2 }), { from: DOUBLING }),
    SEARCH(release),
  ];
}

export const GOOGLE_MODELS: SeedModel[] = [
  gemini("gemini-3.1-pro-preview", "Gemini 3.1 Pro (preview)", "Gemini Pro", "frontier", "preview", { releasedAt: "2026-02-19" }, [
    ...tiers({ input: 2, cached: 0.2, output: 12 }, { input: 1, output: 6 }, { input: 3.6, output: 21.6 }, { from: "2026-02-19" }),
    ...tiers({ input: 4, cached: 0.4, output: 18 }, { input: 2, output: 9 }, { input: 7.2, output: 32.4 }, { from: "2026-02-19", contextAbove: 200_000 }),
    SEARCH("2026-02-19"),
  ]),
  gemini("gemini-3.8-flash", "Gemini 3.8 Flash", "Gemini Flash", "light", "active", { releasedAt: "2026-09-02" }, flashDoubling("2026-09-02")),
  gemini("gemini-3.7-flash", "Gemini 3.7 Flash", "Gemini Flash", "light", "active", { releasedAt: "2026-08-13" }, flashDoubling("2026-08-13")),
  gemini("gemini-3.6-flash", "Gemini 3.6 Flash", "Gemini Flash", "light", "active", { releasedAt: "2026-07-21" }, flashDoubling("2026-07-21")),
  gemini("gemini-3.5-flash", "Gemini 3.5 Flash", "Gemini Flash", "balanced", "active", { releasedAt: "2026-05-19" }, [
    ...tiers({ input: 1.5, cached: 0.15, output: 9 }, { input: 0.75, output: 4.5 }, { input: 2.7, output: 16.2 }, { from: "2026-05-19" }),
    SEARCH("2026-05-19"),
  ]),
  gemini("gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite", "Gemini Flash-Lite", "light", "active", { releasedAt: "2026-07-21" }, [
    ...tiers({ input: 0.3, cached: 0.03, output: 2.5 }, { input: 0.15, output: 1.25 }, { input: 0.54, output: 4.5 }, { from: "2026-07-21" }),
    SEARCH("2026-07-21"),
  ]),
  gemini("gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite", "Gemini Flash-Lite", "light", "deprecated", { releasedAt: "2026-05-07", retiresAt: "2027-05-07", replacement: "gemini-3.5-flash-lite" }, [
    ...tiers({ input: 0.25, cached: 0.025, output: 1.5 }, { input: 0.125, output: 0.75 }, { input: 0.45, output: 2.7 }, { from: "2026-05-07" }),
    { kind: "audio_input", unit: "1M_tokens", price: 0.5, currency: "USD", from: "2026-05-07", src },
    SEARCH("2026-05-07"),
  ]),
  gemini("gemini-3-flash-preview", "Gemini 3 Flash (preview)", "Gemini Flash", "light", "preview", { releasedAt: "2025-12-17", replacement: "gemini-3.6-flash" }, [
    ...tiers({ input: 0.5, cached: 0.05, output: 3 }, { input: 0.25, output: 1.5 }, { input: 0.9, output: 5.4 }, { from: "2025-12-17" }),
  ]),
  gemini("gemini-2.5-pro", "Gemini 2.5 Pro", "Gemini Pro", "frontier", "active", { releasedAt: "2025-06-17" }, [
    ...tiers({ input: 1.25, cached: 0.125, output: 10 }, { input: 0.625, output: 5 }, { input: 2.25, output: 18 }, { from: "2025-06-17" }),
    ...tiers({ input: 2.5, cached: 0.25, output: 15 }, { input: 1.25, output: 7.5 }, { input: 4.5, output: 27 }, { from: "2025-06-17", contextAbove: 200_000 }),
  ]),
  gemini("gemini-2.5-flash", "Gemini 2.5 Flash", "Gemini Flash", "light", "active", { releasedAt: "2025-06-17" }, [
    ...tokens(src, { input: 0.3, cached: 0.03, output: 2.5 }, { from: "2025-06-17" }),
    ...tokens(src, { input: 0.15, output: 1.25 }, { from: "2025-06-17", tier: "batch" }),
    { kind: "audio_input", unit: "1M_tokens", price: 1, currency: "USD", from: "2025-06-17", src },
  ]),
  gemini(
    "gemini-2.5-flash-lite",
    "Gemini 2.5 Flash-Lite",
    "Gemini Flash-Lite",
    "light",
    "active",
    { releasedAt: "2025-07-22" },
    tokens(secondary(PRICING, "2026-09-01", "MEDIUM", "Not readable on the pricing page on 2026-10-07 (page truncated); carried over from the angar catalog"), { input: 0.1, cached: 0.01, output: 0.4 }, { from: "2025-07-22" }),
  ),
];

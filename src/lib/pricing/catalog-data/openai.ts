/**
 * OpenAI — modelli API. Verificati il 2026-10-07 sulle pagine dei modelli di
 * developers.openai.com (la tabella di /api/docs/pricing si carica dinamicamente
 * e mostra solo i modelli di punta), sul changelog e sulla pagina delle deprecazioni.
 *
 * Regole ufficiali applicate (pagine dei modelli GPT-6):
 * - prompt oltre 272K token: input e cache ×2, output ×1,5 sull'intera richiesta;
 * - Batch e Flex: −50%; Fast (ex Priority, dal 30/07/2026): ×2;
 * - endpoint regionali (data residency): +10% per i modelli usciti dal 05/03/2026.
 */
import { official, secondary, estimate, tokens, scaled, VERIFIED_ON, type TokenPrices } from "./helpers";
import type { SeedComponent, SeedModel, SeedModelRule, Tier, Lifecycle, Capabilities, Provenance } from "./types";

const DOCS = "https://developers.openai.com/api/docs";
const page = (id: string) => official(`${DOCS}/models/${id}`);
const CHANGELOG = `${DOCS}/changelog`;
const DEPRECATIONS = `${DOCS}/deprecations`;
const GPT56_PRICE_POST = "https://community.openai.com/t/20-price-reduction-for-gpt-5-6-sol-api-codex-credits-and-chatgpt-work/1391726";
const AZURE = "https://azure.microsoft.com/en-us/pricing/details/azure-openai/";
const SEARCH: SeedComponent = { kind: "search", unit: "1K_requests", price: 10, currency: "USD", from: "2026-01-01", src: official(`${DOCS}/pricing`, "Web search tool: $10 / 1K calls + search content tokens at model rates"), note: "Web search tool" };

const REASONING_CAPS: Capabilities = { toolCalling: true, structuredOutput: true, vision: true, audio: false, reasoning: true, batch: true, caching: true, streaming: true, embeddings: false, fineTuning: false, mcp: true };

/** Standard + contesto lungo (oltre 272K) + Batch/Flex/Fast + regionale UE, tutto dalla stessa fonte ufficiale. */
function gpt6Rule(src: Provenance, p: TokenPrices, from: string): SeedModelRule {
  const long = scaled(p, { input: 2, output: 1.5, cache: 2 });
  const c: SeedComponent[] = [
    ...tokens(src, p, { from }),
    ...tokens(src, long, { from, contextAbove: 272_000 }),
    ...tokens(src, scaled(p, { input: 0.5 }), { from, tier: "batch" }),
    ...tokens(src, scaled(p, { input: 0.5 }), { from, tier: "flex" }),
    ...tokens(src, scaled(p, { input: 2 }), { from, tier: "fast" }),
    ...tokens(official(`${DOCS}/pricing`, "Regional processing (data residency): +10% for models released on or after 2026-03-05"), scaled(p, { input: 1.1 }), { from, region: "eu" }),
    { ...SEARCH, from },
  ];
  return { deployment: "openai-direct", components: c };
}

/** Azure OpenAI: la pagina prezzi di Azure il 2026-10-07 non mostrava valori ("$-"). */
function azureRule(p: TokenPrices, from: string): SeedModelRule {
  return {
    deployment: "azure-openai",
    notes: "Azure pricing page showed no values on 2026-10-07. Global Standard assumed equal to the OpenAI list price; Data Zone EU assumed +10%.",
    components: [
      ...tokens(secondary(AZURE, VERIFIED_ON, "MEDIUM", "Assumed equal to OpenAI list price (Global Standard)"), p, { from }),
      ...tokens(estimate("Data Zone EU assumed +10% over Global Standard", VERIFIED_ON, "LOW", AZURE), scaled(p, { input: 1.1 }), { from, region: "eu" }),
    ],
  };
}

function model(
  apiId: string,
  name: string,
  family: string,
  tier: Tier,
  lifecycle: Lifecycle,
  meta: Partial<SeedModel>,
  rules: SeedModelRule[],
): SeedModel {
  return {
    provider: "openai",
    apiId,
    name,
    family,
    tier,
    lifecycle,
    in: ["text", "image"],
    out: ["text"],
    caps: REASONING_CAPS,
    src: page(apiId),
    ...meta,
    rules,
  };
}

const GPT6_ASTRA: TokenPrices = { input: 10, cached: 1, cacheWrite: 12.5, output: 50 };
const GPT61_SOL: TokenPrices = { input: 2, cached: 0.1, cacheWrite: 2.5, output: 10 };
const GPT6_SOL: TokenPrices = { input: 2, cached: 0.2, cacheWrite: 2.5, output: 10 };
const GPT6_LUNA: TokenPrices = { input: 0.1, cached: 0.01, cacheWrite: 0.125, output: 0.5 };

const CLASSIC_CAPS: Capabilities = { toolCalling: true, structuredOutput: true, vision: true, audio: false, reasoning: false, batch: true, caching: true, streaming: true, embeddings: false, fineTuning: true };

export const OPENAI_MODELS: SeedModel[] = [
  model("gpt-6-astra", "GPT-6 Astra", "GPT-6", "frontier", "active", { releasedAt: "2026-09-03", contextWindow: 1_050_000, maxOutput: 128_000 }, [
    gpt6Rule(page("gpt-6-astra"), GPT6_ASTRA, "2026-09-03"),
    azureRule(GPT6_ASTRA, "2026-09-03"),
  ]),
  model("gpt-6.1-sol", "GPT-6.1 Sol", "GPT-6", "balanced", "active", { releasedAt: "2026-09-29", contextWindow: 1_050_000, maxOutput: 128_000 }, [
    gpt6Rule(page("gpt-6.1-sol"), GPT61_SOL, "2026-09-29"),
    azureRule(GPT61_SOL, "2026-09-29"),
  ]),
  model("gpt-6-sol", "GPT-6 Sol", "GPT-6", "balanced", "active", { releasedAt: "2026-09-22", contextWindow: 1_050_000, maxOutput: 128_000, replacement: "gpt-6.1-sol" }, [
    gpt6Rule(page("gpt-6-sol"), GPT6_SOL, "2026-09-22"),
  ]),
  // Rilascio: il changelog dice 22/09/2026 (la pagina del modello riporta un'altra data: si segue il changelog).
  model("gpt-6-luna", "GPT-6 Luna", "GPT-6", "light", "active", { releasedAt: "2026-09-22", contextWindow: 1_050_000, maxOutput: 128_000 }, [
    gpt6Rule(page("gpt-6-luna"), GPT6_LUNA, "2026-09-22"),
    azureRule(GPT6_LUNA, "2026-09-22"),
  ]),
  // GPT-5.6 Sol: prezzo promozionale dal 21/08/2026, "almeno fino al 21/11/2026" (poi può tornare a $5 / $30).
  model("gpt-5.6-sol", "GPT-5.6 Sol", "GPT-5.6", "frontier", "active", { contextWindow: 1_050_000, maxOutput: 128_000 }, [
    {
      deployment: "openai-direct",
      notes: "Promotional price from 2026-08-21, at least through 2026-11-21; OpenAI may restore $5 / $30 afterwards.",
      components: [
        ...tokens({ ...official(GPT56_PRICE_POST), confidence: "MEDIUM", note: "Earlier price; start date not verified" }, { input: 5, cached: 0.5, output: 30 }, { from: "2026-01-01", until: "2026-08-21" }),
        ...tokens(page("gpt-5.6-sol"), { input: 4, cached: 0.4, output: 20 }, { from: "2026-08-21", note: "Promotional price, at least through 2026-11-21" }),
        { ...SEARCH, from: "2026-01-01" },
      ],
    },
  ]),
  model("gpt-5.6-terra", "GPT-5.6 Terra", "GPT-5.6", "balanced", "active", { contextWindow: 1_050_000, maxOutput: 128_000 }, [
    {
      deployment: "openai-direct",
      components: [
        ...tokens({ ...official(GPT56_PRICE_POST), confidence: "MEDIUM", note: "Earlier price; start date not verified" }, { input: 2.5, cached: 0.25, output: 15 }, { from: "2026-01-01", until: "2026-07-30" }),
        ...tokens(official(CHANGELOG, "2026-07-30: GPT-5.6 Terra costs 20% less"), { input: 2, cached: 0.2, output: 12 }, { from: "2026-07-30" }),
      ],
    },
  ]),
  model("gpt-5.6-luna", "GPT-5.6 Luna", "GPT-5.6", "light", "active", { contextWindow: 1_050_000, maxOutput: 128_000 }, [
    {
      deployment: "openai-direct",
      components: [
        ...tokens({ ...official(GPT56_PRICE_POST), confidence: "MEDIUM", note: "Earlier price; start date not verified" }, { input: 1, cached: 0.1, output: 6 }, { from: "2026-01-01", until: "2026-07-30" }),
        ...tokens(official(CHANGELOG, "2026-07-30: GPT-5.6 Luna costs 80% less"), { input: 0.2, cached: 0.02, output: 1.2 }, { from: "2026-07-30" }),
      ],
    },
  ]),
  model("gpt-5.5", "GPT-5.5", "GPT-5", "frontier", "active", { releasedAt: "2025-12-01", contextWindow: 1_050_000, maxOutput: 128_000 }, [
    {
      deployment: "openai-direct",
      components: [
        ...tokens(page("gpt-5.5"), { input: 5, cached: 0.5, output: 30 }, { from: "2025-12-01" }),
        ...tokens(page("gpt-5.5"), { input: 10, cached: 1, output: 45 }, { from: "2025-12-01", contextAbove: 272_000 }),
      ],
    },
    azureRule({ input: 5, cached: 0.5, output: 30 }, "2025-12-01"),
  ]),
  model("gpt-5", "GPT-5", "GPT-5", "balanced", "deprecated", { retiresAt: "2026-12-11", replacement: "gpt-5.6-sol", contextWindow: 400_000, maxOutput: 128_000, src: official(DEPRECATIONS) }, [
    { deployment: "openai-direct", components: tokens(page("gpt-5"), { input: 1.25, cached: 0.125, output: 10 }, { from: "2025-08-07" }) },
  ]),
  model("gpt-5-mini", "GPT-5 mini", "GPT-5", "light", "deprecated", { retiresAt: "2026-12-11", replacement: "gpt-5.6-terra", contextWindow: 400_000, maxOutput: 128_000, src: official(DEPRECATIONS) }, [
    { deployment: "openai-direct", components: tokens(page("gpt-5-mini"), { input: 0.25, cached: 0.025, output: 2 }, { from: "2025-08-07" }) },
  ]),
  model("gpt-5-nano", "GPT-5 nano", "GPT-5", "light", "deprecated", { retiresAt: "2026-12-11", replacement: "gpt-5.6-luna", contextWindow: 400_000, maxOutput: 128_000, src: official(DEPRECATIONS) }, [
    { deployment: "openai-direct", components: tokens(page("gpt-5-nano"), { input: 0.05, cached: 0.005, output: 0.4 }, { from: "2025-08-07" }) },
  ]),
  model("gpt-4.1", "GPT-4.1", "GPT-4.1", "balanced", "active", { contextWindow: 1_047_576, maxOutput: 32_768, caps: CLASSIC_CAPS }, [
    { deployment: "openai-direct", components: tokens(page("gpt-4.1"), { input: 2, cached: 0.5, output: 8 }, { from: "2025-04-14" }) },
    azureRule({ input: 2, cached: 0.5, output: 8 }, "2025-04-14"),
  ]),
  model("gpt-4.1-mini", "GPT-4.1 mini", "GPT-4.1", "light", "active", { contextWindow: 1_047_576, maxOutput: 32_768, caps: CLASSIC_CAPS, src: secondary(`${DOCS}/models/gpt-4.1-mini`, "2026-09-01", "MEDIUM", "Not re-verified on 2026-10-07") }, [
    { deployment: "openai-direct", components: tokens(secondary(`${DOCS}/models/gpt-4.1-mini`, "2026-09-01", "MEDIUM", "Not re-verified on 2026-10-07"), { input: 0.4, cached: 0.1, output: 1.6 }, { from: "2025-04-14" }) },
  ]),
  model("gpt-4o", "GPT-4o", "GPT-4o", "balanced", "active", { contextWindow: 128_000, maxOutput: 16_384, caps: CLASSIC_CAPS }, [
    { deployment: "openai-direct", components: tokens(page("gpt-4o"), { input: 2.5, cached: 1.25, output: 10 }, { from: "2024-11-20" }) },
    azureRule({ input: 2.5, cached: 1.25, output: 10 }, "2024-11-20"),
  ]),
  model("gpt-4o-mini", "GPT-4o mini", "GPT-4o", "light", "active", { contextWindow: 128_000, maxOutput: 16_384, caps: CLASSIC_CAPS }, [
    { deployment: "openai-direct", components: tokens(page("gpt-4o-mini"), { input: 0.15, cached: 0.075, output: 0.6 }, { from: "2024-07-18" }) },
    azureRule({ input: 0.15, cached: 0.075, output: 0.6 }, "2024-07-18"),
  ]),
  model("o3", "o3", "o-series", "balanced", "deprecated", { retiresAt: "2026-12-11", replacement: "gpt-5.6-sol", contextWindow: 200_000, maxOutput: 100_000, src: official(DEPRECATIONS) }, [
    { deployment: "openai-direct", components: tokens(secondary(`${DOCS}/models/o3`, "2026-09-01", "MEDIUM", "Not re-verified on 2026-10-07"), { input: 2, cached: 0.5, output: 8 }, { from: "2025-06-10" }) },
  ]),
  model("o4-mini", "o4-mini", "o-series", "light", "deprecated", { retiresAt: "2026-10-23", replacement: "gpt-5.6-terra", contextWindow: 200_000, maxOutput: 100_000, src: official(DEPRECATIONS) }, [
    { deployment: "openai-direct", components: tokens(secondary(`${DOCS}/models/o4-mini`, "2026-09-01", "MEDIUM", "Not re-verified on 2026-10-07"), { input: 1.1, cached: 0.275, output: 4.4 }, { from: "2025-04-16" }) },
  ]),
  // Embedding: solo input.
  model("text-embedding-3-small", "text-embedding-3-small", "Embeddings", "light", "active", { in: ["text"], out: ["embedding"], caps: { embeddings: true, batch: true } }, [
    { deployment: "openai-direct", components: [{ kind: "input", unit: "1M_tokens", price: 0.02, currency: "USD", from: "2024-01-25", src: page("text-embedding-3-small") }] },
  ]),
  model("text-embedding-3-large", "text-embedding-3-large", "Embeddings", "light", "active", { in: ["text"], out: ["embedding"], caps: { embeddings: true, batch: true } }, [
    { deployment: "openai-direct", components: [{ kind: "input", unit: "1M_tokens", price: 0.13, currency: "USD", from: "2024-01-25", src: page("text-embedding-3-small") }] },
  ]),
  model("text-embedding-ada-002", "text-embedding-ada-002", "Embeddings", "light", "active", { in: ["text"], out: ["embedding"], caps: { embeddings: true }, src: secondary(`${DOCS}/models/all`, "2026-09-01") }, [
    { deployment: "openai-direct", components: [{ kind: "input", unit: "1M_tokens", price: 0.1, currency: "USD", from: "2022-12-15", src: secondary(null, "2026-09-01", "MEDIUM", "Carried over from the angar catalog (Sept 2026)") }] },
  ]),
];

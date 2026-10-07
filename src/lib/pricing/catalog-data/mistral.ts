/**
 * Mistral AI — API. Verificati il 2026-10-07 su mistral.ai/pricing/api/ (prezzi in USD).
 * In fondo: modelli di altri fornitori ripresi dal vecchio catalogo angar (non riverificati,
 * fonte secondaria) e il ripiego per gli embedding sconosciuti (stima angar).
 */
import { official, secondary, estimate, tokens } from "./helpers";
import type { Capabilities, SeedModel, Tier } from "./types";

const PRICING = "https://mistral.ai/pricing/api/";
const src = official(PRICING);
/** Data d'inizio non pubblicata: si usa il primo giorno in cui angar ha visto il prezzo. */
const FIRST_SEEN = "Start date not published; first seen by angar";
const SEEN_SEPT = "2026-09-01";
const SEEN_OCT = "2026-10-07";
const CAPS: Capabilities = { toolCalling: true, structuredOutput: true, vision: true, audio: false, reasoning: false, batch: true, caching: false, streaming: true, embeddings: false, fineTuning: true };

function mistral(apiId: string, name: string, family: string, tier: Tier, p: { input: number; output: number }, from: string, meta: Partial<SeedModel> = {}): SeedModel {
  return {
    provider: "mistral",
    apiId,
    name,
    family,
    tier,
    lifecycle: "active",
    in: ["text", "image"],
    out: ["text"],
    caps: CAPS,
    src,
    ...meta,
    rules: [{ deployment: "mistral-direct", components: tokens(src, p, { from, note: FIRST_SEEN }) }],
  };
}

const embed = (apiId: string, name: string, price: number, from: string): SeedModel => ({
  provider: "mistral",
  apiId,
  name,
  family: "Embeddings",
  tier: "light",
  lifecycle: "active",
  in: ["text"],
  out: ["embedding"],
  caps: { embeddings: true, batch: true },
  src,
  rules: [{ deployment: "mistral-direct", components: [{ kind: "input", unit: "1M_tokens", price, currency: "USD", from, src, note: FIRST_SEEN }] }],
});

export const MISTRAL_MODELS: SeedModel[] = [
  mistral("mistral-medium-3.5", "Mistral Medium 3.5", "Mistral Medium", "balanced", { input: 1.5, output: 7.5 }, SEEN_OCT),
  mistral("mistral-large-3", "Mistral Large 3", "Mistral Large", "balanced", { input: 0.5, output: 1.5 }, SEEN_SEPT, { releasedAt: "2025-12-01", contextWindow: 256_000 }),
  mistral("mistral-small-4", "Mistral Small 4", "Mistral Small", "light", { input: 0.15, output: 0.6 }, SEEN_SEPT),
  mistral("ministral-3-14b", "Ministral 3 (14B)", "Ministral", "light", { input: 0.2, output: 0.2 }, SEEN_OCT),
  mistral("ministral-3-8b", "Ministral 3 (8B)", "Ministral", "light", { input: 0.15, output: 0.15 }, SEEN_OCT),
  mistral("ministral-3-3b", "Ministral 3 (3B)", "Ministral", "light", { input: 0.1, output: 0.1 }, SEEN_OCT),
  mistral("codestral", "Codestral", "Codestral", "light", { input: 0.3, output: 0.9 }, SEEN_OCT, { in: ["text"] }),
  embed("mistral-embed", "Mistral Embed", 0.1, SEEN_OCT),
  embed("codestral-embed", "Codestral Embed", 0.15, SEEN_OCT),
];

const OLD = (note = "Carried over from the angar catalog (Sept 2026), not re-verified on 2026-10-07") => secondary(null, "2026-09-01", "MEDIUM", note);

/** Altri fornitori presenti nel vecchio catalogo: tenuti per non perdere i costi già stimati. */
export const OTHER_MODELS: SeedModel[] = [
  {
    provider: "deepseek",
    apiId: "deepseek-chat",
    name: "DeepSeek",
    family: "DeepSeek",
    tier: "balanced",
    lifecycle: "active",
    in: ["text"],
    out: ["text"],
    caps: { toolCalling: true, streaming: true },
    src: OLD(),
    rules: [{ deployment: "deepseek-direct", components: tokens(OLD(), { input: 0.27, output: 1.1 }, { from: SEEN_SEPT, note: FIRST_SEEN }) }],
  },
  {
    provider: "xai",
    apiId: "grok",
    name: "Grok",
    family: "Grok",
    tier: "balanced",
    lifecycle: "active",
    in: ["text", "image"],
    out: ["text"],
    caps: { toolCalling: true, streaming: true },
    src: OLD(),
    rules: [{ deployment: "xai-direct", components: tokens(OLD(), { input: 2, output: 6 }, { from: SEEN_SEPT, note: FIRST_SEEN }) }],
  },
  // Ripiego per gli embedding non in catalogo (era nella tabella del Gateway): stima, mai un prezzo ufficiale.
  {
    provider: "angar",
    apiId: "embedding-unknown",
    name: "Other embedding model",
    family: "Embeddings",
    tier: "light",
    lifecycle: "active",
    in: ["text"],
    out: ["embedding"],
    caps: { embeddings: true },
    src: estimate("Fallback for embedding models not in the catalog"),
    rules: [{ deployment: "angar-estimate", components: [{ kind: "input", unit: "1M_tokens", price: 0.1, currency: "USD", from: "2024-01-01", src: estimate("Fallback for embedding models not in the catalog") }] }],
  },
];

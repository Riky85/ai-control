/**
 * Anthropic — modelli Claude. Verificati il 2026-10-07 su
 * platform.claude.com/docs/en/about-claude/pricing (tabelle copiate alla lettera)
 * e sulla pagina delle deprecazioni.
 *
 * Regole ufficiali applicate:
 * - Batch API: −50% su input e output (tabella dedicata);
 * - Fast mode (Opus 5.5, Opus 5, Opus 4.8): prezzi dedicati, solo API diretta;
 * - inferenza solo USA (inference_geo "us") per Claude 4.6 e successivi: ×1,1 su tutte le voci;
 * - Bedrock / Google Cloud: endpoint regionali e multi-regione +10% sugli endpoint globali;
 * - web search: $10 ogni 1.000 ricerche.
 *
 * Date di rilascio: dove non c'è una data pubblicata si ricava dalla regola di
 * Anthropic "ritiro non prima di 12 mesi dal rilascio" (pagina deprecazioni).
 */
import { official, secondary, tokens, scaled, VERIFIED_ON, type TokenPrices } from "./helpers";
import type { Capabilities, Lifecycle, SeedComponent, SeedModel, SeedModelRule, Tier } from "./types";

const PRICING = "https://platform.claude.com/docs/en/about-claude/pricing";
const DEPRECATIONS = "https://platform.claude.com/docs/en/about-claude/model-deprecations";
const BEDROCK = "https://aws.amazon.com/bedrock/pricing/";
const src = official(PRICING);

const CAPS: Capabilities = { toolCalling: true, structuredOutput: true, vision: true, audio: false, reasoning: true, batch: true, caching: true, streaming: true, embeddings: false, fineTuning: false, mcp: true };

interface Claude {
  apiId: string;
  name: string;
  family: string;
  tier: Tier;
  lifecycle: Lifecycle;
  p: TokenPrices; // base input, cache hit, cache write 5m / 1h, output
  from: string;
  released?: string;
  deprecated?: string;
  retires?: string;
  replacement?: string;
  context: number;
  maxOutput?: number;
  fast?: { input: number; output: number };
  /** Claude 4.6 e successivi: inferenza solo USA ×1,1. */
  usGeo?: boolean;
  bedrock?: boolean;
  note?: string;
}

function rules(c: Claude): SeedModelRule[] {
  const comps: SeedComponent[] = [
    ...tokens(src, c.p, { from: c.from }),
    ...tokens(src, scaled(c.p, { input: 0.5 }), { from: c.from, tier: "batch" }),
  ];
  if (c.fast) {
    // Il moltiplicatore della cache si applica anche al fast mode: si conservano i rapporti del prezzo base.
    const k = c.fast.input / c.p.input;
    comps.push(...tokens(src, { ...scaled(c.p, { input: k }), output: c.fast.output }, { from: c.from, tier: "fast" }));
  }
  if (c.usGeo) comps.push(...tokens(official(PRICING, "US-only inference (inference_geo: us): 1.1x on all token categories"), scaled(c.p, { input: 1.1 }), { from: c.from, region: "us" }));
  if (c.lifecycle !== "retired") comps.push({ kind: "search", unit: "1K_requests", price: 10, currency: "USD", from: c.from, src, note: "Web search tool" });
  const out: SeedModelRule[] = [{ deployment: "anthropic-direct", components: comps, notes: c.note }];
  if (c.bedrock) {
    // Bedrock: AWS non mostrava questi modelli nella pagina prezzi il 2026-10-07. Endpoint globale = listino Claude
    // (ipotesi, fonte secondaria); regionale = +10% (regola ufficiale Anthropic per Claude 4.5 e successivi).
    const s = secondary(BEDROCK, VERIFIED_ON, "MEDIUM", "Global endpoint assumed at Claude API list price; regional endpoints +10% as stated in the Anthropic docs");
    out.push({
      deployment: "aws-bedrock",
      notes: "Billed through AWS Marketplace. Global endpoint assumed at the Claude API list price; regional (EU) endpoints +10%.",
      components: [
        ...tokens(s, c.p, { from: c.from }),
        ...tokens(s, scaled(c.p, { input: 1.1 }), { from: c.from, region: "eu" }),
        ...tokens(s, scaled(c.p, { input: 0.5 }), { from: c.from, tier: "batch" }),
      ],
    });
  }
  return out;
}

function claude(c: Claude): SeedModel {
  return {
    provider: "anthropic",
    apiId: c.apiId,
    name: c.name,
    family: c.family,
    tier: c.tier,
    lifecycle: c.lifecycle,
    releasedAt: c.released,
    deprecatedAt: c.deprecated,
    retiresAt: c.retires,
    replacement: c.replacement,
    contextWindow: c.context,
    maxOutput: c.maxOutput,
    in: ["text", "image", "pdf"],
    out: ["text"],
    caps: CAPS,
    src: official(DEPRECATIONS),
    rules: rules(c),
  };
}

const p = (input: number, cacheWrite: number, cacheWrite1h: number, cached: number, output: number): TokenPrices => ({ input, cacheWrite, cacheWrite1h, cached, output });

export const ANTHROPIC_MODELS: SeedModel[] = [
  claude({ apiId: "claude-fable-5-1", name: "Claude Fable 5.1", family: "Claude Fable", tier: "frontier", lifecycle: "active", p: p(10, 12.5, 20, 0.25, 50), from: "2026-09-01", released: "2026-09-01", context: 1_000_000, usGeo: true }),
  claude({ apiId: "claude-fable-5", name: "Claude Fable 5", family: "Claude Fable", tier: "frontier", lifecycle: "active", p: p(10, 12.5, 20, 1, 50), from: "2026-06-09", released: "2026-06-09", context: 1_000_000, usGeo: true }),
  claude({ apiId: "claude-mythos-5-1", name: "Claude Mythos 5.1", family: "Claude Mythos", tier: "frontier", lifecycle: "preview", p: p(10, 12.5, 20, 0.25, 50), from: "2026-09-01", released: "2026-09-01", context: 1_000_000, usGeo: true, note: "Limited availability (invitation only, Project Glasswing)." }),
  claude({ apiId: "claude-opus-5-5", name: "Claude Opus 5.5", family: "Claude Opus", tier: "frontier", lifecycle: "active", p: p(4, 5, 8, 0.2, 20), from: "2026-09-22", released: "2026-09-22", context: 1_000_000, fast: { input: 8, output: 40 }, usGeo: true, bedrock: true }),
  claude({ apiId: "claude-opus-5", name: "Claude Opus 5", family: "Claude Opus", tier: "frontier", lifecycle: "active", p: p(5, 6.25, 10, 0.5, 25), from: "2026-07-24", released: "2026-07-24", context: 1_000_000, fast: { input: 10, output: 50 }, usGeo: true, bedrock: true }),
  claude({ apiId: "claude-opus-4-8", name: "Claude Opus 4.8", family: "Claude Opus", tier: "frontier", lifecycle: "active", p: p(5, 6.25, 10, 0.5, 25), from: "2026-05-28", released: "2026-05-28", context: 1_000_000, fast: { input: 10, output: 50 }, usGeo: true }),
  claude({ apiId: "claude-opus-4-7", name: "Claude Opus 4.7", family: "Claude Opus", tier: "frontier", lifecycle: "active", p: p(5, 6.25, 10, 0.5, 25), from: "2026-04-16", released: "2026-04-16", context: 1_000_000, usGeo: true }),
  claude({ apiId: "claude-opus-4-6", name: "Claude Opus 4.6", family: "Claude Opus", tier: "frontier", lifecycle: "active", p: p(5, 6.25, 10, 0.5, 25), from: "2026-02-05", released: "2026-02-05", context: 1_000_000, usGeo: true }),
  claude({ apiId: "claude-opus-4-5", name: "Claude Opus 4.5", family: "Claude Opus", tier: "frontier", lifecycle: "active", p: p(5, 6.25, 10, 0.5, 25), from: "2025-11-24", released: "2025-11-24", context: 200_000 }),
  claude({ apiId: "claude-opus-4-1", name: "Claude Opus 4.1", family: "Claude Opus", tier: "frontier", lifecycle: "retired", p: p(15, 18.75, 30, 1.5, 75), from: "2025-08-05", released: "2025-08-05", deprecated: "2026-06-05", retires: "2026-08-05", replacement: "claude-opus-4-8", context: 200_000, note: "Retired on the Claude API; still on Bedrock and Google Cloud." }),
  claude({ apiId: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", family: "Claude Sonnet", tier: "balanced", lifecycle: "active", p: p(2, 2.5, 4, 0.2, 10), from: "2026-09-28", released: "2026-09-28", context: 1_000_000, usGeo: true, bedrock: true }),
  // Sonnet 5: $2 / $10 era "introduttivo fino al 31/08/2026"; l'aumento a $3 / $15 previsto dall'1/09 è stato annullato.
  claude({ apiId: "claude-sonnet-5", name: "Claude Sonnet 5", family: "Claude Sonnet", tier: "balanced", lifecycle: "active", p: p(2, 2.5, 4, 0.2, 10), from: "2026-06-30", released: "2026-06-30", context: 1_000_000, maxOutput: 128_000, usGeo: true, bedrock: true, note: "Launch price ($2 / $10) is now the standard price; the increase planned for 2026-09-01 was cancelled." }),
  claude({ apiId: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", family: "Claude Sonnet", tier: "balanced", lifecycle: "active", p: p(3, 3.75, 6, 0.3, 15), from: "2026-02-17", released: "2026-02-17", context: 1_000_000, usGeo: true }),
  claude({ apiId: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", family: "Claude Sonnet", tier: "balanced", lifecycle: "deprecated", p: p(3, 3.75, 6, 0.3, 15), from: "2025-09-29", released: "2025-09-29", deprecated: "2026-09-30", retires: "2026-11-30", replacement: "claude-sonnet-5-5", context: 200_000, bedrock: true }),
  claude({ apiId: "claude-haiku-4-5", name: "Claude Haiku 4.5", family: "Claude Haiku", tier: "light", lifecycle: "active", p: p(1, 1.25, 2, 0.1, 5), from: "2025-10-15", released: "2025-10-15", context: 200_000, bedrock: true }),
  claude({ apiId: "claude-3-5-haiku", name: "Claude Haiku 3.5", family: "Claude Haiku", tier: "light", lifecycle: "retired", p: p(0.8, 1, 1.6, 0.08, 4), from: "2024-10-22", released: "2024-10-22", deprecated: "2025-12-19", retires: "2026-02-19", replacement: "claude-haiku-4-5", context: 200_000, note: "Retired on the Claude API; still on Bedrock and Google Cloud." }),
];

/**
 * Prodotti a posti (abbonamenti) e prodotti API. Prezzi in USD per posto al mese:
 * seat_monthly = fatturazione mensile, seat_annual = mensile equivalente con fatturazione annuale.
 *
 * Verificati il 2026-10-07 (fonte "official"): ChatGPT Business (posti standard e premium),
 * Claude Pro / Max 5× / Team / Enterprise, Microsoft 365 Copilot Business, GitHub Copilot,
 * Cursor Teams (mensile), Perplexity Pro / Max / Enterprise, Le Chat Pro / Team (mensile).
 * Tutto il resto è ripreso dal vecchio catalogo angar (settembre 2026): fonte "secondary",
 * mai "official", finché qualcuno non lo riverifica.
 *
 * L'ordine dei piani conta: è lo stesso del vecchio elenco PLANS (pricing/catalog.ts),
 * che lo usa per riconoscere piano e posti da un addebito in banca.
 */
import { official, secondary, seat, VERIFIED_ON as VERIFIED } from "./helpers";
import type { Provenance, SeedPlan, SeedProduct, SeedSeatType } from "./types";

const SEPT = "2026-09-01";
const OLD = (url: string | null = null) => secondary(url, SEPT, "MEDIUM", "Carried over from the angar catalog (Sept 2026), not re-verified on 2026-10-07");

/** Un piano con un solo tipo di posto. */
function simple(id: string, name: string, audience: SeedPlan["audience"], src: Provenance, price: { monthly?: number; annual?: number }, opts: { annualSrc?: Provenance; from?: string; billingModel?: SeedPlan["billingModel"]; notes?: string; minSeats?: number; legacyName?: string } = {}): SeedPlan {
  return {
    id,
    name,
    audience,
    billingModel: opts.billingModel ?? "SEAT_BASED",
    minSeats: opts.minSeats,
    notes: opts.notes,
    seatTypes: [{ key: "standard", name: "Standard", legacyPlanId: id, legacyName: opts.legacyName ?? name, isDefault: true, components: seat(src, price, { from: opts.from ?? SEPT }, opts.annualSrc ?? src) }],
  };
}

const st = (key: string, name: string, legacyPlanId: string | undefined, legacyName: string | undefined, components: SeedSeatType["components"], isDefault = false): SeedSeatType => ({ key, name, legacyPlanId, legacyName, isDefault, components });

// ── Fonti ufficiali ──
const CHATGPT_BIZ = official("https://openai.com/business/chatgpt-pricing/");
const CHATGPT_PREMIUM = official("https://openai.com/index/premium-seats-chatgpt-business/");
const CLAUDE = official("https://claude.com/pricing");
const M365 = official("https://www.microsoft.com/en-us/microsoft-365-copilot/pricing");
const GH = official("https://docs.github.com/en/copilot/get-started/plans");
const CURSOR_TEAMS = official("https://cursor.com/docs/account/teams/pricing");
const PPLX = official("https://www.perplexity.ai/enterprise/pricing");
const PPLX_ENT = official("https://www.perplexity.ai/help-center/en/articles/10352986-enterprise-pricing-and-billing-frequently-asked-questions");
const MISTRAL = official("https://mistral.ai/pricing/");

export const SEAT_PRODUCTS: SeedProduct[] = [
  {
    id: "chatgpt",
    provider: "openai",
    name: "ChatGPT",
    kind: "seat",
    serviceId: "chatgpt",
    billingModel: "SEAT_BASED",
    pricingUrl: "https://openai.com/business/chatgpt-pricing/",
    plans: [
      simple("chatgpt-go", "ChatGPT Go", "personal", OLD("https://chatgpt.com/chatgpt/pricing/"), { monthly: 8 }),
      simple("chatgpt-plus", "ChatGPT Plus", "personal", OLD("https://chatgpt.com/chatgpt/pricing/"), { monthly: 20 }),
      simple("chatgpt-pro-5x", "ChatGPT Pro 5×", "personal", OLD("https://chatgpt.com/chatgpt/pricing/"), { monthly: 100 }),
      simple("chatgpt-pro", "ChatGPT Pro", "personal", OLD("https://chatgpt.com/chatgpt/pricing/"), { monthly: 200 }),
      {
        id: "chatgpt-business",
        name: "ChatGPT Business",
        audience: "business",
        billingModel: "SEAT_BASED",
        minSeats: 2,
        seatTypes: [
          st("standard", "Standard", "chatgpt-business", "ChatGPT Business", seat(CHATGPT_BIZ, { monthly: 25, annual: 20 }, { from: SEPT }), true),
          // Posti premium disponibili dal 25/08/2026 (annuncio del 10/08/2026).
          st("premium", "Premium", "chatgpt-business-premium", "ChatGPT Business (premium seat)", seat(CHATGPT_PREMIUM, { monthly: 125, annual: 100 }, { from: "2026-08-25" })),
        ],
      },
      { id: "chatgpt-enterprise", name: "ChatGPT Enterprise", audience: "enterprise", billingModel: "CUSTOM", notes: "Custom pricing; credit-based or token-based options (contact sales).", seatTypes: [st("standard", "Standard", undefined, undefined, [], true)] },
    ],
  },
  {
    id: "claude",
    provider: "anthropic",
    name: "Claude",
    kind: "seat",
    serviceId: "claude",
    billingModel: "SEAT_BASED",
    pricingUrl: "https://claude.com/pricing",
    plans: [
      simple("claude-pro", "Claude Pro", "personal", CLAUDE, { monthly: 20, annual: 17 }),
      simple("claude-max-5x", "Claude Max 5×", "personal", CLAUDE, { monthly: 100 }),
      simple("claude-max-20x", "Claude Max 20×", "personal", OLD("https://claude.com/pricing"), { monthly: 200 }),
      {
        id: "claude-team",
        name: "Claude Team",
        audience: "business",
        billingModel: "SEAT_BASED",
        seatTypes: [
          st("standard", "Standard", "claude-team", "Claude Team", seat(CLAUDE, { monthly: 25, annual: 20 }, { from: SEPT }), true),
          st("premium", "Premium", "claude-team-premium", "Claude Team (premium seat)", seat(CLAUDE, { monthly: 125, annual: 100 }, { from: SEPT })),
        ],
      },
      {
        id: "claude-enterprise",
        name: "Claude Enterprise",
        audience: "enterprise",
        billingModel: "HYBRID",
        notes: "Seat fee plus usage at API rates; annual billing.",
        seatTypes: [st("standard", "Standard", undefined, undefined, seat(CLAUDE, { annual: 20 }, { from: VERIFIED }), true)],
      },
    ],
  },
  {
    id: "gemini-app",
    provider: "google",
    name: "Google AI plans",
    kind: "seat",
    serviceId: "gemini",
    billingModel: "SEAT_BASED",
    plans: [
      simple("gemini-ai-plus", "Google AI Plus", "personal", OLD(), { monthly: 7.99 }),
      simple("gemini-ai-pro", "Google AI Pro", "personal", OLD(), { monthly: 19.99 }),
      simple("gemini-ai-ultra", "Google AI Ultra", "personal", OLD(), { monthly: 200 }),
    ],
  },
  {
    id: "google-workspace-gemini",
    provider: "google",
    name: "Gemini for Google Workspace",
    kind: "seat",
    serviceId: "gemini",
    billingModel: "SEAT_BASED",
    pricingUrl: "https://workspace.google.com/pricing",
    plans: [
      // La pagina prezzi di Workspace non mostrava gli importi il 2026-10-07 (solo "Save 16% with 1 year commitment").
      simple("gemini-workspace", "Google Workspace with Gemini", "business", OLD("https://workspace.google.com/pricing"), { monthly: 14, annual: 12 }, { notes: "Gemini is bundled in Workspace Business editions." }),
    ],
  },
  {
    id: "microsoft-copilot",
    provider: "microsoft",
    name: "Microsoft Copilot",
    kind: "seat",
    serviceId: "copilot",
    billingModel: "SEAT_BASED",
    pricingUrl: "https://www.microsoft.com/en-us/microsoft-365-copilot/pricing",
    plans: [
      simple("copilot-pro", "Copilot Pro / Microsoft 365 Premium", "personal", OLD(), { monthly: 20 }),
      {
        id: "copilot-business",
        name: "Microsoft 365 Copilot Business",
        audience: "business",
        billingModel: "SEAT_BASED",
        notes: "Annual commitment. Promotion: $18 a month paid yearly, 2026-07-01 to 2026-12-31, first year only.",
        seatTypes: [
          st("standard", "Standard", "copilot-business", "Microsoft 365 Copilot Business", [
            ...seat(M365, { monthly: 25.2, annual: 21 }, { from: SEPT }),
            ...seat(M365, { annual: 18 }, { from: "2026-07-01", until: "2027-01-01", tier: "promotion", note: "First-year promotional price" }),
          ], true),
        ],
      },
      simple("copilot-m365", "Microsoft 365 Copilot", "enterprise", OLD("https://www.microsoft.com/en-us/microsoft-365-copilot/pricing"), { monthly: 31.5, annual: 30 }),
    ],
  },
  {
    id: "github-copilot",
    provider: "github",
    name: "GitHub Copilot",
    kind: "seat",
    serviceId: "github-copilot",
    billingModel: "SEAT_BASED",
    pricingUrl: "https://docs.github.com/en/copilot/get-started/plans",
    plans: [
      simple("github-copilot-pro", "GitHub Copilot Pro", "personal", GH, { monthly: 10, annual: 8.33 }, { annualSrc: OLD() }),
      simple("github-copilot-pro-plus", "GitHub Copilot Pro+", "personal", GH, { monthly: 39 }),
      simple("github-copilot-max", "GitHub Copilot Max", "personal", GH, { monthly: 100 }, { from: VERIFIED }),
      {
        id: "github-copilot-business",
        name: "GitHub Copilot Business",
        audience: "business",
        billingModel: "HYBRID",
        notes: "1,900 AI credits a month for each seat; extra usage $0.01 an AI credit.",
        seatTypes: [st("standard", "Standard", "github-copilot-business", "GitHub Copilot Business", [...seat(GH, { monthly: 19 }, { from: SEPT }), { kind: "credit", unit: "credit", price: 0.01, currency: "USD", from: VERIFIED, src: GH, note: "AI credit beyond the included allowance" }], true)],
      },
      {
        id: "github-copilot-enterprise",
        name: "GitHub Copilot Enterprise",
        audience: "enterprise",
        billingModel: "HYBRID",
        notes: "3,900 AI credits a month for each seat; extra usage $0.01 an AI credit.",
        seatTypes: [st("standard", "Standard", "github-copilot-enterprise", "GitHub Copilot Enterprise", [...seat(GH, { monthly: 39 }, { from: SEPT }), { kind: "credit", unit: "credit", price: 0.01, currency: "USD", from: VERIFIED, src: GH, note: "AI credit beyond the included allowance" }], true)],
      },
    ],
  },
  {
    id: "cursor",
    provider: "anysphere",
    name: "Cursor",
    kind: "seat",
    serviceId: "cursor",
    billingModel: "SEAT_BASED",
    pricingUrl: "https://cursor.com/pricing",
    plans: [
      simple("cursor-pro", "Cursor Pro", "personal", OLD("https://cursor.com/pricing"), { monthly: 20, annual: 16 }),
      simple("cursor-pro-plus", "Cursor Pro+", "personal", OLD("https://cursor.com/pricing"), { monthly: 60, annual: 48 }),
      simple("cursor-ultra", "Cursor Ultra", "personal", OLD("https://cursor.com/pricing"), { monthly: 200, annual: 160 }),
      {
        id: "cursor-teams",
        name: "Cursor Teams",
        audience: "business",
        billingModel: "HYBRID",
        notes: "Included usage for each seat; on-demand usage at API price + $0.25 / 1M tokens for third-party models.",
        seatTypes: [
          st("standard", "Standard", "cursor-teams", "Cursor Teams", seat(CURSOR_TEAMS, { monthly: 40, annual: 32 }, { from: SEPT }, OLD("https://cursor.com/pricing")), true),
          st("premium", "Premium", "cursor-teams-premium", "Cursor Teams (premium seat)", seat(CURSOR_TEAMS, { monthly: 120, annual: 96 }, { from: SEPT }, OLD("https://cursor.com/pricing"))),
        ],
      },
    ],
  },
  {
    id: "windsurf",
    provider: "windsurf",
    name: "Windsurf",
    kind: "seat",
    serviceId: "windsurf",
    billingModel: "SEAT_BASED",
    plans: [
      simple("windsurf-pro", "Windsurf Pro", "personal", OLD(), { monthly: 20 }),
      simple("windsurf-max", "Windsurf Max", "personal", OLD(), { monthly: 200 }),
      simple("windsurf-teams", "Windsurf Teams", "business", OLD(), { monthly: 40 }),
    ],
  },
  {
    id: "perplexity",
    provider: "perplexity",
    name: "Perplexity",
    kind: "seat",
    serviceId: "perplexity",
    billingModel: "SEAT_BASED",
    pricingUrl: "https://www.perplexity.ai/enterprise/pricing",
    plans: [
      simple("perplexity-pro", "Perplexity Pro", "personal", PPLX, { monthly: 20, annual: 16.67 }, { annualSrc: OLD() }),
      simple("perplexity-max", "Perplexity Max", "personal", PPLX, { monthly: 200 }),
      // Enterprise Pro: $40 al mese o $400 all'anno (= 33,33 al mese); Enterprise Max: $325 o $3.250 all'anno.
      simple("perplexity-enterprise", "Perplexity Enterprise Pro", "business", PPLX_ENT, { monthly: 40, annual: 33.33 }),
      simple("perplexity-enterprise-max", "Perplexity Enterprise Max", "business", PPLX_ENT, { monthly: 325, annual: 270.83 }),
    ],
  },
  {
    id: "le-chat",
    provider: "mistral",
    name: "Le Chat",
    kind: "seat",
    serviceId: "mistral",
    billingModel: "SEAT_BASED",
    pricingUrl: "https://mistral.ai/pricing/",
    plans: [
      simple("mistral-pro", "Le Chat Pro", "personal", MISTRAL, { monthly: 14.99 }),
      simple("mistral-team", "Le Chat Team", "business", MISTRAL, { monthly: 24.99, annual: 19.99 }, { annualSrc: OLD("https://mistral.ai/pricing/"), minSeats: 2 }),
    ],
  },
  {
    id: "grok",
    provider: "xai",
    name: "Grok",
    kind: "seat",
    serviceId: "grok",
    billingModel: "SEAT_BASED",
    plans: [simple("grok-supergrok", "SuperGrok", "personal", OLD(), { monthly: 30 }), simple("grok-heavy", "SuperGrok Heavy", "personal", OLD(), { monthly: 300 })],
  },
  {
    id: "midjourney",
    provider: "midjourney",
    name: "Midjourney",
    kind: "seat",
    serviceId: "midjourney",
    billingModel: "SEAT_BASED",
    plans: [
      simple("midjourney-basic", "Midjourney Basic", "personal", OLD(), { monthly: 10, annual: 8 }),
      simple("midjourney-standard", "Midjourney Standard", "personal", OLD(), { monthly: 30, annual: 24 }),
      simple("midjourney-pro", "Midjourney Pro", "personal", OLD(), { monthly: 60, annual: 48 }),
      simple("midjourney-mega", "Midjourney Mega", "personal", OLD(), { monthly: 120, annual: 96 }),
    ],
  },
  { id: "deepl", provider: "deepl", name: "DeepL", kind: "seat", serviceId: "deepl", billingModel: "SEAT_BASED", plans: [simple("deepl-starter", "DeepL Pro Starter", "business", OLD(), { monthly: 10.49 })] },
  { id: "grammarly", provider: "grammarly", name: "Grammarly", kind: "seat", serviceId: "grammarly", billingModel: "SEAT_BASED", plans: [simple("grammarly-pro", "Grammarly Pro", "business", OLD(), { monthly: 30 })] },
  {
    id: "elevenlabs",
    provider: "elevenlabs",
    name: "ElevenLabs",
    kind: "seat",
    serviceId: "elevenlabs",
    billingModel: "CREDIT_BASED",
    plans: [
      simple("elevenlabs-starter", "ElevenLabs Starter", "personal", OLD(), { monthly: 6 }, { billingModel: "CREDIT_BASED" }),
      simple("elevenlabs-creator", "ElevenLabs Creator", "personal", OLD(), { monthly: 22 }, { billingModel: "CREDIT_BASED" }),
      simple("elevenlabs-pro", "ElevenLabs Pro", "personal", OLD(), { monthly: 99 }, { billingModel: "CREDIT_BASED" }),
    ],
  },
  { id: "otter", provider: "otter", name: "Otter", kind: "seat", serviceId: "otter", billingModel: "SEAT_BASED", plans: [simple("otter-pro", "Otter Pro", "personal", OLD(), { monthly: 16.99 })] },
  {
    id: "fireflies",
    provider: "fireflies",
    name: "Fireflies",
    kind: "seat",
    serviceId: "fireflies",
    billingModel: "SEAT_BASED",
    plans: [simple("fireflies-pro", "Fireflies Pro", "personal", OLD(), { monthly: 18 }), simple("fireflies-business", "Fireflies Business", "business", OLD(), { monthly: 29 })],
  },
  { id: "notion-ai", provider: "notion", name: "Notion AI", kind: "seat", serviceId: "notion-ai", billingModel: "SEAT_BASED", plans: [simple("notion-business", "Notion Business (AI included)", "business", OLD(), { monthly: 20 })] },
  { id: "v0", provider: "vercel", name: "v0", kind: "seat", serviceId: "v0", billingModel: "SEAT_BASED", plans: [simple("v0-team", "v0 Team", "business", OLD(), { monthly: 30 })] },
];

/** Prodotti API (fatturazione a token): i prezzi stanno sui modelli, per deployment. */
export const API_PRODUCTS: SeedProduct[] = [
  { id: "openai-api", provider: "openai", name: "OpenAI API", kind: "api", serviceId: "openai-api", billingModel: "TOKEN_BASED", pricingUrl: "https://developers.openai.com/api/docs/pricing", plans: [] },
  { id: "anthropic-api", provider: "anthropic", name: "Claude API", kind: "api", serviceId: "anthropic-api", billingModel: "TOKEN_BASED", pricingUrl: "https://platform.claude.com/docs/en/about-claude/pricing", plans: [] },
  { id: "gemini-api", provider: "google", name: "Gemini API", kind: "api", serviceId: "gemini-api", billingModel: "TOKEN_BASED", pricingUrl: "https://ai.google.dev/gemini-api/docs/pricing", plans: [] },
  { id: "mistral-api", provider: "mistral", name: "Mistral API", kind: "api", serviceId: "mistral-api", billingModel: "TOKEN_BASED", pricingUrl: "https://mistral.ai/pricing/api/", plans: [] },
  { id: "azure-openai", provider: "microsoft", name: "Azure OpenAI", kind: "api", serviceId: "azure-openai", billingModel: "TOKEN_BASED", pricingUrl: "https://azure.microsoft.com/en-us/pricing/details/azure-openai/", plans: [] },
  { id: "bedrock", provider: "aws", name: "Amazon Bedrock", kind: "api", serviceId: "bedrock", billingModel: "TOKEN_BASED", pricingUrl: "https://aws.amazon.com/bedrock/pricing/", plans: [] },
  { id: "vertex-ai", provider: "google", name: "Vertex AI", kind: "api", serviceId: "vertex-ai", billingModel: "TOKEN_BASED", plans: [] },
  { id: "deepseek-api", provider: "deepseek", name: "DeepSeek API", kind: "api", serviceId: "deepseek", billingModel: "TOKEN_BASED", plans: [] },
  { id: "xai-api", provider: "xai", name: "xAI API", kind: "api", serviceId: "grok", billingModel: "TOKEN_BASED", plans: [] },
];

/** Prodotto API di ciascun deployment (per collegare le regole dei modelli al prodotto). */
export const DEPLOYMENT_PRODUCT: Record<string, string> = {
  "openai-direct": "openai-api",
  "anthropic-direct": "anthropic-api",
  "google-direct": "gemini-api",
  "mistral-direct": "mistral-api",
  "azure-openai": "azure-openai",
  "aws-bedrock": "bedrock",
  "google-vertex": "vertex-ai",
  "deepseek-direct": "deepseek-api",
  "xai-direct": "xai-api",
};

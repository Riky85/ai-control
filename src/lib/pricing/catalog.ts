/**
 * Catalogo prezzi di listino (USD, IVA esclusa) — verificato settembre 2026.
 * Serve a: 1) riconoscere piano e numero di posti da un addebito in banca,
 * 2) stimare il costo quando non c'è fatturazione collegata, 3) calcolare i
 * risparmi. I prezzi cambiano: aggiornare qui (una sola fonte).
 */
export const PRICES_AS_OF = "September 2026";
/** Cambio usato per confrontare listini in USD con addebiti in EUR. */
export const USD_TO_EUR = Number(process.env.USD_TO_EUR ?? 0.86);

export type Category = "assistant" | "coding" | "search" | "media" | "writing" | "meetings" | "api" | "local";

export interface Plan {
  id: string;
  service: string; // id del servizio (vedi discovery/catalog.ts)
  name: string;
  monthlyUsd: number; // per posto, fatturazione mensile
  annualMonthlyUsd?: number; // per posto al mese, fatturazione annuale
  business: boolean;
}

export const SERVICE_CATEGORY: Record<string, Category> = {
  chatgpt: "assistant", claude: "assistant", gemini: "assistant", copilot: "assistant", mistral: "assistant", "meta-ai": "assistant",
  grok: "assistant", deepseek: "assistant", poe: "assistant", "character-ai": "assistant",
  perplexity: "search",
  "github-copilot": "coding", cursor: "coding", windsurf: "coding", tabnine: "coding", continue: "coding", cline: "coding",
  "claude-code": "coding", lovable: "coding", v0: "coding", bolt: "coding",
  midjourney: "media", elevenlabs: "media", runway: "media",
  deepl: "writing", grammarly: "writing", jasper: "writing", "notion-ai": "writing",
  otter: "meetings", fireflies: "meetings",
  ollama: "local", "lm-studio": "local",
  "openai-api": "api", "anthropic-api": "api", "gemini-api": "api", "vertex-ai": "api", "azure-openai": "api", bedrock: "api",
  "mistral-api": "api", groq: "api", cohere: "api", together: "api", openrouter: "api", huggingface: "api", replicate: "api",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  assistant: "AI assistant",
  coding: "Coding assistant",
  search: "AI search",
  media: "Images, video & voice",
  writing: "Writing & translation",
  meetings: "Meeting notes",
  api: "AI API",
  local: "Local models",
};

export const PLANS: Plan[] = [
  { id: "chatgpt-plus", service: "chatgpt", name: "ChatGPT Plus", monthlyUsd: 20, business: false },
  { id: "chatgpt-pro", service: "chatgpt", name: "ChatGPT Pro", monthlyUsd: 200, business: false },
  { id: "chatgpt-business", service: "chatgpt", name: "ChatGPT Business", monthlyUsd: 25, annualMonthlyUsd: 20, business: true },
  { id: "chatgpt-business-premium", service: "chatgpt", name: "ChatGPT Business (premium seat)", monthlyUsd: 125, annualMonthlyUsd: 100, business: true },
  { id: "claude-pro", service: "claude", name: "Claude Pro", monthlyUsd: 20, business: false },
  { id: "claude-max-5x", service: "claude", name: "Claude Max 5×", monthlyUsd: 100, business: false },
  { id: "claude-max-20x", service: "claude", name: "Claude Max 20×", monthlyUsd: 200, business: false },
  { id: "claude-team", service: "claude", name: "Claude Team", monthlyUsd: 25, annualMonthlyUsd: 20, business: true },
  { id: "claude-team-premium", service: "claude", name: "Claude Team (premium seat)", monthlyUsd: 125, annualMonthlyUsd: 100, business: true },
  { id: "gemini-ai-pro", service: "gemini", name: "Google AI Pro", monthlyUsd: 19.99, business: false },
  { id: "gemini-workspace", service: "gemini", name: "Gemini for Workspace", monthlyUsd: 20, business: true },
  { id: "copilot-pro", service: "copilot", name: "Copilot Pro", monthlyUsd: 20, business: false },
  { id: "copilot-m365", service: "copilot", name: "Microsoft 365 Copilot", monthlyUsd: 30, annualMonthlyUsd: 30, business: true },
  { id: "github-copilot-pro", service: "github-copilot", name: "GitHub Copilot Pro", monthlyUsd: 10, business: false },
  { id: "github-copilot-business", service: "github-copilot", name: "GitHub Copilot Business", monthlyUsd: 19, business: true },
  { id: "github-copilot-enterprise", service: "github-copilot", name: "GitHub Copilot Enterprise", monthlyUsd: 39, business: true },
  { id: "cursor-pro", service: "cursor", name: "Cursor Pro", monthlyUsd: 20, annualMonthlyUsd: 16, business: false },
  { id: "cursor-teams", service: "cursor", name: "Cursor Teams", monthlyUsd: 40, annualMonthlyUsd: 32, business: true },
  { id: "perplexity-pro", service: "perplexity", name: "Perplexity Pro", monthlyUsd: 20, business: false },
  { id: "perplexity-enterprise", service: "perplexity", name: "Perplexity Enterprise Pro", monthlyUsd: 40, business: true },
  { id: "midjourney-basic", service: "midjourney", name: "Midjourney Basic", monthlyUsd: 10, business: false },
  { id: "midjourney-standard", service: "midjourney", name: "Midjourney Standard", monthlyUsd: 30, business: false },
  { id: "midjourney-pro", service: "midjourney", name: "Midjourney Pro", monthlyUsd: 60, business: false },
  { id: "windsurf-pro", service: "windsurf", name: "Windsurf Pro", monthlyUsd: 15, business: false },
  { id: "deepl-starter", service: "deepl", name: "DeepL Pro Starter", monthlyUsd: 10.49, business: true },
  { id: "grammarly-pro", service: "grammarly", name: "Grammarly Pro", monthlyUsd: 30, business: true },
  { id: "elevenlabs-creator", service: "elevenlabs", name: "ElevenLabs Creator", monthlyUsd: 22, business: false },
  { id: "otter-pro", service: "otter", name: "Otter Pro", monthlyUsd: 16.99, business: false },
  { id: "fireflies-pro", service: "fireflies", name: "Fireflies Pro", monthlyUsd: 18, business: false },
];

export type Tier = "frontier" | "balanced" | "light";
export interface ApiModel {
  match: RegExp; // riconosce l'id del modello come lo restituisce il provider
  name: string;
  vendor: string;
  inUsd: number; // per 1M token in ingresso
  outUsd: number; // per 1M token in uscita
  tier: Tier;
}

// Solo i modelli più diffusi; l'ordine conta (il primo che corrisponde vince).
export const API_MODELS: ApiModel[] = [
  { match: /fable/i, name: "Claude Fable", vendor: "Anthropic", inUsd: 10, outUsd: 50, tier: "frontier" },
  { match: /opus/i, name: "Claude Opus", vendor: "Anthropic", inUsd: 4, outUsd: 20, tier: "frontier" },
  { match: /sonnet/i, name: "Claude Sonnet", vendor: "Anthropic", inUsd: 2, outUsd: 10, tier: "balanced" },
  { match: /haiku/i, name: "Claude Haiku", vendor: "Anthropic", inUsd: 1, outUsd: 5, tier: "light" },
  { match: /gpt-6[-. ]?astra|gpt-5\.5(?!.*mini)/i, name: "GPT flagship", vendor: "OpenAI", inUsd: 10, outUsd: 50, tier: "frontier" },
  { match: /nano|4o-mini|-mini/i, name: "GPT mini", vendor: "OpenAI", inUsd: 0.15, outUsd: 0.6, tier: "light" },
  { match: /gpt-6|gpt-5|gpt-4\.1|gpt-4o|o3|o4/i, name: "GPT", vendor: "OpenAI", inUsd: 2, outUsd: 10, tier: "balanced" },
  { match: /gemini.*pro/i, name: "Gemini Pro", vendor: "Google", inUsd: 2, outUsd: 12, tier: "frontier" },
  { match: /gemini.*flash-lite/i, name: "Gemini Flash-Lite", vendor: "Google", inUsd: 0.1, outUsd: 0.4, tier: "light" },
  { match: /gemini.*flash/i, name: "Gemini Flash", vendor: "Google", inUsd: 0.75, outUsd: 3.75, tier: "light" },
  { match: /mistral-large/i, name: "Mistral Large", vendor: "Mistral", inUsd: 0.5, outUsd: 1.5, tier: "balanced" },
  { match: /mistral-medium/i, name: "Mistral Medium", vendor: "Mistral", inUsd: 0.4, outUsd: 2, tier: "balanced" },
  { match: /mistral-small|ministral/i, name: "Mistral Small", vendor: "Mistral", inUsd: 0.15, outUsd: 0.6, tier: "light" },
  { match: /deepseek/i, name: "DeepSeek", vendor: "DeepSeek", inUsd: 0.27, outUsd: 1.1, tier: "balanced" },
  { match: /grok/i, name: "Grok", vendor: "xAI", inUsd: 2, outUsd: 6, tier: "balanced" },
];

export function apiModelFor(model: string | null | undefined): ApiModel | null {
  if (!model) return null;
  return API_MODELS.find((m) => m.match.test(model)) ?? null;
}

/** Prezzo medio "misto" per 1M token (3 parti input, 1 output), per confronti. */
export const blended = (m: ApiModel) => (m.inUsd * 3 + m.outUsd) / 4;

/** Alternativa più economica di un livello sotto, stesso fornitore se possibile. */
export function cheaperModel(m: ApiModel): ApiModel | null {
  const next: Tier | null = m.tier === "frontier" ? "balanced" : m.tier === "balanced" ? "light" : null;
  if (!next) return null;
  const same = API_MODELS.filter((x) => x.vendor === m.vendor && x.tier === next).sort((a, b) => blended(a) - blended(b))[0];
  return same ?? API_MODELS.filter((x) => x.tier === next).sort((a, b) => blended(a) - blended(b))[0] ?? null;
}

export const plansFor = (service: string) => PLANS.filter((p) => p.service === service);

/**
 * Dato un importo mensile in EUR, trova piano e numero di posti più plausibili
 * (multiplo intero del prezzo per posto, tolleranza per cambio e IVA).
 */
export function guessPlan(service: string, monthlyEur: number): { plan: Plan; seats: number; annual: boolean } | null {
  let best: { plan: Plan; seats: number; annual: boolean; err: number } | null = null;
  // Molti servizi in Europa applicano lo stesso numero in euro ("$20" → "€20"): si provano entrambi.
  for (const usd of [monthlyEur, monthlyEur / USD_TO_EUR])
  for (const plan of plansFor(service)) {
    for (const [price, annual] of [[plan.monthlyUsd, false], [plan.annualMonthlyUsd, true]] as const) {
      if (!price) continue;
      for (const vat of [1, 1.22]) {
        const seats = Math.round(usd / (price * vat));
        if (seats < 1 || seats > 5000) continue;
        const err = Math.abs(usd - seats * price * vat) / usd;
        // A parità, preferire i piani business per più posti e quelli personali per 1 posto.
        const bias = (seats > 1 && !plan.business ? 0.02 : 0) + (seats === 1 && plan.business ? 0.01 : 0) + (!plan.business && plan.monthlyUsd >= 100 ? 0.005 : 0);
        if (err < 0.12 && (!best || err + bias < best.err)) best = { plan, seats, annual, err: err + bias };
      }
    }
  }
  return best ? { plan: best.plan, seats: best.seats, annual: best.annual } : null;
}

/** Stima quando non c'è un addebito: posti × prezzo del piano business più comune. */
export function estimateMonthlyEur(service: string, users: number): { eur: number; plan: Plan } | null {
  const plan = plansFor(service).find((p) => p.business) ?? plansFor(service)[0];
  if (!plan || users < 1) return null;
  return { eur: Math.round(users * plan.monthlyUsd * USD_TO_EUR * 100) / 100, plan };
}

/** "AI assistants", "coding assistants"… per i titoli. */
export const categoryPlural = (c: Category) => {
  const l = CATEGORY_LABEL[c];
  return (l.startsWith("AI") ? l : l.charAt(0).toLowerCase() + l.slice(1)) + (l.endsWith("s") ? "" : "s");
};

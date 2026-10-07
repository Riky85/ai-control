/**
 * Compatibilità col vecchio catalogo prezzi.
 *
 * I prezzi NON stanno più qui: vivono nel catalogo versionato con provenienza
 * (pricing/catalog-data/*, caricato nel database da pricing/catalog-sync.ts) e si
 * leggono da pricing/service.ts. Questo file espone le vecchie forme (PLANS,
 * API_MODELS, apiModelFor…) ricavate da quel catalogo, per i chiamanti che non
 * sono ancora passati al servizio, più la tassonomia delle categorie (non prezzi).
 */
import { legacyPlans, legacyApiModels, legacyApiModelFor, blendedPrice, cheaperApiModel, estimateSeatCost, CATALOG_VERIFIED_AT, type LegacyPlan, type LegacyApiModel } from "@/lib/pricing/service";
import { USD_TO_EUR } from "@/lib/spend/fx";

export { USD_TO_EUR };

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Mese dell'ultima verifica dei listini ufficiali, es. "October 2026". */
export const PRICES_AS_OF = `${MONTH[CATALOG_VERIFIED_AT.getUTCMonth()]} ${CATALOG_VERIFIED_AT.getUTCFullYear()}`;

export type Category = "assistant" | "coding" | "search" | "media" | "writing" | "meetings" | "api" | "local";

/** Un tipo di posto del catalogo nella forma del vecchio elenco (prezzi in USD dal listino). */
export type Plan = LegacyPlan;

export const SERVICE_CATEGORY: Record<string, Category> = {
  chatgpt: "assistant", claude: "assistant", gemini: "assistant", copilot: "assistant", mistral: "assistant", "meta-ai": "assistant",
  grok: "assistant", deepseek: "assistant", poe: "assistant", "character-ai": "assistant",
  perplexity: "search",
  "github-copilot": "coding", cursor: "coding", windsurf: "coding", tabnine: "coding", continue: "coding", cline: "coding",
  "claude-code": "coding", lovable: "coding", v0: "coding", bolt: "coding",
  midjourney: "media", elevenlabs: "media", runway: "media",
  deepl: "writing", grammarly: "writing", jasper: "writing", "notion-ai": "writing",
  otter: "meetings", fireflies: "meetings",
  ollama: "local", "lm-studio": "local", jan: "local", gpt4all: "local", msty: "local",
  chatbox: "assistant", you: "search", pi: "assistant", kimi: "assistant", qwen: "assistant", zai: "assistant", doubao: "assistant", manus: "assistant", genspark: "search", chatpdf: "writing",
  gamma: "writing", napkin: "writing", tome: "writing", "beautiful-ai": "writing", "copy-ai": "writing", writesonic: "writing", quillbot: "writing", wordtune: "writing", rytr: "writing",
  leonardo: "media", ideogram: "media", krea: "media", firefly: "media", stability: "media", pika: "media", luma: "media", synthesia: "media", heygen: "media", descript: "media", suno: "media", udio: "media",
  tldv: "meetings", "read-ai": "meetings", fathom: "meetings", krisp: "meetings",
  phind: "coding", "sourcegraph-cody": "coding", devin: "coding", augment: "coding", replit: "coding", warp: "coding", "amazon-q": "coding", "gemini-code": "coding",
  fireworks: "api", deepinfra: "api",
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

/** Piani a posti, ricavati dal catalogo (stesso ordine e stessi id del vecchio elenco). */
export const PLANS: Plan[] = legacyPlans();

export type Tier = "frontier" | "balanced" | "light";
export type ApiModel = LegacyApiModel;

/** Modelli API con prezzo a token, dal catalogo. */
export const API_MODELS: ApiModel[] = legacyApiModels();

export function apiModelFor(model: string | null | undefined): ApiModel | null {
  return legacyApiModelFor(model);
}

/** Prezzo medio "misto" per 1M token (3 parti input, 1 output), per confronti. */
export const blended = (m: ApiModel) => blendedPrice(m);

/** Alternativa più economica di un livello sotto, stesso fornitore se possibile. */
export function cheaperModel(m: ApiModel): ApiModel | null {
  return cheaperApiModel(m);
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

/** Stima quando non c'è un addebito: posti × prezzo del piano business più comune (listino dal servizio prezzi). */
export function estimateMonthlyEur(service: string, users: number): { eur: number; plan: Plan } | null {
  const plan = plansFor(service).find((p) => p.business) ?? plansFor(service)[0];
  if (!plan || users < 1) return null;
  const e = estimateSeatCost([{ seatType: plan.id, seats: users, cycle: "monthly" }]);
  return { eur: Math.round(e.eur * 100) / 100, plan };
}

/** "AI assistants", "coding assistants"… per i titoli. */
export const categoryPlural = (c: Category) => {
  const l = CATEGORY_LABEL[c];
  return (l.startsWith("AI") ? l : l.charAt(0).toLowerCase() + l.slice(1)) + (l.endsWith("s") ? "" : "s");
};

/** Dove gestire abbonamento e posti di ciascun servizio (per agire subito). */
export const MANAGE_URL: Record<string, string> = {
  chatgpt: "https://chatgpt.com/admin/billing",
  claude: "https://claude.ai/settings/billing",
  gemini: "https://admin.google.com/ac/billing/subscriptions",
  copilot: "https://admin.microsoft.com/#/licenses",
  "github-copilot": "https://github.com/settings/copilot",
  cursor: "https://cursor.com/dashboard",
  perplexity: "https://www.perplexity.ai/settings/account",
  midjourney: "https://www.midjourney.com/account",
  "openai-api": "https://platform.openai.com/settings/organization/billing/overview",
  "anthropic-api": "https://console.anthropic.com/settings/billing",
  "mistral-api": "https://console.mistral.ai/billing",
  "gemini-api": "https://aistudio.google.com/usage",
  elevenlabs: "https://elevenlabs.io/app/subscription",
  deepl: "https://www.deepl.com/your-account/subscription",
  grammarly: "https://account.grammarly.com/subscription",
  windsurf: "https://windsurf.com/subscription/manage-plan",
  mistral: "https://console.mistral.ai/billing",
  grok: "https://grok.com/settings",
  "notion-ai": "https://www.notion.so/settings/billing",
};

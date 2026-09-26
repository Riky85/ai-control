/**
 * Riconoscimento dei servizi AI dalle righe di un estratto conto o dal
 * fornitore di una fattura. I testi delle banche sono sporchi ("OPENAI
 * *CHATGPT SUBSCR SAN FRANCISCO"), quindi regole semplici e ordinate: la
 * prima che corrisponde vince. Mai indovinare su nomi generici (Google,
 * Microsoft, GitHub, Notion) senza una parola che indichi l'AI.
 */
export interface MerchantRule {
  match: RegExp;
  service: string; // id in discovery/catalog.ts
}

export const MERCHANT_RULES: MerchantRule[] = [
  { match: /chatgpt|openai\s*\*?\s*chat/i, service: "chatgpt" },
  { match: /openai/i, service: "openai-api" },
  { match: /claude\.ai|claude\s*(pro|max|team|subscription)|anthropic.*claude/i, service: "claude" },
  { match: /anthropic/i, service: "anthropic-api" },
  { match: /gemini|google\s*one\s*ai|google\s*ai\s*(pro|ultra|plus)/i, service: "gemini" },
  { match: /copilot/i, service: "copilot" }, // GitHub Copilot corretto sotto (ordine: prima github)
  { match: /cursor|anysphere/i, service: "cursor" },
  { match: /perplexity/i, service: "perplexity" },
  { match: /midjourney/i, service: "midjourney" },
  { match: /elevenlabs|eleven\s*labs/i, service: "elevenlabs" },
  { match: /runway\s*ml|runwayml/i, service: "runway" },
  { match: /deepl/i, service: "deepl" },
  { match: /grammarly/i, service: "grammarly" },
  { match: /notion.*\bai\b/i, service: "notion-ai" },
  { match: /otter\.?ai/i, service: "otter" },
  { match: /fireflies/i, service: "fireflies" },
  { match: /jasper/i, service: "jasper" },
  { match: /character\.?ai/i, service: "character-ai" },
  { match: /\bpoe\b|quora/i, service: "poe" },
  { match: /mistral/i, service: "mistral-api" },
  { match: /\bgroq\b/i, service: "groq" },
  { match: /together\s*(ai|computer)/i, service: "together" },
  { match: /openrouter/i, service: "openrouter" },
  { match: /hugging\s*face|huggingface/i, service: "huggingface" },
  { match: /replicate/i, service: "replicate" },
  { match: /lovable/i, service: "lovable" },
  { match: /stackblitz|bolt\.new/i, service: "bolt" },
  { match: /\bx\.ai\b|\bxai\b|grok/i, service: "grok" },
  { match: /deepseek/i, service: "deepseek" },
  { match: /cohere/i, service: "cohere" },
  { match: /windsurf|codeium/i, service: "windsurf" },
  { match: /tabnine/i, service: "tabnine" },
];

export function matchMerchant(text: string): string | null {
  const t = text.replace(/\s+/g, " ");
  if (/github/i.test(t) && /copilot/i.test(t)) return "github-copilot";
  for (const r of MERCHANT_RULES) if (r.match.test(t)) return r.service;
  return null;
}

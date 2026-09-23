import { BRAND_ICONS } from "@/lib/brand-icons";

/**
 * Loghi dei provider/prodotti AI — tracciati ufficiali (Lobe Icons, MIT),
 * non disegni approssimati. Si risolve prima per PRODOTTO (il nome
 * dell'asset: "Claude Code" → Claude, "ChatGPT" → OpenAI, "Gemini"…),
 * poi per PROVIDER (vendor). Confronto per sottostringa, così valori
 * compositi come "GitHub / Microsoft" vengono riconosciuti.
 */
const PRODUCT_RULES: [RegExp, string][] = [
  [/claude/i, "claude"],
  [/chatgpt|\bgpt|openai|codex|dall.?e|sora/i, "openai"],
  [/gemini|bard/i, "gemini"],
  [/github copilot|copilot.*github/i, "githubcopilot"],
  [/^copilot\b|microsoft copilot|m365 copilot|copilot studio/i, "copilot"],
  [/cursor/i, "cursor"],
  [/windsurf|codeium/i, "windsurf"],
  [/mistral|le chat/i, "mistral"],
  [/llama|\bmeta\b/i, "meta"],
  [/deepseek/i, "deepseek"],
  [/perplexity/i, "perplexity"],
  [/bedrock/i, "bedrock"],
  [/langchain/i, "langchain"],
  [/ollama/i, "ollama"],
];

const VENDOR_RULES: [RegExp, string][] = [
  [/anthropic/i, "anthropic"],
  [/openai/i, "openai"],
  [/github/i, "github"],
  [/azure/i, "azure"],
  [/microsoft/i, "microsoft"],
  [/google/i, "google"],
  [/aws|amazon/i, "aws"],
  [/mistral/i, "mistral"],
  [/meta/i, "meta"],
  [/hugging/i, "huggingface"],
  [/deepseek/i, "deepseek"],
  [/perplexity/i, "perplexity"],
  [/groq/i, "groq"],
  [/cohere/i, "cohere"],
  [/\bxai\b|x\.ai|grok/i, "xai"],
  [/together/i, "together"],
  [/openrouter/i, "openrouter"],
  [/gemini/i, "gemini"],
];

export function resolveBrand(vendor?: string | null, name?: string | null): string | null {
  for (const [re, key] of PRODUCT_RULES) if (name && re.test(name)) return key;
  for (const [re, key] of VENDOR_RULES) if (vendor && re.test(vendor)) return key;
  for (const [re, key] of PRODUCT_RULES) if (vendor && re.test(vendor)) return key;
  return null;
}

export default function VendorIcon({ vendor, name, size = 16 }: { vendor: string; name?: string | null; size?: number }) {
  const key = resolveBrand(vendor, name);
  const icon = key ? BRAND_ICONS[key] : null;
  if (!icon) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0 text-ink-400">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" fill="none" strokeDasharray="2 2" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={icon.viewBox}
      fill="currentColor"
      fillRule="evenodd"
      className="shrink-0 text-[#141418]"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}

/** Tile neutra con il logo a colori dentro — stile directory di integrazioni. */
export function VendorBadge({ vendor, name, size = 36 }: { vendor: string; name?: string | null; size?: number }) {
  return (
    <span
      className="rounded-lg border border-line bg-panel flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <VendorIcon vendor={vendor} name={name} size={Math.round(size * 0.55)} />
    </span>
  );
}

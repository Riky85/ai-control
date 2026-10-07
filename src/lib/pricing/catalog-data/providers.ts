/** Fornitori e deployment del catalogo. */
import type { SeedDeployment, SeedProvider } from "./types";

export const PROVIDERS: SeedProvider[] = [
  { id: "openai", name: "OpenAI", kind: "model_provider", website: "https://openai.com", pricingUrl: "https://developers.openai.com/api/docs/pricing", hqRegion: "US", euDataResidency: true },
  { id: "anthropic", name: "Anthropic", kind: "model_provider", website: "https://www.anthropic.com", pricingUrl: "https://platform.claude.com/docs/en/about-claude/pricing", hqRegion: "US" },
  { id: "google", name: "Google", kind: "model_provider", website: "https://ai.google.dev", pricingUrl: "https://ai.google.dev/gemini-api/docs/pricing", hqRegion: "US" },
  { id: "mistral", name: "Mistral AI", kind: "model_provider", website: "https://mistral.ai", pricingUrl: "https://mistral.ai/pricing/api/", hqRegion: "EU", euDataResidency: true },
  { id: "microsoft", name: "Microsoft", kind: "cloud", website: "https://azure.microsoft.com", pricingUrl: "https://azure.microsoft.com/en-us/pricing/details/azure-openai/", hqRegion: "US", euDataResidency: true },
  { id: "aws", name: "Amazon Web Services", kind: "cloud", website: "https://aws.amazon.com/bedrock/", pricingUrl: "https://aws.amazon.com/bedrock/pricing/", hqRegion: "US", euDataResidency: true },
  { id: "github", name: "GitHub", kind: "app_vendor", website: "https://github.com/features/copilot", pricingUrl: "https://docs.github.com/en/copilot/get-started/plans", hqRegion: "US" },
  { id: "anysphere", name: "Cursor (Anysphere)", kind: "app_vendor", website: "https://cursor.com", pricingUrl: "https://cursor.com/pricing", hqRegion: "US" },
  { id: "perplexity", name: "Perplexity", kind: "app_vendor", website: "https://www.perplexity.ai", pricingUrl: "https://www.perplexity.ai/enterprise/pricing", hqRegion: "US" },
  { id: "xai", name: "xAI", kind: "model_provider", website: "https://x.ai", hqRegion: "US" },
  { id: "windsurf", name: "Windsurf", kind: "app_vendor", website: "https://windsurf.com", hqRegion: "US" },
  { id: "midjourney", name: "Midjourney", kind: "app_vendor", website: "https://www.midjourney.com", hqRegion: "US" },
  { id: "deepl", name: "DeepL", kind: "app_vendor", website: "https://www.deepl.com", hqRegion: "EU", euDataResidency: true },
  { id: "grammarly", name: "Grammarly", kind: "app_vendor", website: "https://www.grammarly.com", hqRegion: "US" },
  { id: "elevenlabs", name: "ElevenLabs", kind: "app_vendor", website: "https://elevenlabs.io", hqRegion: "US" },
  { id: "otter", name: "Otter.ai", kind: "app_vendor", website: "https://otter.ai", hqRegion: "US" },
  { id: "fireflies", name: "Fireflies.ai", kind: "app_vendor", website: "https://fireflies.ai", hqRegion: "US" },
  { id: "notion", name: "Notion", kind: "app_vendor", website: "https://www.notion.so", hqRegion: "US" },
  { id: "vercel", name: "Vercel", kind: "app_vendor", website: "https://v0.dev", hqRegion: "US" },
  { id: "deepseek", name: "DeepSeek", kind: "model_provider", website: "https://www.deepseek.com", hqRegion: "CN" },
  { id: "angar", name: "angar", kind: "app_vendor", hqRegion: "EU" },
];

export const DEPLOYMENTS: SeedDeployment[] = [
  { id: "openai-direct", kind: "DIRECT_API", host: "openai", name: "OpenAI API", regions: ["global", "eu", "us"] },
  { id: "anthropic-direct", kind: "DIRECT_API", host: "anthropic", name: "Claude API", regions: ["global", "us"] },
  { id: "google-direct", kind: "DIRECT_API", host: "google", name: "Gemini API", regions: ["global"] },
  { id: "mistral-direct", kind: "DIRECT_API", host: "mistral", name: "Mistral API", regions: ["eu"] },
  { id: "azure-openai", kind: "AZURE", host: "microsoft", name: "Azure OpenAI (Foundry)", regions: ["global", "eu", "us"] },
  { id: "aws-bedrock", kind: "BEDROCK", host: "aws", name: "Amazon Bedrock", regions: ["global", "eu", "us"] },
  { id: "google-vertex", kind: "VERTEX", host: "google", name: "Google Vertex AI", regions: ["global", "eu", "us"] },
  { id: "deepseek-direct", kind: "DIRECT_API", host: "deepseek", name: "DeepSeek API", regions: ["global"] },
  { id: "xai-direct", kind: "DIRECT_API", host: "xai", name: "xAI API", regions: ["global"] },
  // Non un deployment reale: contenitore delle stime di angar (ripieghi).
  { id: "angar-estimate", kind: "OTHER", host: "angar", name: "angar estimate", regions: ["global"] },
];

/** Deployment diretto di ciascun fornitore di modelli. */
export const DIRECT_DEPLOYMENT: Record<string, string> = {
  openai: "openai-direct",
  anthropic: "anthropic-direct",
  google: "google-direct",
  mistral: "mistral-direct",
  deepseek: "deepseek-direct",
  xai: "xai-direct",
  angar: "angar-estimate",
};

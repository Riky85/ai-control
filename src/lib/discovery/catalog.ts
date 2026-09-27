import type { AiAssetType } from "@prisma/client";

/**
 * Catalogo dei servizi AI riconoscibili dal traffico (nomi di dominio).
 * Lo scanner lo scarica e confronta tutto IN LOCALE: dal computer escono
 * solo i domini che corrispondono a un servizio AI, mai il resto della
 * navigazione.
 */
export interface AiService {
  id: string;
  name: string;
  vendor: string;
  type: AiAssetType;
  domains: string[]; // corrispondenza per suffisso: "openai.com" copre "api.openai.com"
  apps?: string[]; // nomi di app desktop / estensioni che lo indicano
}

export const AI_SERVICES: AiService[] = [
  { id: "chatgpt", name: "ChatGPT", vendor: "OpenAI", type: "AI_APPLICATION", domains: ["chatgpt.com", "chat.openai.com", "chat.com"], apps: ["ChatGPT"] },
  { id: "openai-api", name: "OpenAI API", vendor: "OpenAI", type: "AI_API", domains: ["api.openai.com"] },
  { id: "claude", name: "Claude", vendor: "Anthropic", type: "AI_APPLICATION", domains: ["claude.ai"], apps: ["Claude"] },
  { id: "anthropic-api", name: "Anthropic API", vendor: "Anthropic", type: "AI_API", domains: ["api.anthropic.com", "console.anthropic.com"] },
  { id: "gemini", name: "Gemini", vendor: "Google", type: "AI_APPLICATION", domains: ["gemini.google.com", "bard.google.com", "aistudio.google.com", "notebooklm.google.com"] },
  { id: "gemini-api", name: "Gemini API", vendor: "Google", type: "AI_API", domains: ["generativelanguage.googleapis.com"] },
  { id: "vertex-ai", name: "Vertex AI", vendor: "Google", type: "AI_API", domains: ["aiplatform.googleapis.com"] },
  { id: "copilot", name: "Microsoft Copilot", vendor: "Microsoft", type: "AI_APPLICATION", domains: ["copilot.microsoft.com", "copilot.cloud.microsoft", "sydney.bing.com"], apps: ["Copilot"] },
  { id: "azure-openai", name: "Azure OpenAI", vendor: "Microsoft", type: "AI_API", domains: ["openai.azure.com", "cognitiveservices.azure.com"] },
  { id: "github-copilot", name: "GitHub Copilot", vendor: "GitHub / Microsoft", type: "AI_DEV_TOOL", domains: ["copilot-proxy.githubusercontent.com", "api.githubcopilot.com", "githubcopilot.com"], apps: ["github.copilot", "github.copilot-chat"] },
  { id: "bedrock", name: "Amazon Bedrock", vendor: "AWS", type: "AI_API", domains: ["bedrock-runtime", "bedrock.amazonaws.com"] },
  { id: "mistral", name: "Le Chat", vendor: "Mistral", type: "AI_APPLICATION", domains: ["chat.mistral.ai"] },
  { id: "mistral-api", name: "Mistral API", vendor: "Mistral", type: "AI_API", domains: ["api.mistral.ai", "console.mistral.ai"] },
  { id: "perplexity", name: "Perplexity", vendor: "Perplexity", type: "AI_APPLICATION", domains: ["perplexity.ai"], apps: ["Perplexity"] },
  { id: "deepseek", name: "DeepSeek", vendor: "DeepSeek", type: "AI_APPLICATION", domains: ["deepseek.com"] },
  { id: "grok", name: "Grok", vendor: "xAI", type: "AI_APPLICATION", domains: ["grok.com", "x.ai"] },
  { id: "meta-ai", name: "Meta AI", vendor: "Meta", type: "AI_APPLICATION", domains: ["meta.ai"] },
  { id: "groq", name: "Groq", vendor: "Groq", type: "AI_API", domains: ["groq.com"] },
  { id: "cohere", name: "Cohere", vendor: "Cohere", type: "AI_API", domains: ["cohere.com", "cohere.ai"] },
  { id: "together", name: "Together AI", vendor: "Together AI", type: "AI_API", domains: ["together.xyz", "together.ai"] },
  { id: "openrouter", name: "OpenRouter", vendor: "OpenRouter", type: "AI_API", domains: ["openrouter.ai"] },
  { id: "huggingface", name: "Hugging Face", vendor: "Hugging Face", type: "AI_API", domains: ["huggingface.co", "hf.co"] },
  { id: "replicate", name: "Replicate", vendor: "Replicate", type: "AI_API", domains: ["replicate.com", "replicate.delivery"] },
  { id: "cursor", name: "Cursor", vendor: "Anysphere", type: "AI_DEV_TOOL", domains: ["cursor.sh", "cursor.com"], apps: ["Cursor"] },
  { id: "windsurf", name: "Windsurf", vendor: "Codeium", type: "AI_DEV_TOOL", domains: ["codeium.com", "windsurf.com"], apps: ["Windsurf", "codeium.codeium"] },
  { id: "tabnine", name: "Tabnine", vendor: "Tabnine", type: "AI_DEV_TOOL", domains: ["tabnine.com"], apps: ["tabnine.tabnine-vscode"] },
  { id: "continue", name: "Continue", vendor: "Continue", type: "AI_DEV_TOOL", domains: ["continue.dev"], apps: ["continue.continue"] },
  { id: "cline", name: "Cline", vendor: "Cline", type: "AI_DEV_TOOL", domains: ["cline.bot"], apps: ["saoudrizwan.claude-dev"] },
  { id: "claude-code", name: "Claude Code", vendor: "Anthropic", type: "AI_DEV_TOOL", domains: [], apps: ["anthropic.claude-code", "claude-code"] },
  { id: "lovable", name: "Lovable", vendor: "Lovable", type: "AI_DEV_TOOL", domains: ["lovable.dev"] },
  { id: "v0", name: "v0", vendor: "Vercel", type: "AI_DEV_TOOL", domains: ["v0.dev", "v0.app"] },
  { id: "bolt", name: "Bolt", vendor: "StackBlitz", type: "AI_DEV_TOOL", domains: ["bolt.new"] },
  { id: "midjourney", name: "Midjourney", vendor: "Midjourney", type: "AI_APPLICATION", domains: ["midjourney.com"] },
  { id: "elevenlabs", name: "ElevenLabs", vendor: "ElevenLabs", type: "AI_APPLICATION", domains: ["elevenlabs.io"] },
  { id: "runway", name: "Runway", vendor: "Runway", type: "AI_APPLICATION", domains: ["runwayml.com"] },
  { id: "deepl", name: "DeepL", vendor: "DeepL", type: "AI_APPLICATION", domains: ["deepl.com"], apps: ["DeepL"] },
  { id: "grammarly", name: "Grammarly", vendor: "Grammarly", type: "AI_FEATURE", domains: ["grammarly.com", "grammarly.io"], apps: ["Grammarly"] },
  { id: "notion-ai", name: "Notion AI", vendor: "Notion", type: "AI_FEATURE", domains: ["notion.so/ai"] },
  { id: "otter", name: "Otter.ai", vendor: "Otter", type: "AI_APPLICATION", domains: ["otter.ai"] },
  { id: "fireflies", name: "Fireflies", vendor: "Fireflies", type: "AI_APPLICATION", domains: ["fireflies.ai"] },
  { id: "jasper", name: "Jasper", vendor: "Jasper", type: "AI_APPLICATION", domains: ["jasper.ai"] },
  { id: "character-ai", name: "Character.AI", vendor: "Character.AI", type: "AI_APPLICATION", domains: ["character.ai"] },
  { id: "poe", name: "Poe", vendor: "Quora", type: "AI_APPLICATION", domains: ["poe.com"] },
  { id: "ollama", name: "Ollama (local models)", vendor: "Ollama", type: "AI_APPLICATION", domains: ["ollama.com", "ollama.ai"], apps: ["Ollama"] },
  { id: "lm-studio", name: "LM Studio (local models)", vendor: "LM Studio", type: "AI_APPLICATION", domains: ["lmstudio.ai"], apps: ["LM Studio"] },
  { id: "jan", name: "Jan (local models)", vendor: "Jan", type: "AI_APPLICATION", domains: ["jan.ai"], apps: ["Jan"] },
  { id: "gpt4all", name: "GPT4All (local models)", vendor: "Nomic", type: "AI_APPLICATION", domains: ["nomic.ai", "gpt4all.io"], apps: ["GPT4All"] },
  { id: "msty", name: "Msty", vendor: "Msty", type: "AI_APPLICATION", domains: ["msty.app"], apps: ["Msty"] },
  { id: "chatbox", name: "Chatbox", vendor: "Chatbox", type: "AI_APPLICATION", domains: ["chatboxai.app"], apps: ["Chatbox"] },
  // Assistenti e ricerca
  { id: "you", name: "You.com", vendor: "You.com", type: "AI_APPLICATION", domains: ["you.com"] },
  { id: "pi", name: "Pi", vendor: "Inflection AI", type: "AI_APPLICATION", domains: ["pi.ai"] },
  { id: "kimi", name: "Kimi", vendor: "Moonshot AI", type: "AI_APPLICATION", domains: ["kimi.com", "kimi.ai", "moonshot.cn", "moonshot.ai"] },
  { id: "qwen", name: "Qwen Chat", vendor: "Alibaba", type: "AI_APPLICATION", domains: ["chat.qwen.ai", "qwen.ai", "tongyi.aliyun.com", "qianwen.aliyun.com"] },
  { id: "zai", name: "Z.ai (GLM)", vendor: "Zhipu AI", type: "AI_APPLICATION", domains: ["z.ai", "chatglm.cn", "bigmodel.cn"] },
  { id: "doubao", name: "Doubao", vendor: "ByteDance", type: "AI_APPLICATION", domains: ["doubao.com"] },
  { id: "manus", name: "Manus", vendor: "Manus", type: "AI_AGENT", domains: ["manus.im"] },
  { id: "genspark", name: "Genspark", vendor: "Genspark", type: "AI_AGENT", domains: ["genspark.ai"] },
  { id: "chatpdf", name: "ChatPDF", vendor: "ChatPDF", type: "AI_APPLICATION", domains: ["chatpdf.com"] },
  // Presentazioni, scrittura
  { id: "gamma", name: "Gamma", vendor: "Gamma", type: "AI_APPLICATION", domains: ["gamma.app"] },
  { id: "napkin", name: "Napkin", vendor: "Napkin AI", type: "AI_APPLICATION", domains: ["napkin.ai"] },
  { id: "tome", name: "Tome", vendor: "Tome", type: "AI_APPLICATION", domains: ["tome.app"] },
  { id: "beautiful-ai", name: "Beautiful.ai", vendor: "Beautiful.ai", type: "AI_APPLICATION", domains: ["beautiful.ai"] },
  { id: "copy-ai", name: "Copy.ai", vendor: "Copy.ai", type: "AI_APPLICATION", domains: ["copy.ai"] },
  { id: "writesonic", name: "Writesonic", vendor: "Writesonic", type: "AI_APPLICATION", domains: ["writesonic.com"] },
  { id: "quillbot", name: "QuillBot", vendor: "Learneo", type: "AI_APPLICATION", domains: ["quillbot.com"] },
  { id: "wordtune", name: "Wordtune", vendor: "AI21 Labs", type: "AI_APPLICATION", domains: ["wordtune.com"] },
  { id: "rytr", name: "Rytr", vendor: "Rytr", type: "AI_APPLICATION", domains: ["rytr.me"] },
  // Immagini, video, voce, musica
  { id: "leonardo", name: "Leonardo.Ai", vendor: "Canva", type: "AI_APPLICATION", domains: ["leonardo.ai"] },
  { id: "ideogram", name: "Ideogram", vendor: "Ideogram", type: "AI_APPLICATION", domains: ["ideogram.ai"] },
  { id: "krea", name: "Krea", vendor: "Krea", type: "AI_APPLICATION", domains: ["krea.ai"] },
  { id: "firefly", name: "Adobe Firefly", vendor: "Adobe", type: "AI_APPLICATION", domains: ["firefly.adobe.com"] },
  { id: "stability", name: "Stability AI", vendor: "Stability AI", type: "AI_APPLICATION", domains: ["stability.ai", "dreamstudio.ai"] },
  { id: "pika", name: "Pika", vendor: "Pika", type: "AI_APPLICATION", domains: ["pika.art"] },
  { id: "luma", name: "Luma Dream Machine", vendor: "Luma AI", type: "AI_APPLICATION", domains: ["lumalabs.ai"] },
  { id: "synthesia", name: "Synthesia", vendor: "Synthesia", type: "AI_APPLICATION", domains: ["synthesia.io"] },
  { id: "heygen", name: "HeyGen", vendor: "HeyGen", type: "AI_APPLICATION", domains: ["heygen.com"] },
  { id: "descript", name: "Descript", vendor: "Descript", type: "AI_APPLICATION", domains: ["descript.com"], apps: ["Descript"] },
  { id: "suno", name: "Suno", vendor: "Suno", type: "AI_APPLICATION", domains: ["suno.com", "suno.ai"] },
  { id: "udio", name: "Udio", vendor: "Udio", type: "AI_APPLICATION", domains: ["udio.com"] },
  // Riunioni
  { id: "tldv", name: "tl;dv", vendor: "tl;dv", type: "AI_APPLICATION", domains: ["tldv.io"] },
  { id: "read-ai", name: "Read AI", vendor: "Read AI", type: "AI_APPLICATION", domains: ["read.ai"] },
  { id: "fathom", name: "Fathom", vendor: "Fathom", type: "AI_APPLICATION", domains: ["fathom.video"] },
  { id: "krisp", name: "Krisp", vendor: "Krisp", type: "AI_APPLICATION", domains: ["krisp.ai"], apps: ["Krisp"] },
  // Sviluppo
  { id: "phind", name: "Phind", vendor: "Phind", type: "AI_DEV_TOOL", domains: ["phind.com"] },
  { id: "sourcegraph-cody", name: "Sourcegraph Cody", vendor: "Sourcegraph", type: "AI_DEV_TOOL", domains: ["sourcegraph.com"], apps: ["sourcegraph.cody-ai"] },
  { id: "devin", name: "Devin", vendor: "Cognition", type: "AI_AGENT", domains: ["devin.ai", "cognition.ai"] },
  { id: "augment", name: "Augment Code", vendor: "Augment", type: "AI_DEV_TOOL", domains: ["augmentcode.com"], apps: ["augment.vscode-augment"] },
  { id: "replit", name: "Replit", vendor: "Replit", type: "AI_DEV_TOOL", domains: ["replit.com"], apps: ["Replit"] },
  { id: "warp", name: "Warp", vendor: "Warp", type: "AI_DEV_TOOL", domains: ["warp.dev"], apps: ["Warp"] },
  { id: "amazon-q", name: "Amazon Q Developer", vendor: "AWS", type: "AI_DEV_TOOL", domains: ["q.aws", "codewhisperer.amazonaws.com"], apps: ["amazonwebservices.amazon-q-vscode"] },
  { id: "gemini-code", name: "Gemini Code Assist", vendor: "Google", type: "AI_DEV_TOOL", domains: ["codeassist.google"], apps: ["google.geminicodeassist"] },
  // API
  { id: "fireworks", name: "Fireworks AI", vendor: "Fireworks", type: "AI_API", domains: ["fireworks.ai"] },
  { id: "deepinfra", name: "DeepInfra", vendor: "DeepInfra", type: "AI_API", domains: ["deepinfra.com"] },
];

export function matchDomain(domain: string): AiService | null {
  const full = domain.toLowerCase().replace(/^\*\./, "");
  const [host, ...rest] = full.split("/");
  const d = host.replace(/\.$/, "");
  const path = rest.join("/");
  for (const s of AI_SERVICES) {
    for (const pat of s.domains) {
      if (pat.includes("/")) {
        // percorsi (es. notion.so/ai): arrivano solo dallo scanner, con host e percorso
        const [ph, pp] = pat.split("/");
        if ((d === ph || d.endsWith("." + ph)) && path.startsWith(pp)) return s;
        continue;
      }
      if (d === pat || d.endsWith("." + pat) || (pat.startsWith("bedrock") && d.includes(pat))) return s;
    }
  }
  return null;
}

export function matchApp(app: string): AiService | null {
  const a = app.toLowerCase();
  const exact = AI_SERVICES.find((s) => s.apps?.some((x) => a === x.toLowerCase()));
  return exact ?? AI_SERVICES.find((s) => s.apps?.some((x) => a.startsWith(x.toLowerCase() + "-") || a.startsWith(x.toLowerCase() + "."))) ?? null;
}

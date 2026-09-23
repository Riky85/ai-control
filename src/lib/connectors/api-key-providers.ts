/**
 * Connettori "a chiave API" per i provider di modelli.
 *
 * Funzionano con una chiave API NORMALE (quella che uno sviluppatore ha
 * già): la chiave viene verificata con una chiamata di sola lettura
 * (l'elenco dei modelli) e il risultato registra che l'azienda usa quel
 * provider, con quali modelli disponibili. Utenti e costi richiedono
 * invece una chiave Admin (solo Anthropic/OpenAI, gestita dai connettori
 * dedicati anthropic.ts / openai.ts).
 */
import type { ConnectorProvider } from "@prisma/client";
import type { Connector, ConnectorSyncResult } from "./types";
import { decryptJson } from "@/lib/crypto";

interface ProviderCfg {
  label: string;
  vendor: string;
  url: string;
  headers: (key: string) => Record<string, string>;
  /** Estrae i nomi dei modelli dalla risposta (o, per OpenRouter, info sulla chiave). */
  models: (json: any) => string[];
}

const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });
const ids = (json: any): string[] => {
  const list = Array.isArray(json) ? json : json?.data ?? json?.models ?? [];
  return (list as any[]).map((m) => String(m?.id ?? m?.name ?? "").replace(/^models\//, "")).filter(Boolean);
};

export const API_KEY_PROVIDERS: Partial<Record<ConnectorProvider, ProviderCfg>> = {
  ANTHROPIC: { label: "Anthropic", vendor: "Anthropic", url: "https://api.anthropic.com/v1/models?limit=100", headers: (k) => ({ "x-api-key": k, "anthropic-version": "2023-06-01" }), models: ids },
  OPENAI: { label: "OpenAI", vendor: "OpenAI", url: "https://api.openai.com/v1/models", headers: bearer, models: ids },
  GOOGLE_GEMINI: { label: "Google Gemini", vendor: "Google", url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", headers: (k) => ({ "x-goog-api-key": k }), models: ids },
  MISTRAL: { label: "Mistral AI", vendor: "Mistral", url: "https://api.mistral.ai/v1/models", headers: bearer, models: ids },
  GROQ: { label: "Groq", vendor: "Groq", url: "https://api.groq.com/openai/v1/models", headers: bearer, models: ids },
  COHERE: { label: "Cohere", vendor: "Cohere", url: "https://api.cohere.com/v1/models?page_size=100", headers: bearer, models: ids },
  DEEPSEEK: { label: "DeepSeek", vendor: "DeepSeek", url: "https://api.deepseek.com/models", headers: bearer, models: ids },
  XAI: { label: "xAI (Grok)", vendor: "xAI", url: "https://api.x.ai/v1/models", headers: bearer, models: ids },
  TOGETHER: { label: "Together AI", vendor: "Together AI", url: "https://api.together.xyz/v1/models", headers: bearer, models: ids },
  OPENROUTER: {
    label: "OpenRouter",
    vendor: "OpenRouter",
    url: "https://openrouter.ai/api/v1/key",
    headers: bearer,
    models: (j) => [j?.data?.label ? `key: ${j.data.label}` : "key verified"],
  },
  HUGGINGFACE: { label: "Hugging Face", vendor: "Hugging Face", url: "https://huggingface.co/api/whoami-v2", headers: bearer, models: (j) => [j?.name ? `account: ${j.name}` : "account verified"] },
};

/** Prefissi delle chiavi Admin: con queste usiamo i connettori completi (utenti). */
export function isAdminKey(provider: ConnectorProvider, key: string) {
  if (provider === "ANTHROPIC") return key.startsWith("sk-ant-admin");
  if (provider === "OPENAI") return key.startsWith("sk-admin");
  return false;
}

/** Prova la chiave con una chiamata di sola lettura. Errore in linguaggio semplice. */
export async function testApiKey(provider: ConnectorProvider, key: string): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  const cfg = API_KEY_PROVIDERS[provider];
  if (!cfg) return { ok: false, error: "This provider can't be connected with a key yet." };
  try {
    const res = await fetch(cfg.url, { headers: cfg.headers(key), cache: "no-store" });
    if (res.status === 401 || res.status === 403) return { ok: false, error: `${cfg.label} rejected this key (${res.status}). Check you copied the whole key and that it hasn't been revoked.` };
    if (!res.ok) return { ok: false, error: `${cfg.label} answered ${res.status}: ${(await res.text()).slice(0, 160)}` };
    return { ok: true, models: cfg.models(await res.json()) };
  } catch (err) {
    return { ok: false, error: `Couldn't reach ${cfg.label}: ${(err as Error).message}` };
  }
}

export function apiKeyConnector(provider: ConnectorProvider): Connector {
  return {
    provider,
    async sync(row): Promise<ConnectorSyncResult> {
      const cfg = API_KEY_PROVIDERS[provider]!;
      const key = decryptJson<{ apiKey: string }>(row.credentialsEncrypted)?.apiKey;
      if (!key) throw new Error(`${cfg.label}: no key saved — reconnect it.`);
      const test = await testApiKey(provider, key);
      if (!test.ok) throw new Error(test.error);
      const now = new Date();
      return {
        provider,
        syncedAt: now,
        warnings: ["Connected with a standard key: shows that you use this provider and which models are available. Users and costs need an Admin key."],
        assets: [
          {
            externalId: `${provider.toLowerCase()}:api`,
            type: "AI_API",
            name: `${cfg.label} API`,
            vendor: cfg.vendor,
            model: test.models.slice(0, 3).join(", ") || undefined,
            activities: [{ eventType: "api_key.verified", occurredAt: now, payload: { modelsAvailable: test.models.length, sample: test.models.slice(0, 10) } }],
          },
        ],
      };
    },
  };
}

/**
 * angar Gateway — provider a valle: base URL, controllo dell'URL scelto
 * dall'admin (https, niente rete privata) e intestazioni da inoltrare.
 * Solo codice lato server.
 */
import { isIP } from "net";
import { privateIp } from "@/lib/webhooks";
import type { GatewayProvider } from "./usage";

export const DEFAULT_BASE: Record<GatewayProvider, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
};

export const PROVIDER_LABEL: Record<GatewayProvider, string> = { openai: "OpenAI", anthropic: "Anthropic" };

/**
 * Controllo statico del base URL scelto dall'admin: https, nessuna credenziale,
 * nessun host interno o IP privato. Il nome viene anche risolto prima di ogni
 * inoltro (vedi proxy.ts) contro il DNS rebinding di base.
 */
export function checkUpstreamUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "That isn't a valid URL." };
  }
  if (u.protocol !== "https:") return { ok: false, error: "The endpoint must start with https://." };
  if (u.username || u.password) return { ok: false, error: "Don't put credentials in the URL — paste the key in its own field." };
  if (u.search || u.hash) return { ok: false, error: "Leave out query strings and fragments." };
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || !host.includes(".") || /\.(local|internal|localhost|lan|home|corp|intranet)$/.test(host) || host.endsWith(".railway.internal")) return { ok: false, error: "Internal hosts aren't allowed." };
  if (isIP(host) && privateIp(host)) return { ok: false, error: "Private IP addresses aren't allowed." };
  if (u.port && !["443", "8443"].includes(u.port)) return { ok: false, error: "Use the standard https port (443 or 8443)." };
  const url = u.toString().replace(/\/+$/, "");
  if (url.length > 300) return { ok: false, error: "The URL is too long." };
  return { ok: true, url };
}

/**
 * Solo per i test end-to-end locali: GATEWAY_TEST_UPSTREAM_<PROVIDER> sostituisce
 * il base URL (anche http://127.0.0.1). Ignorato in produzione.
 */
export function testOverride(provider: GatewayProvider): string | null {
  if (process.env.NODE_ENV === "production") return null;
  return process.env[`GATEWAY_TEST_UPSTREAM_${provider.toUpperCase()}`] ?? null;
}

const isAzure = (base: string) => /\.(openai\.azure\.com|services\.ai\.azure\.com|cognitiveservices\.azure\.com)$/i.test(new URL(base).hostname);

/**
 * Intestazioni verso il provider. Mai l'Authorization del client: solo la
 * chiave del provider salvata dall'admin, più le intestazioni di protocollo utili.
 */
export function upstreamHeaders(provider: GatewayProvider, base: string, apiKey: string, incoming: Headers): Headers {
  const h = new Headers({ "content-type": "application/json", accept: incoming.get("accept") ?? "application/json" });
  if (provider === "anthropic") {
    h.set("x-api-key", apiKey);
    h.set("anthropic-version", incoming.get("anthropic-version") ?? "2023-06-01");
    const beta = incoming.get("anthropic-beta");
    if (beta) h.set("anthropic-beta", beta);
  } else if (isAzure(base)) {
    h.set("api-key", apiKey);
  } else {
    h.set("authorization", `Bearer ${apiKey}`);
  }
  return h;
}

/** Intestazioni della risposta del provider che si possono girare al client. */
export const PASS_RESPONSE_HEADERS = ["content-type", "x-request-id", "request-id", "openai-processing-ms", "retry-after", "anthropic-ratelimit-requests-remaining", "x-ratelimit-remaining-requests", "x-ratelimit-remaining-tokens"];

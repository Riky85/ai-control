/**
 * Webhook in uscita: angar invia eventi (JSON) agli URL configurati
 * dall'azienda, firmati con HMAC-SHA256.
 *
 * Header:
 *   X-Angar-Event: ai.discovered
 *   X-Angar-Timestamp: 1759050000            (unix secondi)
 *   X-Angar-Signature: sha256=<hex>          HMAC-SHA256(secret, `${timestamp}.${body}`)
 *
 * Invio "spara e dimentica": mai bloccante per chi chiama, timeout 5 s, e
 * solo verso URL https pubblici (niente IP privati / rete interna).
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";

export const WEBHOOK_EVENTS = [
  { id: "ai.discovered", label: "New AI discovered" },
  { id: "alert.created", label: "Alert created" },
  { id: "renewal.upcoming", label: "Renewal in the next 14 days" },
  { id: "savings.verified", label: "Saving verified" },
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["id"] | "test";
export const isWebhookEvent = (e: string): e is (typeof WEBHOOK_EVENTS)[number]["id"] => WEBHOOK_EVENTS.some((x) => x.id === e);

export const MAX_WEBHOOKS = 10;
const TIMEOUT_MS = 5000;

export const newWebhookSecret = () => "whsec_" + randomBytes(24).toString("base64url");

export function signWebhook(secret: string, timestamp: number, body: string) {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Per chi riceve (e per i test): verifica firma e finestra di 5 minuti. */
export function verifyWebhookSignature(secret: string, timestamp: number, body: string, signature: string, now = Date.now()) {
  if (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > 300) return false;
  const a = Buffer.from(signWebhook(secret, timestamp, body));
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    return mapped ? privateIp(mapped[1]) : false;
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

/** Controllo statico dell'URL (al salvataggio): https, niente host interni. */
export function checkWebhookUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "That isn't a valid URL." };
  }
  if (u.protocol !== "https:") return { ok: false, error: "The webhook URL must start with https://." };
  if (u.username || u.password) return { ok: false, error: "Don't put credentials in the URL — use the signing secret." };
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || /\.(local|internal|localhost|lan|home|corp)$/.test(host) || host.endsWith(".railway.internal")) return { ok: false, error: "Internal hosts aren't allowed." };
  if (isIP(host) && privateIp(host)) return { ok: false, error: "Private IP addresses aren't allowed." };
  if (u.port && !["443", "8443"].includes(u.port)) return { ok: false, error: "Use the standard https port (443 or 8443)." };
  if (u.toString().length > 500) return { ok: false, error: "The URL is too long." };
  return { ok: true, url: u.toString() };
}

/** Al momento dell'invio: il nome deve risolvere solo a IP pubblici (anti DNS rebinding di base). */
async function resolvesPublic(url: string) {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return !privateIp(host);
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !privateIp(a.address));
  } catch {
    return false;
  }
}

type WebhookRow = { id: string; url: string; secretEncrypted: string };

/** Un invio. Restituisce lo stato registrato ("200", "timeout", "blocked"…). */
export async function deliver(hook: WebhookRow, organizationId: string, event: WebhookEvent, data: unknown): Promise<string> {
  const secret = decryptJson<{ secret: string }>(hook.secretEncrypted)?.secret;
  let status: string;
  if (!secret) status = "no secret";
  else if (!checkWebhookUrl(hook.url).ok || !(await resolvesPublic(hook.url))) status = "blocked: not a public https URL";
  else {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ id: "evt_" + randomBytes(12).toString("hex"), event, createdAt: new Date().toISOString(), organizationId, data });
    try {
      const r = await fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "angar-webhooks/1", "X-Angar-Event": event, "X-Angar-Timestamp": String(timestamp), "X-Angar-Signature": signWebhook(secret, timestamp, body) },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      status = String(r.status);
    } catch (err) {
      status = (err as Error).name === "TimeoutError" ? "timeout" : "error: " + (err as Error).message.slice(0, 80);
    }
  }
  await db.webhook.update({ where: { id: hook.id }, data: { lastStatus: status.slice(0, 120), lastSentAt: new Date() } }).catch(() => {});
  return status;
}

/**
 * Invia un evento a tutti i webhook attivi dell'azienda iscritti a quell'evento.
 * Spara e dimentica: non attende e non lancia mai errori.
 */
export function emitWebhook(organizationId: string, event: Exclude<WebhookEvent, "test">, data: unknown): void {
  void (async () => {
    const hooks = await db.webhook.findMany({ where: { organizationId, active: true, events: { has: event } }, select: { id: true, url: true, secretEncrypted: true }, take: MAX_WEBHOOKS });
    await Promise.allSettled(hooks.map((h) => deliver(h, organizationId, event, data)));
  })().catch((err) => console.error("[webhooks] emit failed", err));
}

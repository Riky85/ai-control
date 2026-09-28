/**
 * Chiavi dell'API pubblica (sola lettura, /api/v1/*). La chiave "angk_…" si
 * vede una volta sola: nel database solo l'hash SHA-256 e un suggerimento.
 * Ogni richiesta è limitata (per chiave e per IP) e vale solo per l'azienda
 * della chiave.
 */
import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, retryAfter, clientIp } from "@/lib/rate-limit";
import { orgPrivacyMode, type PrivacyMode } from "@/lib/privacy";

export const API_KEY_PREFIX = "angk_";
export const API_SCOPES = ["read"] as const;
const LIMIT = 120; // richieste al minuto per chiave
const WINDOW = 60_000;

export const hashApiKey = (k: string) => createHash("sha256").update(k).digest("hex");

export function newApiKey() {
  const key = API_KEY_PREFIX + randomBytes(24).toString("base64url");
  return { key, hash: hashApiKey(key), hint: key.slice(0, 9) + "…" + key.slice(-4) };
}

export interface ApiContext {
  orgId: string;
  keyId: string;
  mode: PrivacyMode;
}

const json = (status: number, body: unknown, headers?: Record<string, string>) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/**
 * Autentica una richiesta API: Bearer angk_… → azienda. Restituisce il
 * contesto oppure la risposta d'errore già pronta (401 / 429).
 */
export async function authenticateApi(req: Request, scope: (typeof API_SCOPES)[number] = "read"): Promise<ApiContext | NextResponse> {
  const ip = clientIp(req.headers);
  if (!rateLimit(`api-ip:${ip}`, 600, WINDOW)) return json(429, { error: "Too many requests" }, { "Retry-After": String(retryAfter(600, WINDOW)) });
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(angk_[A-Za-z0-9_-]{20,64})$/.exec(auth.trim());
  if (!m) {
    // Tentativi senza chiave valida: limite più stretto per IP.
    if (!rateLimit(`api-bad:${ip}`, 30, WINDOW)) return json(429, { error: "Too many requests" }, { "Retry-After": "60" });
    return json(401, { error: "Missing or malformed API key. Send: Authorization: Bearer angk_…" });
  }
  const row = await db.apiKey.findUnique({ where: { keyHash: hashApiKey(m[1]) } });
  if (!row || row.revokedAt) {
    if (!rateLimit(`api-bad:${ip}`, 30, WINDOW)) return json(429, { error: "Too many requests" }, { "Retry-After": "60" });
    return json(401, { error: "Invalid or revoked API key" });
  }
  if (!row.scopes.includes(scope)) return json(403, { error: `This key has no "${scope}" scope` });
  if (!rateLimit(`api-key:${row.id}`, LIMIT, WINDOW)) return json(429, { error: `Rate limit: ${LIMIT} requests per minute` }, { "Retry-After": String(retryAfter(LIMIT, WINDOW)) });
  // lastUsedAt al massimo una volta al minuto (niente scrittura a ogni richiesta).
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > WINDOW) {
    void db.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { orgId: row.organizationId, keyId: row.id, mode: await orgPrivacyMode(row.organizationId) };
}

export const apiJson = (body: unknown) => json(200, body);

/**
 * angar Gateway — chiavi virtuali "agk_…" (pure). Nel database solo l'hash
 * SHA-256 e le ultime 4 cifre; la chiave intera si vede una volta sola.
 */
import { createHash, randomBytes } from "crypto";

export const GATEWAY_KEY_PREFIX = "agk_";
const KEY_RE = /^agk_[A-Za-z0-9_-]{32,64}$/;

export const hashGatewayKey = (k: string) => createHash("sha256").update(k).digest("hex");

export function newGatewayKey() {
  const key = GATEWAY_KEY_PREFIX + randomBytes(30).toString("base64url");
  return { key, hash: hashGatewayKey(key), last4: key.slice(-4) };
}

/** Come si mostra una chiave: agk_…9c02 */
export const keyHint = (last4: string) => `agk_…${last4}`;

/**
 * Chiave dalla richiesta: "Authorization: Bearer agk_…" (SDK OpenAI) oppure
 * "x-api-key: agk_…" (SDK Anthropic). null se manca o non ha il formato giusto.
 */
export function keyFromHeaders(h: { get(name: string): string | null }): string | null {
  const bearer = /^Bearer\s+(\S+)$/i.exec((h.get("authorization") ?? "").trim())?.[1];
  const candidate = bearer ?? (h.get("x-api-key") ?? "").trim();
  return KEY_RE.test(candidate) ? candidate : null;
}

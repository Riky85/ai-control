/**
 * Token di sessione firmato (HMAC-SHA256 via Web Crypto): funziona sia nel
 * middleware (edge) sia sul server. Dentro ci sono account, workspace
 * corrente e ruolo — il workspace NON viene più da un cookie modificabile.
 */
export const SESSION_COOKIE = "angar_session";
export const SESSION_DAYS = 7;

export interface SessionPayload {
  a: string; // account id
  e: string; // email
  n?: string; // nome
  o: string; // organization id corrente
  r: string; // ruolo nel workspace corrente
  x: number; // scadenza (unix secondi)
}

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));

async function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET missing or too short");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(p: Omit<SessionPayload, "x">, days = SESSION_DAYS): Promise<string> {
  const payload: SessionPayload = { ...p, x: Math.floor(Date.now() / 1000) + days * 86400 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await key(), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    return payload.x > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

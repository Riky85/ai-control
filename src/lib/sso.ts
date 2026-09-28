import { createHash, createPublicKey, createVerify, randomBytes, type JsonWebKey } from "node:crypto";

/**
 * Accesso con Microsoft (Entra ID, multi-tenant) e Google: OpenID Connect,
 * authorization code + PKCE. L'id_token si verifica qui (firma RS256 con le
 * chiavi JWKS del provider, issuer, audience, nonce, scadenza) — nessuna dipendenza.
 */
export type SsoProvider = "microsoft" | "google";

/** Cookie firmato (10 min) con state, nonce e verifier PKCE tra /start e /callback. */
export const SSO_COOKIE = "angar_sso";
export const SSO_COOKIE_PATH = "/api/auth/sso";

interface ProviderConfig {
  id: SsoProvider;
  label: string;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  jwksUrl: string;
}

// Le variabili AUTH_* hanno la precedenza; altrimenti si riusano le app già
// registrate per i connettori (servono però i redirect URI di login).
function cfg(id: SsoProvider): ProviderConfig | null {
  if (id === "microsoft") {
    const clientId = process.env.AUTH_MICROSOFT_CLIENT_ID || process.env.MS365_CLIENT_ID;
    const clientSecret = process.env.AUTH_MICROSOFT_CLIENT_ID ? process.env.AUTH_MICROSOFT_CLIENT_SECRET : process.env.MS365_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    // "organizations" = solo account di lavoro/scuola di qualsiasi tenant.
    const tenant = process.env.AUTH_MICROSOFT_TENANT || "organizations";
    return {
      id,
      label: "Microsoft",
      clientId,
      clientSecret,
      authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      jwksUrl: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
    };
  }
  const clientId = process.env.AUTH_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.AUTH_GOOGLE_CLIENT_ID ? process.env.AUTH_GOOGLE_CLIENT_SECRET : process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    id,
    label: "Google",
    clientId,
    clientSecret,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
  };
}

export const ssoProvider = (id: string): ProviderConfig | null => (id === "microsoft" || id === "google" ? cfg(id) : null);

/** Quali pulsanti mostrare (solo i provider configurati). */
export function ssoAvailable(): { microsoft: boolean; google: boolean } {
  return { microsoft: Boolean(cfg("microsoft")), google: Boolean(cfg("google")) };
}

export const ssoCallbackUrl = (origin: string, id: SsoProvider) => `${origin}/api/auth/sso/${id}/callback`;

const b64url = (b: Buffer) => b.toString("base64url");

export function newPkce() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export const randomToken = () => b64url(randomBytes(24));

export function authorizeUrl(p: ProviderConfig, opts: { redirectUri: string; state: string; nonce: string; challenge: string; loginHint?: string }) {
  const url = new URL(p.authorizeUrl);
  url.searchParams.set("client_id", p.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", opts.state);
  url.searchParams.set("nonce", opts.nonce);
  url.searchParams.set("code_challenge", opts.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (p.id === "microsoft") url.searchParams.set("response_mode", "query");
  if (p.id === "google") url.searchParams.set("prompt", "select_account");
  if (opts.loginHint) url.searchParams.set("login_hint", opts.loginHint);
  return url.toString();
}

/** Scambia il codice con i token (con il verifier PKCE) e restituisce l'id_token. */
export async function exchangeCode(p: ProviderConfig, code: string, verifier: string, redirectUri: string): Promise<string> {
  const res = await fetch(p.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: p.clientId,
      client_secret: p.clientSecret,
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new SsoError(`${p.label} didn't accept the sign-in (${res.status}).`);
  const tok = (await res.json()) as { id_token?: string };
  if (!tok.id_token) throw new SsoError(`${p.label} didn't return an identity token.`);
  return tok.id_token;
}

export class SsoError extends Error {}

// ── JWKS (cache 1 ora; se il kid non c'è si ricarica una volta) ──
type Jwk = JsonWebKey & { kid?: string; kty?: string; alg?: string; use?: string };
const jwksCache = new Map<string, { at: number; keys: Jwk[] }>();

async function jwks(url: string, force = false): Promise<Jwk[]> {
  const hit = jwksCache.get(url);
  if (!force && hit && Date.now() - hit.at < 3_600_000) return hit.keys;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new SsoError("Couldn't load the provider's signing keys — try again.");
  const keys = ((await res.json()) as { keys?: Jwk[] }).keys ?? [];
  jwksCache.set(url, { at: Date.now(), keys });
  return keys;
}

const decodePart = <T>(s: string): T => JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as T;

export interface IdClaims {
  iss: string;
  aud: string | string[];
  exp: number;
  iat?: number;
  nbf?: number;
  nonce?: string;
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  tid?: string;
  xms_edov?: boolean | string;
  verified_primary_email?: string[];
}

/** Verifica firma RS256 e claim standard; lancia SsoError se qualcosa non torna. */
export async function verifyIdToken(p: ProviderConfig, idToken: string, nonce: string, nowSec = Math.floor(Date.now() / 1000)): Promise<IdClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new SsoError("Malformed identity token.");
  const header = decodePart<{ alg?: string; kid?: string }>(parts[0]);
  if (header.alg !== "RS256" || !header.kid) throw new SsoError("Unsupported identity token.");
  let jwk = (await jwks(p.jwksUrl)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await jwks(p.jwksUrl, true)).find((k) => k.kid === header.kid);
  if (!jwk || jwk.kty !== "RSA") throw new SsoError("Unknown signing key on the identity token.");
  const key = createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e } as JsonWebKey, format: "jwk" });
  const ok = createVerify("RSA-SHA256").update(`${parts[0]}.${parts[1]}`).verify(key, Buffer.from(parts[2], "base64url"));
  if (!ok) throw new SsoError("The identity token's signature is invalid.");

  const c = decodePart<IdClaims>(parts[1]);
  const skew = 300;
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(p.clientId)) throw new SsoError("The identity token wasn't issued for angar.");
  if (typeof c.exp !== "number" || c.exp + skew < nowSec) throw new SsoError("The identity token has expired — try again.");
  if (typeof c.nbf === "number" && c.nbf - skew > nowSec) throw new SsoError("The identity token isn't valid yet.");
  if (!nonce || c.nonce !== nonce) throw new SsoError("The sign-in didn't match this browser — try again.");
  if (p.id === "google") {
    if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") throw new SsoError("Unexpected token issuer.");
  } else {
    // Multi-tenant: l'issuer deve essere quello del tenant indicato nel token stesso.
    if (!c.tid || !/^[0-9a-f-]{36}$/i.test(c.tid) || c.iss !== `https://login.microsoftonline.com/${c.tid}/v2.0`) throw new SsoError("Unexpected token issuer.");
  }
  return c;
}

/**
 * Email di cui il provider garantisce il possesso, o null.
 * Google: email_verified. Microsoft: il claim email (le app registrate dopo
 * giugno 2023 lo ricevono solo per domini verificati dal tenant) — rifiutato
 * se xms_edov dice esplicitamente il contrario; in alternativa verified_primary_email.
 */
export function verifiedEmail(p: ProviderConfig, c: IdClaims): string | null {
  const norm = (e?: string) => (e && e.includes("@") ? e.trim().toLowerCase() : null);
  if (p.id === "google") return c.email_verified === true || c.email_verified === "true" ? norm(c.email) : null;
  if (Array.isArray(c.verified_primary_email) && c.verified_primary_email.length) return norm(c.verified_primary_email[0]);
  if (c.xms_edov === false || c.xms_edov === "false" || c.xms_edov === "0") return null;
  return norm(c.email);
}

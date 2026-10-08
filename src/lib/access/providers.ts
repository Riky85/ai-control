/**
 * Lettura e revoca dei consensi OAuth delle app di terze parti.
 *
 * Microsoft 365: token applicativo (client credentials) dell'app di angar sul tenant del cliente.
 *   Lettura: GET /oauth2PermissionGrants e /servicePrincipals/{id} — serve Directory.Read.All
 *   (o DelegatedPermissionGrant.Read.All). Revoca: DELETE /oauth2PermissionGrants/{id} — serve
 *   DelegatedPermissionGrant.ReadWrite.All (o Directory.ReadWrite.All). I permessi si leggono dal
 *   claim "roles" del token: niente tentativi alla cieca.
 * Google Workspace: refresh token dell'amministratore. Lettura e revoca con Admin SDK Directory
 *   users.tokens (scope admin.directory.user.security); lo scope concesso si legge da tokeninfo.
 *
 * Ogni chiamata ha un timeout; i token non finiscono mai nei log né negli errori.
 */
import { decryptJson } from "@/lib/crypto";
import type { FetchedGrant, GrantCapability, GrantProvider } from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TIMEOUT_MS = 12_000;
/** Tenant di Microsoft: le sue app (Teams, Outlook…) non sono "di terze parti". */
const MICROSOFT_TENANTS = new Set(["f8cdef31-a31e-4b4a-93e4-5f571e91255a", "72f988bf-86f1-41af-91ab-2d7cd011db47"]);
export const GOOGLE_SECURITY_SCOPE = "https://www.googleapis.com/auth/admin.directory.user.security";
const MS_READ_ROLES = ["Directory.Read.All", "Directory.ReadWrite.All", "DelegatedPermissionGrant.Read.All", "DelegatedPermissionGrant.ReadWrite.All"];
const MS_REVOKE_ROLES = ["DelegatedPermissionGrant.ReadWrite.All", "Directory.ReadWrite.All"];
const MAX_APPS = 300;
const MAX_USERS = 2000;

class ProviderError extends Error {}

/** Messaggio sicuro (mai token, mai corpo completo della risposta). */
const safeMsg = (err: unknown) => {
  const e = err as Error;
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "No answer in time.";
  return e instanceof ProviderError ? e.message : "Network error.";
};

async function getJson(url: string, token: string, init: { method?: string } = {}) {
  const r = await fetch(url, { method: init.method ?? "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual" });
  if (r.status === 204) return null;
  const text = await r.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!r.ok) {
    const msg = json?.error?.message ?? json?.error_description ?? (typeof json?.error === "string" ? json.error : "");
    throw new ProviderError(`${r.status}${msg ? ` ${String(msg).slice(0, 140)}` : ""}`);
  }
  return json;
}

/** Esegue fn su ogni elemento con al massimo `n` chiamate in parallelo. */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

// ── Microsoft 365 ──────────────────────────────────────────────────────────

async function msAppToken(credentialsEncrypted: string | null): Promise<{ token: string; roles: string[] }> {
  const tenantId = decryptJson<{ tenantId?: string }>(credentialsEncrypted)?.tenantId ?? process.env.MS365_TENANT_ID;
  if (!tenantId) throw new ProviderError("Microsoft 365 isn't connected.");
  if (!process.env.MS365_CLIENT_ID || !process.env.MS365_CLIENT_SECRET) throw new ProviderError("Microsoft 365 isn't available on this deployment.");
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.MS365_CLIENT_ID, client_secret: process.env.MS365_CLIENT_SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new ProviderError(`Microsoft sign-in failed (${r.status}) — reconnect Microsoft 365.`);
  const token = ((await r.json()) as { access_token?: string }).access_token;
  if (!token) throw new ProviderError("Microsoft didn't return a token.");
  let roles: string[] = [];
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { roles?: unknown };
    roles = Array.isArray(payload.roles) ? payload.roles.map(String) : [];
  } catch {
    roles = [];
  }
  return { token, roles };
}

function msCapability(roles: string[]): GrantCapability {
  const canRead = roles.some((r) => MS_READ_ROLES.includes(r));
  const canRevoke = roles.some((r) => MS_REVOKE_ROLES.includes(r));
  return {
    connected: true,
    canRead,
    canRevoke,
    readWhy: canRead ? undefined : "Angar's Microsoft app needs the Directory.Read.All permission — reconnect Microsoft 365 to grant access to app permissions.",
    revokeWhy: canRevoke ? undefined : "Revoking needs the DelegatedPermissionGrant.ReadWrite.All permission — reconnect Microsoft 365 after it's added to Angar's app.",
  };
}

async function msAll(token: string, path: string, maxPages = 20) {
  const out: any[] = [];
  let next: string | undefined = `${GRAPH}${path}`;
  for (let i = 0; next && i < maxPages; i++) {
    const page: any = await getJson(next, token);
    out.push(...(page?.value ?? []));
    next = page?.["@odata.nextLink"];
    if (next && !next.startsWith("https://graph.microsoft.com/")) next = undefined;
  }
  return out;
}

async function msFetch(credentialsEncrypted: string | null, withEmails: boolean): Promise<FetchedGrant[]> {
  const { token, roles } = await msAppToken(credentialsEncrypted);
  if (!msCapability(roles).canRead) throw new ProviderError("Missing Directory.Read.All permission.");
  const grants = await msAll(token, "/oauth2PermissionGrants?$top=999");
  const byClient = new Map<string, { scopes: Set<string>; principals: Set<string>; all: boolean }>();
  for (const g of grants) {
    if (!g?.clientId) continue;
    let e = byClient.get(g.clientId);
    if (!e) byClient.set(g.clientId, (e = { scopes: new Set(), principals: new Set(), all: false }));
    for (const s of String(g.scope ?? "").split(/\s+/).filter(Boolean)) e.scopes.add(s);
    if (g.consentType === "AllPrincipals") e.all = true;
    else if (g.principalId) e.principals.add(g.principalId);
  }
  const ids = Array.from(byClient.keys()).slice(0, MAX_APPS);
  const sps = await pool(ids, 8, async (id) => {
    try {
      return await getJson(`${GRAPH}/servicePrincipals/${encodeURIComponent(id)}?$select=id,appId,displayName,publisherName,appOwnerOrganizationId,verifiedPublisher`, token);
    } catch {
      return null;
    }
  });
  const own = process.env.MS365_CLIENT_ID;
  const emails = new Map<string, string | null>();
  const out: FetchedGrant[] = [];
  for (const sp of sps) {
    if (!sp?.id) continue;
    if (sp.appOwnerOrganizationId && MICROSOFT_TENANTS.has(String(sp.appOwnerOrganizationId))) continue;
    if (own && sp.appId === own) continue;
    const e = byClient.get(sp.id)!;
    out.push({
      appId: sp.id,
      appName: String(sp.displayName ?? "Unnamed app").slice(0, 200),
      publisher: (sp.verifiedPublisher?.displayName ?? sp.publisherName ?? null)?.slice(0, 200) ?? null,
      scopes: Array.from(e.scopes).slice(0, 100),
      userCount: e.principals.size,
      userRefs: withEmails ? Array.from(e.principals).slice(0, 500) : [],
      adminConsent: e.all,
    });
  }
  // Id delle persone → email (solo se servono: privacy "per persona"), con un tetto alle letture.
  if (withEmails) {
    const all = Array.from(new Set(out.flatMap((g) => g.userRefs))).slice(0, MAX_USERS);
    await pool(all, 8, async (id) => {
      try {
        const u = await getJson(`${GRAPH}/users/${encodeURIComponent(id)}?$select=mail,userPrincipalName`, token);
        emails.set(id, String(u?.mail ?? u?.userPrincipalName ?? "").toLowerCase() || null);
      } catch {
        emails.set(id, null);
      }
    });
    for (const g of out) g.userRefs = g.userRefs.map((id) => emails.get(id)).filter((x): x is string => !!x && x.includes("@"));
  }
  return out;
}

async function msRevoke(credentialsEncrypted: string | null, appId: string): Promise<{ removed: number }> {
  const { token, roles } = await msAppToken(credentialsEncrypted);
  if (!msCapability(roles).canRevoke) throw new ProviderError("Missing DelegatedPermissionGrant.ReadWrite.All permission.");
  const grants = await msAll(token, `/servicePrincipals/${encodeURIComponent(appId)}/oauth2PermissionGrants`, 10);
  let removed = 0;
  for (const g of grants) {
    if (!g?.id) continue;
    try {
      await getJson(`${GRAPH}/oauth2PermissionGrants/${encodeURIComponent(g.id)}`, token, { method: "DELETE" });
      removed++;
    } catch (err) {
      if (!(err instanceof ProviderError && err.message.startsWith("404"))) throw err;
    }
  }
  return { removed };
}

// ── Google Workspace ───────────────────────────────────────────────────────

async function googleToken(credentialsEncrypted: string | null): Promise<string> {
  const refresh = decryptJson<{ refreshToken?: string }>(credentialsEncrypted)?.refreshToken;
  if (!refresh) throw new ProviderError("Google Workspace isn't connected.");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", refresh_token: refresh, grant_type: "refresh_token" }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new ProviderError(`Google sign-in failed (${r.status}) — reconnect Google Workspace.`);
  const token = ((await r.json()) as { access_token?: string }).access_token;
  if (!token) throw new ProviderError("Google didn't return a token.");
  return token;
}

async function googleScopes(token: string): Promise<string[]> {
  // Token nel corpo (POST), mai nell'URL.
  const r = await fetch("https://oauth2.googleapis.com/tokeninfo", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: token }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) return [];
  return String(((await r.json()) as { scope?: string }).scope ?? "").split(/\s+/).filter(Boolean);
}

function googleCapability(scopes: string[]): GrantCapability {
  const ok = scopes.includes(GOOGLE_SECURITY_SCOPE);
  const why = "Reconnect Google Workspace to grant access to app permissions (a super admin approves the new permission).";
  return { connected: true, canRead: ok, canRevoke: ok, readWhy: ok ? undefined : why, revokeWhy: ok ? undefined : why };
}

const ADMIN = "https://admin.googleapis.com/admin/directory/v1";

async function googleUsers(token: string): Promise<string[]> {
  const out: string[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 10 && out.length < MAX_USERS; i++) {
    const u = new URL(`${ADMIN}/users`);
    u.searchParams.set("customer", "my_customer");
    u.searchParams.set("maxResults", "500");
    u.searchParams.set("fields", "users(primaryEmail,suspended),nextPageToken");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const j: any = await getJson(u.toString(), token);
    for (const x of j?.users ?? []) if (x?.primaryEmail && !x.suspended) out.push(String(x.primaryEmail).toLowerCase());
    pageToken = j?.nextPageToken;
    if (!pageToken) break;
  }
  return out.slice(0, MAX_USERS);
}

async function googleFetch(credentialsEncrypted: string | null, withEmails: boolean): Promise<FetchedGrant[]> {
  const token = await googleToken(credentialsEncrypted);
  if (!googleCapability(await googleScopes(token)).canRead) throw new ProviderError("Missing the admin.directory.user.security permission.");
  const users = await googleUsers(token);
  const byClient = new Map<string, { name: string; scopes: Set<string>; users: Set<string> }>();
  const started = Date.now();
  await pool(users, 8, async (email) => {
    if (Date.now() - started > 90_000) return; // tetto di tempo: si salva ciò che si è letto
    try {
      const j: any = await getJson(`${ADMIN}/users/${encodeURIComponent(email)}/tokens`, token);
      for (const t of j?.items ?? []) {
        if (!t?.clientId) continue;
        let e = byClient.get(t.clientId);
        if (!e) byClient.set(t.clientId, (e = { name: String(t.displayText ?? t.clientId), scopes: new Set(), users: new Set() }));
        for (const s of t.scopes ?? []) e.scopes.add(String(s));
        e.users.add(email);
      }
    } catch {
      /* utente senza permessi leggibili: si prosegue */
    }
  });
  return Array.from(byClient.entries())
    .slice(0, MAX_APPS)
    .map(([clientId, e]) => ({
      appId: clientId,
      appName: e.name.slice(0, 200),
      publisher: null,
      scopes: Array.from(e.scopes).slice(0, 100),
      userCount: e.users.size,
      userRefs: withEmails ? Array.from(e.users).slice(0, 500) : [],
      adminConsent: false,
    }));
}

async function googleRevoke(credentialsEncrypted: string | null, clientId: string, knownUsers: string[]): Promise<{ removed: number }> {
  const token = await googleToken(credentialsEncrypted);
  if (!googleCapability(await googleScopes(token)).canRevoke) throw new ProviderError("Missing the admin.directory.user.security permission.");
  // Persone note dall'ultima lettura; senza (privacy non "per persona") si provano tutti gli utenti.
  const users = knownUsers.length ? knownUsers : await googleUsers(token);
  let removed = 0;
  await pool(users, 8, async (email) => {
    try {
      await getJson(`${ADMIN}/users/${encodeURIComponent(email)}/tokens/${encodeURIComponent(clientId)}`, token, { method: "DELETE" });
      removed++;
    } catch {
      /* 404: quella persona non aveva dato il consenso */
    }
  });
  return { removed };
}

// ── Interfaccia comune ───────────────────────────────────────────────────

export async function capabilityOf(provider: GrantProvider, credentialsEncrypted: string | null): Promise<GrantCapability> {
  try {
    if (provider === "MICROSOFT_365") return msCapability((await msAppToken(credentialsEncrypted)).roles);
    return googleCapability(await googleScopes(await googleToken(credentialsEncrypted)));
  } catch (err) {
    const why = safeMsg(err);
    return { connected: true, canRead: false, canRevoke: false, readWhy: why, revokeWhy: why };
  }
}

export async function fetchGrants(provider: GrantProvider, credentialsEncrypted: string | null, withEmails: boolean): Promise<{ ok: true; grants: FetchedGrant[] } | { ok: false; error: string }> {
  try {
    const grants = provider === "MICROSOFT_365" ? await msFetch(credentialsEncrypted, withEmails) : await googleFetch(credentialsEncrypted, withEmails);
    return { ok: true, grants };
  } catch (err) {
    return { ok: false, error: safeMsg(err) };
  }
}

export async function revokeGrant(provider: GrantProvider, credentialsEncrypted: string | null, appId: string, knownUsers: string[]): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  try {
    const r = provider === "MICROSOFT_365" ? await msRevoke(credentialsEncrypted, appId) : await googleRevoke(credentialsEncrypted, appId, knownUsers);
    return { ok: true, removed: r.removed };
  } catch (err) {
    return { ok: false, error: safeMsg(err) };
  }
}

/**
 * Okta — per le aziende che usano Okta come identità (invece di Microsoft
 * o Google). Il cliente incolla il dominio Okta e un API token creato da un
 * amministratore in sola lettura (Read-Only Administrator). Con il token legge:
 *  - le app configurate in Okta riconosciute come AI (catalogo angar);
 *  - per ognuna, le persone assegnate;
 *  - dal System Log (ultimi 90 giorni): chi entra in quelle app con l'SSO
 *    e i consensi OAuth dati alle app.
 * Mai password, fattori MFA, gruppi o altri dati del profilo oltre
 * email, nome e reparto (che il layer di upsert filtra secondo la privacy).
 *
 * Il token si salva solo cifrato (crypto.ts). L'app di servizio OAuth
 * (private_key_jwt, scope okta.apps.read okta.users.read okta.logs.read)
 * è prevista più avanti: per ora solo API token (SSWS).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Connector, ConnectorSyncResult, ObservedAsset } from "./types";
import { decryptJson } from "@/lib/crypto";
import { matchMerchant } from "@/lib/pricing/merchants";
import { AI_SERVICES, matchDomain } from "@/lib/discovery/catalog";

const DAY = 86400000;
const HISTORY_DAYS = 90; // il System Log di Okta conserva 90 giorni
const RUN_BUDGET_MS = 4 * 60_000; // come lo storico email
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_APP_PAGES = 25; // 5.000 app
const MAX_ASSIGNED_PAGES = 25; // 5.000 persone assegnate a una singola app
const MAX_LOG_PAGES = 200; // 200.000 eventi
const EVENT_TYPES = ["user.authentication.sso", "app.oauth2.as.consent.grant"] as const;

export interface OktaCredentials {
  mode: "token";
  domain: string;
  apiToken: string;
}

// ── Dominio ────────────────────────────────────────────────────────────

const OKTA_HOSTED = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(okta|oktapreview|okta-emea)\.com$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED_SUFFIX = /(^|\.)(localhost|local|lan|internal|intranet|corp|home\.arpa|test|example|invalid|onion)$/;

/**
 * Dominio Okta → hostname pulito, o null se non valido.
 * Accetta "acme.okta.com", "https://acme.okta.com/", l'indirizzo della console
 * (acme-admin.okta.com) e un dominio personalizzato (es. login.acme.com) con
 * un controllo stretto dell'hostname: niente IP, porte, credenziali o reti locali.
 */
export function normalizeOktaDomain(raw: string): string | null {
  let s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("https://")) s = s.slice(8);
  else if (/^[a-z][a-z0-9+.-]*:\/\//.test(s)) return null; // solo https
  s = s.replace(/[/?#].*$/, "").replace(/\.$/, "");
  if (!s || s.length > 253 || /[@:\s\\]/.test(s) || isIP(s)) return null;
  s = s.replace(/-admin\.(okta|oktapreview|okta-emea)\.com$/, ".$1.com");
  if (OKTA_HOSTED.test(s)) return s;
  // Dominio personalizzato: etichette DNS valide, TLD alfabetico, mai reti locali né Okta senza tenant.
  const labels = s.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null;
  if (!/^[a-z]{2,63}$/.test(labels[labels.length - 1])) return null;
  if (RESERVED_SUFFIX.test(s)) return null;
  if (/(^|\.)(okta|oktapreview|okta-emea|oktacdn)\.com$/.test(s)) return null;
  return s;
}

const isOktaHosted = (host: string) => OKTA_HOSTED.test(host);

/** Indirizzi privati, loopback, link-local: un dominio personalizzato non deve mai portare lì. */
function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
}

async function assertPublicHost(host: string) {
  if (isOktaHosted(host)) return;
  let addrs: { address: string }[] = [];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new OktaError(`Can't find ${host} — check the Okta domain.`);
  }
  if (!addrs.length || addrs.some((a) => privateAddress(a.address))) throw new OktaError(`${host} doesn't point to a public Okta org.`);
}

// ── Client HTTP: timeout, limiti di frequenza, paginazione ─────────────

export class OktaError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}
class BudgetExceeded extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Link header di Okta → URL "next", solo se resta sullo stesso dominio (il token non esce mai). */
export function nextLink(header: string | null, host: string): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (!m) continue;
    try {
      const u = new URL(m[1]);
      return u.protocol === "https:" && u.host === host ? u.toString() : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function oktaClient(domain: string, token: string, deadline: number) {
  const base = `https://${domain}`;
  let pauseUntil = 0;

  async function get(pathOrUrl: string): Promise<{ json: any; next: string | null }> {
    const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${base}${pathOrUrl}`;
    if (new URL(url).host !== domain) throw new OktaError("Okta returned a link to another domain.");
    for (let attempt = 0; attempt < 6; attempt++) {
      // Quota quasi esaurita alla risposta precedente: si aspetta il reset invece di prendere un 429.
      if (pauseUntil > Date.now()) {
        if (pauseUntil > deadline) throw new BudgetExceeded();
        await sleep(pauseUntil - Date.now());
      }
      const left = deadline - Date.now();
      if (left <= 500) throw new BudgetExceeded();
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Authorization: `SSWS ${token}`, Accept: "application/json" },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, left)),
        });
      } catch (err) {
        if (Date.now() >= deadline) throw new BudgetExceeded();
        if (attempt < 2) continue; // errore di rete o timeout: si riprova
        throw new OktaError(`Okta didn't answer (${(err as Error).name === "TimeoutError" ? "timeout" : "network error"}).`);
      }
      const reset = Number(res.headers.get("x-rate-limit-reset")); // secondi epoch
      const remaining = res.headers.get("x-rate-limit-remaining");
      if (res.status === 429) {
        const wait = Number.isFinite(reset) && reset > 0 ? Math.max(1000, reset * 1000 - Date.now() + 250) : 2000 * (attempt + 1);
        if (Date.now() + wait > deadline) throw new BudgetExceeded();
        await sleep(wait);
        continue;
      }
      if (remaining !== null && Number(remaining) <= 1 && Number.isFinite(reset) && reset > 0) pauseUntil = reset * 1000 + 250;
      if (res.status === 401) throw new OktaError("Okta rejected the API token — check you copied all of it and that it hasn't expired or been revoked.", 401);
      if (res.status === 403) throw new OktaError("The API token can't read this — create it while signed in as a Read-Only Administrator.", 403);
      if (res.status >= 500 && attempt < 2) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new OktaError(`Okta ${new URL(url).pathname} → ${res.status} ${(await res.text()).slice(0, 160)}`, res.status);
      return { json: await res.json(), next: nextLink(res.headers.get("link"), domain) };
    }
    throw new OktaError("Okta kept rate-limiting the requests — try again in a few minutes.", 429);
  }

  /** Tutte le pagine (fino a maxPages), una alla volta. */
  async function* pages(path: string, maxPages: number): AsyncGenerator<any[]> {
    let next: string | null = path;
    for (let i = 0; next && i < maxPages; i++) {
      const page: { json: any; next: string | null } = await get(next);
      const items = Array.isArray(page.json) ? page.json : [];
      yield items;
      // Pagina vuota: fine (il System Log può restituire un "next" anche a fine elenco).
      next = items.length ? page.next : null;
    }
  }

  return { get, pages };
}

/** Prova dominio e token prima di salvarli: una lettura delle app, nient'altro. */
export async function testOktaConnection(domain: string, token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertPublicHost(domain);
    const client = oktaClient(domain, token, Date.now() + 30_000);
    const { json } = await client.get("/api/v1/apps?limit=1");
    if (!Array.isArray(json)) return { ok: false, error: `${domain} doesn't look like an Okta org.` };
    return { ok: true };
  } catch (err) {
    if (err instanceof BudgetExceeded) return { ok: false, error: "Okta took too long to answer — try again." };
    return { ok: false, error: (err as Error).message };
  }
}

// ── Riconoscimento delle app AI ────────────────────────────────────────

/** Host dei link di accesso dell'app (URL SAML/OIDC, redirect), esclusi quelli di Okta. */
function appHosts(app: any): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v !== "string" || !/^https?:\/\//i.test(v)) return;
    try {
      const h = new URL(v).hostname.toLowerCase();
      if (!/(^|\.)(okta|oktapreview|okta-emea|oktacdn)\.com$/.test(h)) out.add(h);
    } catch {}
  };
  const walk = (o: unknown, depth: number) => {
    if (depth > 4 || !o) return;
    if (Array.isArray(o)) return o.slice(0, 50).forEach((x) => (typeof x === "string" ? add(x) : walk(x, depth + 1)));
    if (typeof o === "object") for (const v of Object.values(o as Record<string, unknown>)) typeof v === "string" ? add(v) : walk(v, depth + 1);
  };
  walk(app?.settings, 0);
  return [...out];
}

/** Stesso riconoscimento delle app aziendali di Microsoft 365 (nome), più i link di accesso (dominio). */
export function matchOktaApp(app: { label?: string; name?: string; settings?: unknown }): string | null {
  const byName = matchMerchant(`${app.label ?? ""} ${String(app.name ?? "").replace(/_/g, " ")}`);
  if (byName) return byName;
  for (const h of appHosts(app)) {
    const svc = matchDomain(h);
    if (svc) return svc.id;
  }
  return null;
}

// ── Sync ───────────────────────────────────────────────────────────────

const emailOf = (v: unknown) => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
};

export async function oktaSync(creds: OktaCredentials, opts: { lastSyncedAt?: Date | null; budgetMs?: number } = {}): Promise<ConnectorSyncResult> {
  const domain = normalizeOktaDomain(creds.domain);
  if (!domain || !creds.apiToken) throw new Error("Okta isn't connected — add the Okta domain and an API token first.");
  const started = Date.now();
  const deadline = started + (opts.budgetMs ?? RUN_BUDGET_MS);
  const client = oktaClient(domain, creds.apiToken, deadline);
  const warnings: string[] = [];
  const byService = new Map<string, ObservedAsset>();
  const idToService = new Map<string, string>(); // id app Okta o client_id OAuth → servizio
  const appLabel = new Map<string, string>();
  const matchedApps: { id: string; service: string }[] = [];
  const signIns = new Map<string, { service: string; email: string; first: number; last: number; count: number; app: string }>();

  const assetFor = (service: string, fallbackName: string) => {
    let a = byService.get(service);
    if (!a) {
      const svc = AI_SERVICES.find((s) => s.id === service);
      a = { externalId: `okta:${service}`, serviceId: service, type: svc?.type ?? "AI_APPLICATION", name: svc?.name ?? fallbackName, vendor: svc?.vendor, users: [], activities: [], connectedSystems: [{ system: "Okta", detail: "SSO app" }] };
      byService.set(service, a);
    }
    return a;
  };
  const addUser = (a: ObservedAsset, u: { email: string; name?: string; department?: string; externalRef?: string }) => {
    const prev = a.users!.find((x) => x.email === u.email);
    if (!prev) a.users!.push(u);
    else {
      prev.name ??= u.name;
      prev.department ??= u.department;
      prev.externalRef ??= u.externalRef;
    }
  };

  // 1. App configurate in Okta riconosciute come AI.
  try {
    for await (const apps of client.pages("/api/v1/apps?limit=200", MAX_APP_PAGES)) {
      for (const app of apps) {
        if (!app?.id) continue;
        const service = matchOktaApp(app);
        if (!service) continue;
        const label = String(app.label ?? app.name ?? service);
        assetFor(service, label);
        idToService.set(app.id, service);
        appLabel.set(app.id, label);
        const clientId = app.credentials?.oauthClient?.client_id;
        if (clientId) idToService.set(String(clientId), service);
        if (app.status !== "INACTIVE") matchedApps.push({ id: app.id, service });
      }
    }
  } catch (err) {
    if (err instanceof BudgetExceeded) warnings.push("Okta applications only partly read (time limit) — the next sync reads them again.");
    else throw err; // senza l'elenco delle app il sync non ha senso: errore visibile sul connettore
  }

  // 2. Persone assegnate alle app AI (al massimo metà del tempo: poi servono i log).
  const assignDeadline = started + (deadline - started) / 2;
  let assignCut = false;
  for (const { id, service } of matchedApps) {
    if (Date.now() > assignDeadline) {
      assignCut = true;
      break;
    }
    const a = assetFor(service, appLabel.get(id) ?? service);
    try {
      for await (const users of client.pages(`/api/v1/apps/${encodeURIComponent(id)}/users?limit=200&expand=user`, MAX_ASSIGNED_PAGES)) {
        for (const au of users) {
          const p = au?._embedded?.user?.profile ?? {};
          const email = emailOf(p.email) ?? emailOf(p.login) ?? emailOf(au?.credentials?.userName) ?? emailOf(au?.profile?.email);
          if (!email) continue;
          const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || p.displayName || undefined;
          addUser(a, { email, name, department: p.department || undefined, externalRef: au.id });
        }
        if (Date.now() > assignDeadline) break;
      }
    } catch (err) {
      if (err instanceof BudgetExceeded) {
        assignCut = true;
        break;
      }
      warnings.push(`People assigned to ${appLabel.get(id) ?? service} not readable: ${(err as Error).message.slice(0, 120)}`);
    }
  }
  if (assignCut) warnings.push("People assigned in Okta only partly read (time limit).");

  // 3. System Log: accessi SSO e consensi OAuth. Dal più recente; dopo il primo sync solo il nuovo.
  const now = new Date();
  const floor = now.getTime() - HISTORY_DAYS * DAY;
  const lastSync = opts.lastSyncedAt?.getTime() ?? 0;
  const since = new Date(Math.max(floor, lastSync ? lastSync - 3600_000 : floor));
  const filter = EVENT_TYPES.map((t) => `eventType eq "${t}"`).join(" or ");
  const q = new URLSearchParams({ since: since.toISOString(), until: now.toISOString(), filter, sortOrder: "DESCENDING", limit: "1000" });
  let events = 0;
  try {
    for await (const page of client.pages(`/api/v1/logs?${q.toString()}`, MAX_LOG_PAGES)) {
      for (const ev of page) {
        events += 1;
        const result = String(ev?.outcome?.result ?? "SUCCESS").toUpperCase();
        if (result !== "SUCCESS" && result !== "ALLOW") continue;
        const email = emailOf(ev?.actor?.alternateId);
        const at = Date.parse(ev?.published ?? "");
        if (!email || !Number.isFinite(at)) continue;
        const targets: any[] = Array.isArray(ev?.target) ? ev.target : [];
        const appTarget = targets.find((t) => idToService.has(String(t?.id))) ?? targets.find((t) => /AppInstance|App|Client/i.test(String(t?.type ?? "")));
        if (!appTarget) continue;
        const label = String(appTarget.displayName ?? appTarget.alternateId ?? "");
        const service = idToService.get(String(appTarget.id)) ?? matchMerchant(`${appTarget.alternateId ?? ""} ${appTarget.displayName ?? ""}`);
        if (!service) continue;
        const a = assetFor(service, label);
        addUser(a, { email, name: ev?.actor?.displayName || undefined, externalRef: ev?.actor?.id });
        if (ev.eventType === "user.authentication.sso") {
          const key = `${service}|${email}`;
          const s = signIns.get(key) ?? { service, email, first: at, last: at, count: 0, app: label };
          s.first = Math.min(s.first, at);
          s.last = Math.max(s.last, at);
          s.count += 1;
          signIns.set(key, s);
        } else if (at > lastSync) {
          const scopes = targets.filter((t) => /scope/i.test(String(t?.type ?? ""))).map((t) => String(t.alternateId ?? t.displayName ?? "")).filter(Boolean);
          const granted = ev?.debugContext?.debugData?.grantedScopes;
          a.activities!.push({
            eventType: "oauth.consent",
            actorRef: email,
            occurredAt: new Date(at),
            payload: { app: label, scopes: scopes.length ? scopes : typeof granted === "string" ? granted.split(/[\s,]+/).filter(Boolean) : undefined, via: "Okta" },
          });
        }
      }
    }
  } catch (err) {
    if (err instanceof BudgetExceeded) warnings.push(`Okta sign-in history only partly read (time limit, ${events} events) — the most recent ones are in.`);
    else if (err instanceof OktaError && err.status === 403) warnings.push("Okta System Log not readable — the token needs the Read-Only Administrator role to see sign-ins.");
    else warnings.push(`Okta System Log not readable: ${(err as Error).message.slice(0, 160)}`);
  }

  // Un'attività di accesso per persona e app (prima/ultima volta, quante volte), solo se nuova.
  for (const s of signIns.values()) {
    if (s.last <= lastSync) continue;
    byService.get(s.service)!.activities!.push({
      eventType: "signin",
      actorRef: s.email,
      occurredAt: new Date(s.last),
      payload: { app: s.app, via: "Okta SSO", firstSeen: new Date(s.first).toISOString(), lastSeen: new Date(s.last).toISOString(), signIns: s.count },
    });
  }

  if (byService.size === 0) warnings.push("No AI apps found in Okta — AI tools used without Okta single sign-on won't show here.");
  for (const a of byService.values()) a.activities = a.activities!.sort((x, y) => y.occurredAt.getTime() - x.occurredAt.getTime()).slice(0, 500);
  return { provider: "OKTA", assets: [...byService.values()], syncedAt: now, warnings };
}

export const oktaConnector: Connector = {
  provider: "OKTA",
  async sync(row): Promise<ConnectorSyncResult> {
    const creds = decryptJson<OktaCredentials>(row.credentialsEncrypted);
    if (!creds?.domain || !creds.apiToken) throw new Error("Okta isn't connected — add the Okta domain and an API token first.");
    return oktaSync(creds, { lastSyncedAt: row.lastSyncedAt });
  },
};

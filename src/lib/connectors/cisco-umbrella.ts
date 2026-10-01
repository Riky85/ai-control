// Cisco Umbrella Reporting API v2: token OAuth (client credentials), poi
// 1) top-destinations/dns per trovare i domini AI della finestra, 2) activity/dns
// solo per quei domini (identità, IP interno, verdetto). Mai URL.
import { parseJsonRecord, type ImportHit } from "@/lib/edge/log-import";
import { NetworkApiError, waitForRetry, type Budget, type DayHits } from "./network-api";

const BASE = "https://api.umbrella.com";
const PAGE = 5000;
const MAX_OFFSET = 10_000; // limite dell'API per la paginazione

export interface UmbrellaCreds {
  apiKey: string;
  apiSecret: string;
}

// Token in memoria fino a poco prima della scadenza (vale circa un'ora).
const tokens = new Map<string, { token: string; until: number }>();

async function accessToken(creds: UmbrellaCreds): Promise<string> {
  const cached = tokens.get(creds.apiKey);
  if (cached && cached.until > Date.now()) return cached.token;
  const res = await fetch(`${BASE}/auth/v2/token`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new NetworkApiError("Cisco Umbrella rejected the API key and secret — create a key with Reports read-only scope.", true);
  if (!res.ok) throw new NetworkApiError(`Cisco Umbrella sign-in error ${res.status}.`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new NetworkApiError("Cisco Umbrella returned no access token.", true);
  tokens.set(creds.apiKey, { token: body.access_token, until: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 120) * 1000 });
  return body.access_token;
}

async function get<T>(creds: UmbrellaCreds, path: string, params: Record<string, string | number>, budget: Budget): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}${path}?${qs}`, { headers: { Authorization: `Bearer ${await accessToken(creds)}`, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    if (res.status === 429 && attempt < 2 && (await waitForRetry(res, budget))) continue;
    if (res.status === 401 && attempt === 0) {
      tokens.delete(creds.apiKey);
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new NetworkApiError("Cisco Umbrella refused access to reports — the key needs the Reports read-only scope.", true);
    if (res.status === 429) throw new NetworkApiError("Cisco Umbrella rate limit reached — angar will continue at the next sync.");
    if (!res.ok) throw new NetworkApiError(`Cisco Umbrella API error ${res.status}.`);
    return (await res.json()) as T;
  }
}

type Rows = { data?: Record<string, unknown>[] };

/** Prova le credenziali: un token e un report minimo dell'ultima ora. */
export async function testUmbrella(creds: UmbrellaCreds) {
  const now = Date.now();
  await get<Rows>(creds, "/reports/v2/top-destinations/dns", { from: now - 3_600_000, to: now, limit: 1, offset: 0 }, { deadline: now + 30_000 });
}

export async function umbrellaWindow(creds: UmbrellaCreds, since: Date, until: Date, isAi: (host: string) => boolean, budget: Budget): Promise<DayHits> {
  const from = since.getTime();
  const to = until.getTime();
  const warnings: string[] = [];
  // 1. Destinazioni più richieste (fino a 5 pagine da 1000).
  const top: { domain: string; count: number }[] = [];
  for (let offset = 0; offset < 5000; offset += 1000) {
    const body = await get<Rows>(creds, "/reports/v2/top-destinations/dns", { from, to, limit: 1000, offset }, budget);
    const rows = body.data ?? [];
    for (const r of rows) {
      const domain = typeof r.domain === "string" ? r.domain.replace(/\.+$/, "").toLowerCase() : "";
      const counts = r.counts as Record<string, unknown> | undefined;
      const count = Number(r.count ?? counts?.requests ?? 0) || 0;
      if (domain) top.push({ domain, count });
    }
    if (rows.length < 1000) break;
    if (offset === 4000) warnings.push("Cisco Umbrella: more than 5,000 destinations in a day — only the most requested ones were checked.");
  }
  const ai = [...new Set(top.map((t) => t.domain).filter(isAi))];
  // 2. Attività dei soli domini AI, 20 domini per richiesta.
  const hits: { hit: ImportHit; count: number }[] = [];
  for (let i = 0; i < ai.length; i += 20) {
    const domains = ai.slice(i, i + 20).join(",");
    for (let offset = 0; offset < MAX_OFFSET; offset += PAGE) {
      const body = await get<Rows>(creds, "/reports/v2/activity/dns", { from, to, limit: PAGE, offset, domains }, budget);
      const rows = body.data ?? [];
      for (const r of rows) {
        const h = parseJsonRecord(r, new Date());
        if (h) hits.push({ hit: { ...h, vendor: "umbrella", dns: true }, count: 1 });
      }
      if (rows.length < PAGE) break;
      if (offset + PAGE >= MAX_OFFSET) warnings.push("Cisco Umbrella: very busy AI domains — only the first 10,000 requests of the day were read for some of them.");
    }
  }
  return { hits, lines: top.reduce((n, t) => n + t.count, 0), warnings };
}

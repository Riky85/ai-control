// Cloudflare Zero Trust Gateway: query DNS dal GraphQL Analytics API
// (gatewayResolverQueriesAdaptiveGroups). Token con "Account Analytics: Read".
// Due passi per finestra: 1) i domini più interrogati (solo nome e conteggio),
// 2) solo per i domini AI, il dettaglio per persona/dispositivo. Mai URL.
import type { ImportHit } from "@/lib/edge/log-import";
import { emailIn } from "@/lib/edge/log-import";
import { parseIp } from "@/lib/edge/parse";
import { NetworkApiError, waitForRetry, type Budget, type DayHits } from "./network-api";

const ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const TOP_LIMIT = 10_000;

export interface CloudflareCreds {
  apiToken: string;
  accountId: string;
}

// Dimensioni facoltative: se lo schema non ne conosce una, si riprova senza.
const OPTIONAL_DIMS = ["srcIp", "email", "userEmail", "deviceName", "categoryNames"];

// resolverDecision numerico: 2 = blockedByQueryName, 3 = blockedByCategory, 6 = blockedAlwaysCategory, 9 = blockedRule.
const BLOCKED = new Set([2, 3, 6, 9]);
const isBlocked = (v: unknown) => (typeof v === "number" ? BLOCKED.has(v) : typeof v === "string" ? /block/i.test(v) : false);

async function gql<T>(creds: CloudflareCreds, query: string, variables: Record<string, unknown>, budget: Budget): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429 && attempt < 2 && (await waitForRetry(res, budget))) continue;
    if (res.status === 401 || res.status === 403) throw new NetworkApiError("Cloudflare rejected the API token — it needs Account Analytics: Read on this account.", true);
    if (res.status === 429) throw new NetworkApiError("Cloudflare rate limit reached — angar will continue at the next sync.");
    if (!res.ok) throw new NetworkApiError(`Cloudflare API error ${res.status}.`);
    const body = (await res.json()) as { data?: T; errors?: { message?: string }[] | null };
    if (body.errors?.length) {
      const msg = body.errors.map((e) => e.message ?? "").join("; ").slice(0, 300);
      throw new NetworkApiError(msg || "Cloudflare GraphQL error.", /auth|permission|access|not authorized/i.test(msg));
    }
    if (!body.data) throw new NetworkApiError("Cloudflare returned no data.");
    return body.data;
  }
}

type Groups = { viewer?: { accounts?: { g?: { count: number; dimensions: Record<string, unknown> }[] }[] } };

const groupsOf = (d: Groups) => d.viewer?.accounts?.[0]?.g ?? [];

/** Domini più interrogati nella finestra (passo 1). */
async function topDomains(creds: CloudflareCreds, since: string, until: string, budget: Budget) {
  const q = `query($a: string!, $s: Time!, $u: Time!) { viewer { accounts(filter: { accountTag: $a }) { g: gatewayResolverQueriesAdaptiveGroups(limit: ${TOP_LIMIT}, filter: { datetime_geq: $s, datetime_lt: $u }, orderBy: [count_DESC]) { count dimensions { queryName } } } } }`;
  const rows = groupsOf(await gql<Groups>(creds, q, { a: creds.accountId, s: since, u: until }, budget));
  return { domains: rows.map((r) => ({ name: String(r.dimensions.queryName ?? ""), count: r.count })).filter((r) => r.name), capped: rows.length >= TOP_LIMIT };
}

/** Dettaglio dei soli domini AI (passo 2), per data, IP ed email se lo schema li ha. */
async function detail(creds: CloudflareCreds, names: string[], since: string, until: string, budget: Budget) {
  let dims = [...OPTIONAL_DIMS];
  for (let tries = 0; tries <= OPTIONAL_DIMS.length; tries++) {
    const q = `query($a: string!, $s: Time!, $u: Time!, $n: [string!]) { viewer { accounts(filter: { accountTag: $a }) { g: gatewayResolverQueriesAdaptiveGroups(limit: 10000, filter: { datetime_geq: $s, datetime_lt: $u, queryName_in: $n }) { count dimensions { date queryName resolverDecision ${dims.join(" ")} } } } } }`;
    try {
      return groupsOf(await gql<Groups>(creds, q, { a: creds.accountId, s: since, u: until, n: names }, budget));
    } catch (err) {
      const msg = (err as Error).message;
      const bad = dims.filter((d) => msg.includes(d));
      if (!bad.length || (err as NetworkApiError).auth) throw err;
      dims = dims.filter((d) => !bad.includes(d));
    }
  }
  return [];
}

/** Prova il token: una query minima sull'ultima ora. */
export async function testCloudflare(creds: CloudflareCreds) {
  const now = Date.now();
  const q = `query($a: string!, $s: Time!, $u: Time!) { viewer { accounts(filter: { accountTag: $a }) { g: gatewayResolverQueriesAdaptiveGroups(limit: 1, filter: { datetime_geq: $s, datetime_lt: $u }) { count } } } }`;
  const d = await gql<Groups>(creds, q, { a: creds.accountId, s: new Date(now - 3_600_000).toISOString(), u: new Date(now).toISOString() }, { deadline: now + 30_000 });
  if (!d.viewer?.accounts?.length) throw new NetworkApiError("Account not found — check the account ID (Cloudflare dashboard → Account home → Account ID).", true);
}

/**
 * Le righe AI di una finestra [since, until): ognuna con il suo conteggio.
 * isAi decide quali domini meritano il dettaglio (catalogo o AI candidata).
 */
export async function cloudflareWindow(creds: CloudflareCreds, since: Date, until: Date, isAi: (host: string) => boolean, budget: Budget): Promise<DayHits> {
  const s = since.toISOString();
  const u = until.toISOString();
  const top = await topDomains(creds, s, u, budget);
  const total = top.domains.reduce((n, d) => n + d.count, 0);
  const ai = [...new Set(top.domains.map((d) => d.name.replace(/\.+$/, "").toLowerCase()).filter(isAi))];
  const hits: { hit: ImportHit; count: number }[] = [];
  for (let i = 0; i < ai.length; i += 100) {
    const rows = await detail(creds, ai.slice(i, i + 100), s, u, budget);
    for (const r of rows) {
      const d = r.dimensions;
      const host = String(d.queryName ?? "").replace(/\.+$/, "").toLowerCase();
      if (!host) continue;
      const cats = Array.isArray(d.categoryNames) ? d.categoryNames.join(" ") : String(d.categoryNames ?? "");
      const name = typeof d.deviceName === "string" ? d.deviceName : null;
      hits.push({
        count: r.count,
        hit: {
          vendor: "cloudflare",
          client: parseIp(typeof d.srcIp === "string" ? d.srcIp : null),
          clientName: name,
          email: emailIn(d.email) ?? emailIn(d.userEmail),
          day: typeof d.date === "string" ? d.date : null,
          host,
          bytesUp: 0,
          blocked: isBlocked(d.resolverDecision),
          aiCategory: /artificial|generative/i.test(cats),
          dns: true,
        },
      });
    }
  }
  return { hits, lines: total, warnings: top.capped ? [`Cloudflare: more than ${TOP_LIMIT.toLocaleString("en-GB")} different domains in a day — only the most queried ones were checked.`] : [] };
}

// Sync dei log di rete via API (Cloudflare Gateway, Cisco Umbrella): cursore
// incrementale ("letto fino a", salvato cifrato insieme alle credenziali), finestre
// di un giorno UTC, tempo massimo per sync, poi la pipeline di angar Edge.
import type { ConnectorProvider } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { recordInventorySnapshot } from "@/lib/evidence";
import { createAggregator } from "@/lib/edge/log-import";
import { aiCandidateDomain } from "@/lib/edge/parse";
import { importMatcher, ingestImport, isAnonymous } from "@/lib/edge/network-source";
import { cloudflareWindow, type CloudflareCreds } from "./cloudflare-gateway";
import { umbrellaWindow, type UmbrellaCreds } from "./cisco-umbrella";
import { NetworkApiError, type Budget, type DayHits } from "./network-api";

export const NETWORK_LOG_PROVIDERS = ["CLOUDFLARE_GATEWAY", "CISCO_UMBRELLA"] as const;
export type NetworkLogProvider = (typeof NETWORK_LOG_PROVIDERS)[number];
export const isNetworkLogProvider = (p: string): p is NetworkLogProvider => (NETWORK_LOG_PROVIDERS as readonly string[]).includes(p);

type Creds = (CloudflareCreds | UmbrellaCreds) & { cursor?: string };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Primo sync: gli ultimi 7 giorni. */
const BACKFILL_DAYS = 7;
/** I dati arrivano con qualche minuto di ritardo: si legge fino a 30 minuti fa. */
const LAG_MS = 30 * 60 * 1000;
/** Tempo massimo di un sync, e di tutti i sync del giro orario. */
const SYNC_BUDGET_MS = 90_000;
const JOB_BUDGET_MS = 5 * 60_000;

const startOfUtcDay = (t: number) => t - (t % DAY);

export interface NetworkSyncResult {
  ok: boolean;
  error?: string;
  lines: number;
  aiLines: number;
  services: number;
  people: number;
  windows: number;
  warnings: string[];
}

/**
 * Un sync: dal cursore (o da 7 giorni fa) fino a 30 minuti fa, una finestra per giorno UTC.
 * Le finestre non si sovrappongono mai, così i conteggi non raddoppiano. Se il tempo
 * finisce, il cursore resta all'ultima finestra completa e il resto arriva al sync dopo.
 */
export async function syncNetworkLogs(organizationId: string, provider: NetworkLogProvider, budgetMs = SYNC_BUDGET_MS): Promise<NetworkSyncResult> {
  const row = await db.connector.findUnique({ where: { organizationId_provider: { organizationId, provider } }, include: { organization: { select: { privacyMode: true } } } });
  const creds = decryptJson<Creds>(row?.credentialsEncrypted);
  const empty: NetworkSyncResult = { ok: false, lines: 0, aiLines: 0, services: 0, people: 0, windows: 0, warnings: [] };
  if (!row || !creds) return { ...empty, error: "Not connected." };
  await db.connector.update({ where: { id: row.id }, data: { status: "SYNCING" } });

  const budget: Budget = { deadline: Date.now() + budgetMs };
  const until = Date.now() - LAG_MS;
  let cursor = creds.cursor && Date.parse(creds.cursor) ? Date.parse(creds.cursor) : startOfUtcDay(until) - (BACKFILL_DAYS - 1) * DAY;
  cursor = Math.max(cursor, until - 30 * DAY); // mai più di 30 giorni indietro

  const matcher = await importMatcher(organizationId);
  const isAi = (host: string) => !!(matcher.service(host) ?? matcher.blocked(host)) || !!aiCandidateDomain(host);
  const agg = createAggregator(matcher, { anonymous: isAnonymous(row.organization), prefix: "cloud", maxAgeDays: 40 });
  let windows = 0;
  let error: string | null = null;
  let authFailed = false;

  while (cursor < until - 60_000) {
    if (Date.now() > budget.deadline - 15_000) {
      agg.warnings.push("Time limit reached — the rest will be read at the next sync.");
      break;
    }
    const end = Math.min(startOfUtcDay(cursor) + DAY, until);
    let w: DayHits;
    try {
      w =
        provider === "CLOUDFLARE_GATEWAY"
          ? await cloudflareWindow(creds as CloudflareCreds, new Date(cursor), new Date(end), isAi, budget)
          : await umbrellaWindow(creds as UmbrellaCreds, new Date(cursor), new Date(end), isAi, budget);
    } catch (err) {
      error = (err as Error).message.slice(0, 300);
      authFailed = err instanceof NetworkApiError && err.auth;
      break;
    }
    const fallbackDay = new Date(cursor).toISOString().slice(0, 10);
    agg.st.lines += w.lines;
    for (const { hit, count } of w.hits) agg.add(hit, count, fallbackDay);
    for (const x of w.warnings) if (!agg.warnings.includes(x)) agg.warnings.push(x);
    cursor = end;
    windows++;
  }

  const r = agg.result();
  if (windows > 0) {
    await ingestImport(organizationId, provider, r);
    await recordInventorySnapshot(organizationId).catch(() => undefined);
  }
  // Il cursore avanza solo per le finestre lette per intero.
  const next = encryptJson({ ...creds, cursor: new Date(cursor).toISOString() });
  const failed = !!error && (authFailed || windows === 0);
  await db.connector.update({
    where: { id: row.id },
    data: {
      credentialsEncrypted: next,
      // ERROR solo per credenziali rifiutate; un errore passeggero si riprova al giro dopo.
      status: authFailed ? "ERROR" : "CONNECTED",
      lastSyncError: error,
      ...(windows > 0 ? { lastSyncedAt: new Date() } : {}),
      lastSyncWarnings: r.warnings.slice(0, 10),
    },
  });
  return { ok: !failed, ...(error ? { error } : {}), lines: r.lines, aiLines: r.aiLines, services: r.services.length, people: r.people, windows, warnings: r.warnings };
}

/**
 * Giro orario (jobs.ts): ogni connettore una volta al giorno (ultimo sync oltre 20 ore fa),
 * entro un tempo totale massimo. I connettori con credenziali rifiutate aspettano chi le corregge.
 */
export async function networkLogsJob(now = new Date()): Promise<number> {
  const due = await db.connector.findMany({
    where: {
      provider: { in: [...NETWORK_LOG_PROVIDERS] as ConnectorProvider[] },
      credentialsEncrypted: { not: null },
      status: { in: ["CONNECTED", "SYNCING"] },
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(now.getTime() - 20 * HOUR) } }],
    },
    select: { organizationId: true, provider: true },
    orderBy: { lastSyncedAt: "asc" },
    take: 50,
  });
  const deadline = Date.now() + JOB_BUDGET_MS;
  let n = 0;
  for (const c of due) {
    const left = deadline - Date.now();
    if (left < 30_000) break;
    try {
      const r = await syncNetworkLogs(c.organizationId, c.provider as NetworkLogProvider, Math.min(SYNC_BUDGET_MS, left));
      if (r.ok) n++;
    } catch (err) {
      console.error("[jobs] network logs failed", c.organizationId, c.provider, err);
    }
  }
  return n;
}

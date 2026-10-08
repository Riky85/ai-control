/**
 * angar Gateway — accesso al database per il proxy, con piccole cache in
 * memoria (il proxy non deve fare 5 query a ogni richiesta):
 * - regole, piano e provider dell'azienda: 30 s
 * - spesa del mese di chiave e team: 30 s, più i costi registrati da questo processo
 * - richieste dell'ultimo minuto: 10 s, più quelle registrate da questo processo
 * - risoluzione DNS degli endpoint personalizzati: 5 min
 * Solo codice lato server.
 */
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { euOnlyDeployment } from "@/lib/eu-only";
import { getPlanState } from "@/lib/plan-gate";
import { hasFeature } from "@/lib/plans";
import { resolvesPublic } from "@/lib/webhooks";
import { GATEWAY_SERVICE_ID, policyFromRow } from "./policy";
import type { GatewayStore, LogEntry, OrgContext, UpstreamConfig } from "./proxy";
import type { GatewayProvider } from "./usage";

const CTX_TTL = 30_000;
const SPEND_TTL = 30_000;
const RECENT_TTL = 10_000;
const DNS_TTL = 300_000;

type Cached<T> = { at: number; value: T };
const ctxCache = new Map<string, Cached<OrgContext>>();
const spendCache = new Map<string, Cached<number>>();
const recentCache = new Map<string, Cached<number>>();
const dnsCache = new Map<string, Cached<boolean>>();

const fresh = <T>(c: Cached<T> | undefined, ttl: number): c is Cached<T> => Boolean(c && Date.now() - c.at < ttl);

/** Le cache diventano vecchie dopo un cambio di regole o chiavi (server action). */
export function invalidateGatewayCache(orgId: string) {
  ctxCache.delete(orgId);
  for (const k of spendCache.keys()) if (k.startsWith(orgId + ":")) spendCache.delete(k);
}

/** Inizio del mese corrente (ora di Roma, come Budgets). */
export function monthStartRome(now = new Date()): Date {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  const guess = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, 1));
  // Scostamento di Roma a quella data (1 o 2 ore).
  const romeHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(guess));
  return new Date(guess.getTime() - romeHour * 3_600_000);
}

/**
 * Chiave del provider per il Gateway: quella incollata nel Gateway oppure, se è
 * una chiave normale (non "admin"), quella del connettore del provider. Le chiavi
 * admin servono a leggere costi e utenti, non a chiamare i modelli.
 */
function connectorKey(provider: GatewayProvider, encrypted: string | null | undefined): string | null {
  const k = decryptJson<{ apiKey?: string }>(encrypted)?.apiKey ?? null;
  if (!k) return null;
  if (provider === "openai" && k.startsWith("sk-admin-")) return null;
  if (provider === "anthropic" && k.startsWith("sk-ant-admin")) return null;
  return k;
}

async function loadContext(orgId: string): Promise<OrgContext> {
  const [org, policyRow, upstreams, connectors, plan, blocked] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId }, select: { euOnly: true } }),
    db.gatewayPolicy.findUnique({ where: { organizationId: orgId } }),
    db.gatewayUpstream.findMany({ where: { organizationId: orgId } }),
    db.connector.findMany({ where: { organizationId: orgId, provider: { in: ["OPENAI", "ANTHROPIC"] } }, select: { provider: true, credentialsEncrypted: true } }),
    getPlanState(orgId),
    // AI "Not allowed" che corrispondono ai provider del Gateway (stesso serviceId della spesa del Gateway).
    db.aiAsset.findMany({ where: { organizationId: orgId, deletedAt: null, status: "UNAPPROVED", serviceId: { in: Object.values(GATEWAY_SERVICE_ID) } }, select: { name: true, serviceId: true } }),
  ]);
  const notAllowed: Partial<Record<GatewayProvider, string>> = {};
  for (const provider of ["openai", "anthropic"] as GatewayProvider[]) {
    const hit = blocked.find((a) => a.serviceId === GATEWAY_SERVICE_ID[provider]);
    if (hit) notAllowed[provider] = hit.name;
  }
  const out: Partial<Record<GatewayProvider, UpstreamConfig>> = {};
  for (const provider of ["openai", "anthropic"] as GatewayProvider[]) {
    const row = upstreams.find((u) => u.provider === provider);
    const fromGateway = decryptJson<{ apiKey?: string }>(row?.credentialsEncrypted)?.apiKey ?? null;
    const fromConnector = connectorKey(provider, connectors.find((c) => c.provider === (provider === "openai" ? "OPENAI" : "ANTHROPIC"))?.credentialsEncrypted);
    out[provider] = { apiKey: fromGateway ?? fromConnector, baseUrl: row?.baseUrl ?? null, euHosted: row?.euHosted ?? false };
  }
  return {
    planOk: hasFeature(plan.effectivePlan, plan.addons, "gateway"),
    forcedEuOnly: euOnlyDeployment() || org?.euOnly === true,
    policy: policyFromRow(policyRow),
    upstreams: out,
    notAllowed,
  };
}

async function spendSince(orgId: string, where: { keyId?: string; team?: string }) {
  const r = await db.gatewayRequest.aggregate({ where: { organizationId: orgId, createdAt: { gte: monthStartRome() }, ...where }, _sum: { costEur: true } });
  return r._sum.costEur ?? 0;
}

export const prismaGatewayStore: GatewayStore = {
  async findKey(hash) {
    return db.gatewayKey.findUnique({
      where: { keyHash: hash },
      select: { id: true, organizationId: true, name: true, team: true, last4: true, provider: true, monthlyCapEur: true, allowedModels: true, redactOverride: true, blockHealthOverride: true, revokedAt: true },
    });
  },

  async orgContext(orgId) {
    const c = ctxCache.get(orgId);
    if (fresh(c, CTX_TTL)) return c.value;
    const value = await loadContext(orgId);
    ctxCache.set(orgId, { at: Date.now(), value });
    return value;
  },

  async monthSpend(orgId, keyId, team) {
    const get = async (cacheKey: string, where: { keyId?: string; team?: string }) => {
      const c = spendCache.get(cacheKey);
      if (fresh(c, SPEND_TTL)) return c.value;
      const value = await spendSince(orgId, where);
      spendCache.set(cacheKey, { at: Date.now(), value });
      return value;
    };
    const [key, teamSpend] = await Promise.all([get(`${orgId}:k:${keyId}`, { keyId }), team ? get(`${orgId}:t:${team}`, { team }) : Promise.resolve(0)]);
    return { key, team: teamSpend };
  },

  async recentCount(keyId) {
    const c = recentCache.get(keyId);
    if (fresh(c, RECENT_TTL)) return c.value;
    const value = await db.gatewayRequest.count({ where: { keyId, createdAt: { gte: new Date(Date.now() - 60_000) } } });
    recentCache.set(keyId, { at: Date.now(), value });
    return value;
  },

  async hostIsPublic(baseUrl) {
    const host = new URL(baseUrl).hostname;
    const c = dnsCache.get(host);
    if (fresh(c, DNS_TTL)) return c.value;
    const value = await resolvesPublic(baseUrl);
    dnsCache.set(host, { at: Date.now(), value });
    return value;
  },

  async log(e: LogEntry) {
    await db.gatewayRequest.create({
      data: {
        id: e.id,
        organizationId: e.organizationId,
        keyId: e.keyId,
        keyName: e.keyName,
        keyLast4: e.keyLast4,
        team: e.team,
        provider: e.provider,
        endpoint: e.endpoint,
        model: e.model,
        stream: e.stream,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        costEur: e.costEur,
        latencyMs: e.latencyMs,
        overheadMs: e.overheadMs,
        status: e.status,
        result: e.result,
        reason: e.reason,
        redactions: e.redactions ?? undefined,
      },
    });
    // Le cache contano anche quello che questo processo ha appena registrato.
    if (e.keyId) {
      const r = recentCache.get(e.keyId);
      if (r) r.value += 1;
      if (e.costEur > 0) {
        const k = spendCache.get(`${e.organizationId}:k:${e.keyId}`);
        if (k) k.value += e.costEur;
        const t = e.team ? spendCache.get(`${e.organizationId}:t:${e.team}`) : undefined;
        if (t) t.value += e.costEur;
      }
      // lastUsedAt al massimo una volta al minuto.
      const touched = lastTouch.get(e.keyId) ?? 0;
      if (Date.now() - touched > 60_000) {
        lastTouch.set(e.keyId, Date.now());
        void db.gatewayKey.update({ where: { id: e.keyId }, data: { lastUsedAt: new Date() } }).catch(() => {});
      }
    }
  },
};

const lastTouch = new Map<string, number>();

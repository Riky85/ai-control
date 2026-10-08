/**
 * Accessi delle app (OAuth) — dal database e verso il database. Aggiornati dal sync dei
 * connettori Microsoft 365 / Google Workspace (passo in più in connectors/sync.ts) e dal
 * pulsante "Refresh". Senza connettore non succede nulla: la pagina mostra come collegarlo.
 */
import { db } from "@/lib/db";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";
import { capabilityOf, fetchGrants } from "./providers";
import { classifyApp, GRANT_PROVIDERS, type GrantCapability, type GrantProvider } from "./types";

export * from "./types";

/** Connettori Microsoft 365 / Google Workspace collegati (con credenziali). */
export async function grantConnectors(organizationId: string) {
  const rows = await db.connector.findMany({
    where: { organizationId, provider: { in: GRANT_PROVIDERS }, credentialsEncrypted: { not: null }, status: { not: "DISCONNECTED" } },
    select: { provider: true, credentialsEncrypted: true },
  });
  return rows as { provider: GrantProvider; credentialsEncrypted: string | null }[];
}

// Permessi del token in memoria per 10 minuti: la pagina non chiede a Microsoft/Google a ogni apertura.
const CAP_TTL = 10 * 60_000;
const capCache = new Map<string, { at: number; cap: GrantCapability }>();

export async function capabilities(organizationId: string, opts: { fresh?: boolean } = {}): Promise<Partial<Record<GrantProvider, GrantCapability>>> {
  const rows = await grantConnectors(organizationId);
  const out: Partial<Record<GrantProvider, GrantCapability>> = {};
  await Promise.all(
    rows.map(async (r) => {
      const k = `${organizationId}:${r.provider}`;
      const hit = capCache.get(k);
      if (!opts.fresh && hit && Date.now() - hit.at < CAP_TTL) {
        out[r.provider] = hit.cap;
        return;
      }
      const cap = await capabilityOf(r.provider, r.credentialsEncrypted);
      capCache.set(k, { at: Date.now(), cap });
      out[r.provider] = cap;
    }),
  );
  return out;
}

export interface RefreshResult {
  provider: GrantProvider;
  ok: boolean;
  apps?: number;
  aiApps?: number;
  error?: string;
}

/**
 * Rilegge i consensi e li salva (upsert per app; le app sparite dal fornitore si tolgono).
 * Non lancia mai: l'esito torna per fornitore.
 */
export async function refreshOAuthGrants(organizationId: string, only?: GrantProvider): Promise<RefreshResult[]> {
  const rows = (await grantConnectors(organizationId).catch(() => [])).filter((r) => !only || r.provider === only);
  if (!rows.length) return [];
  const withEmails = showsPeople(await orgPrivacyMode(organizationId).catch(() => "anonymous" as const));
  const assets = await db.aiAsset.findMany({ where: { organizationId, deletedAt: null, serviceId: { not: null } }, select: { id: true, serviceId: true } });
  const assetOf = new Map(assets.map((a) => [a.serviceId!, a.id]));
  const results: RefreshResult[] = [];
  for (const r of rows) {
    const started = new Date();
    const res = await fetchGrants(r.provider, r.credentialsEncrypted, withEmails);
    capCache.delete(`${organizationId}:${r.provider}`);
    if (!res.ok) {
      results.push({ provider: r.provider, ok: false, error: res.error });
      continue;
    }
    let ai = 0;
    try {
      for (const g of res.grants) {
        const c = classifyApp(g.appName, g.publisher);
        if (c.isAi) ai++;
        const data = {
          appName: g.appName,
          publisher: g.publisher,
          scopes: g.scopes,
          userCount: g.userCount,
          userRefs: g.userRefs,
          adminConsent: g.adminConsent,
          isAi: c.isAi,
          serviceId: c.serviceId,
          aiAssetId: c.serviceId ? assetOf.get(c.serviceId) ?? null : null,
          lastSeenAt: started,
        };
        await db.oAuthGrant.upsert({
          where: { organizationId_provider_appId: { organizationId, provider: r.provider, appId: g.appId } },
          update: data,
          create: { organizationId, provider: r.provider, appId: g.appId, firstSeenAt: started, ...data },
        });
      }
      // App non più presenti (revocate altrove): via dall'elenco.
      await db.oAuthGrant.deleteMany({ where: { organizationId, provider: r.provider, lastSeenAt: { lt: started } } });
      results.push({ provider: r.provider, ok: true, apps: res.grants.length, aiApps: ai });
    } catch (err) {
      console.error("[access] save failed", organizationId, r.provider, (err as Error).message);
      results.push({ provider: r.provider, ok: false, error: "Couldn't save the app list." });
    }
  }
  return results;
}

/** Dati della pagina /estate/access. */
export async function loadAccess(organizationId: string) {
  const [connectors, grants] = await Promise.all([
    grantConnectors(organizationId),
    db.oAuthGrant.findMany({ where: { organizationId }, orderBy: [{ isAi: "desc" }, { userCount: "desc" }, { appName: "asc" }], take: 1000 }),
  ]);
  const caps = connectors.length ? await capabilities(organizationId) : {};
  const assetIds = Array.from(new Set(grants.map((g) => g.aiAssetId).filter((x): x is string => !!x)));
  const assets = assetIds.length
    ? await db.aiAsset.findMany({ where: { organizationId, id: { in: assetIds }, deletedAt: null }, select: { id: true, name: true, status: true, nudgedAt: true } })
    : [];
  return { connected: connectors.map((c) => c.provider), caps, grants, assets: new Map(assets.map((a) => [a.id, a])) };
}

/** AI non consentite (UNAPPROVED) che risultano ancora usate: uso/attività negli ultimi 90 giorni o consensi OAuth. */
export async function notAllowedInUse(organizationId: string) {
  const since = new Date(Date.now() - 90 * 86400000);
  const assets = await db.aiAsset.findMany({
    where: { organizationId, deletedAt: null, status: "UNAPPROVED" },
    select: { id: true, name: true, vendor: true, nudgedAt: true, insteadAssetId: true, _count: { select: { usages: { where: { OR: [{ lastSeenAt: null }, { lastSeenAt: { gte: since } }] } } } } },
    take: 500,
  });
  if (!assets.length) return [];
  const [grants, alts] = await Promise.all([
    db.oAuthGrant.groupBy({ by: ["aiAssetId"], where: { organizationId, aiAssetId: { in: assets.map((a) => a.id) } }, _sum: { userCount: true } }),
    db.aiAsset.findMany({ where: { organizationId, deletedAt: null, status: "APPROVED", id: { in: assets.map((a) => a.insteadAssetId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
  ]);
  const granted = new Map(grants.map((g) => [g.aiAssetId, g._sum.userCount ?? 0]));
  const altName = new Map(alts.map((a) => [a.id, a.name]));
  return assets
    .map((a) => ({
      id: a.id,
      name: a.name,
      vendor: a.vendor,
      users: Math.max(a._count.usages, granted.get(a.id) ?? 0),
      nudgedAt: a.nudgedAt,
      alternative: a.insteadAssetId ? altName.get(a.insteadAssetId) ?? null : null,
    }))
    .filter((a) => a.users > 0)
    .sort((x, y) => y.users - x.users);
}

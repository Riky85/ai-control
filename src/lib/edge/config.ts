import { db } from "@/lib/db";
import { AI_SERVICES } from "@/lib/discovery/catalog";
import { privacyModeOf, type PrivacyMode } from "@/lib/privacy";
import { suffixMatch, serviceByApp, type Matcher } from "./parse";

export interface EdgeService {
  id: string;
  name: string;
  kind: "web" | "api";
  domains: string[];
}

export interface EdgeBlocked {
  serviceId: string;
  name: string;
  domains: string[];
  instead?: string;
}

/** Servizi del catalogo come li vede il sensore (solo host, niente percorsi). */
export const EDGE_SERVICES: EdgeService[] = AI_SERVICES.map((s) => ({
  id: s.id,
  name: s.name,
  kind: (s.type === "AI_API" ? "api" : "web") as "web" | "api",
  domains: s.domains.filter((d) => !d.includes("/")),
})).filter((s) => s.domains.length > 0);

const BY_ID = new Map(EDGE_SERVICES.map((s) => [s.id, s]));
export const edgeService = (id: string) => BY_ID.get(id) ?? null;

export const CAND_PREFIX = "net:cand:";

/** AI che l'azienda blocca sulla rete (angar Edge risponde 0.0.0.0), con l'alternativa approvata. */
export async function blockedFor(organizationId: string): Promise<EdgeBlocked[]> {
  const assets = await db.aiAsset.findMany({
    where: { organizationId, deletedAt: null, blockOnNetwork: true },
    select: { id: true, name: true, serviceId: true, externalId: true, insteadAssetId: true },
    take: 500,
  });
  const insteadIds = [...new Set(assets.map((a) => a.insteadAssetId).filter((x): x is string => !!x))];
  const instead = insteadIds.length
    ? await db.aiAsset.findMany({ where: { organizationId, deletedAt: null, id: { in: insteadIds } }, select: { id: true, name: true } })
    : [];
  const insteadName = new Map(instead.map((a) => [a.id, a.name]));
  const out = new Map<string, EdgeBlocked>();
  for (const a of assets) {
    let serviceId: string | null = null;
    let domains: string[] = [];
    const svc = a.serviceId ? edgeService(a.serviceId) : null;
    if (svc) {
      serviceId = svc.id;
      domains = svc.domains;
    } else if (a.externalId?.startsWith(CAND_PREFIX)) {
      const d = a.externalId.slice(CAND_PREFIX.length).toLowerCase();
      if (/^[a-z0-9.-]{3,80}$/.test(d) && d.includes(".")) {
        serviceId = `cand:${d}`;
        domains = [d];
      }
    }
    if (!serviceId || out.has(serviceId)) continue;
    const i = a.insteadAssetId ? insteadName.get(a.insteadAssetId) : undefined;
    out.set(serviceId, { serviceId, name: a.name, domains, ...(i ? { instead: i } : {}) });
  }
  return [...out.values()];
}

export function buildMatcher(blocked: EdgeBlocked[]): Matcher {
  const services = EDGE_SERVICES;
  return {
    service(host) {
      const s = services.find((x) => suffixMatch(host, x.domains));
      return s ? { serviceId: s.id, kind: s.kind } : null;
    },
    blocked(host) {
      const b = blocked.find((x) => suffixMatch(host, x.domains));
      return b ? { serviceId: b.serviceId, kind: edgeService(b.serviceId)?.kind ?? "web" } : null;
    },
    byApp(app) {
      return serviceByApp(app, services);
    },
  };
}

export async function edgeConfig(sensor: {
  id: string;
  name: string;
  dnsEnabled: boolean;
  syslogEnabled: boolean;
  blockEnabled: boolean;
  scanLan: boolean;
  organization: { id: string; name: string; privacyMode?: string | null };
}): Promise<{ privacyMode: PrivacyMode } & Record<string, unknown>> {
  const blocked = await blockedFor(sensor.organization.id);
  return {
    sensorId: sensor.id,
    name: sensor.name,
    company: sensor.organization.name,
    privacyMode: privacyModeOf(sensor.organization),
    dnsEnabled: sensor.dnsEnabled,
    syslogEnabled: sensor.syslogEnabled,
    blockEnabled: sensor.blockEnabled,
    scanLan: sensor.scanLan,
    reportEverySec: 300,
    services: EDGE_SERVICES,
    blocked,
  };
}

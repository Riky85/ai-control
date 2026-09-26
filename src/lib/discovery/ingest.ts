import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { persistSyncResult } from "@/lib/connectors/upsert";
import { recordInventorySnapshot } from "@/lib/evidence";
import type { ObservedAsset } from "@/lib/connectors/types";
import { AI_SERVICES, matchApp, matchDomain, type AiService } from "./catalog";

export interface Finding {
  kind: "domain" | "app" | "env" | "port";
  value: string;
  hits?: number;
  lastSeen?: string;
  via?: string; // "browser history", "dns cache", "dns log", "installed app"…
}

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function newDiscoveryToken() {
  const token = "angd_" + randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token), hint: token.slice(0, 9) + "…" + token.slice(-4) };
}

export async function orgForToken(token: string | null | undefined) {
  if (!token || !token.startsWith("angd_")) return null;
  return db.organization.findUnique({ where: { discoveryTokenHash: hashToken(token) } });
}

/** Estrae i nomi di dominio da un log qualsiasi (DNS, firewall, proxy, CSV). */
export function domainsFromText(text: string): Finding[] {
  const counts = new Map<string, number>();
  const re = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})\b/gi;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text)) && n < 2_000_000) {
    n++;
    const d = m[1].toLowerCase();
    if (!matchDomain(d)) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts].map(([value, hits]) => ({ kind: "domain" as const, value, hits, via: "network log" }));
}

/**
 * Trasforma ciò che lo scanner (o un log) ha visto in sistemi AI.
 * Tutto ciò che arriva da qui parte "da rivedere": nessuno lo ha dichiarato.
 */
export async function ingestFindings(organizationId: string, device: string, findings: Finding[]) {
  const byService = new Map<string, { svc: AiService; hits: number; evidence: Set<string>; last?: Date }>();
  for (const f of findings.slice(0, 5000)) {
    const value = String(f.value ?? "").slice(0, 300);
    let svc: AiService | null = null;
    if (f.kind === "domain") svc = matchDomain(value);
    else if (f.kind === "app") svc = matchApp(value);
    else if (f.kind === "env") svc = AI_SERVICES.find((s) => s.id === value) ?? null;
    else if (f.kind === "port") svc = AI_SERVICES.find((s) => s.id === value) ?? null;
    if (!svc) continue;
    const cur = byService.get(svc.id) ?? { svc, hits: 0, evidence: new Set<string>() };
    cur.hits += Math.max(1, Math.min(Number(f.hits) || 1, 1_000_000));
    cur.evidence.add(`${f.via ?? f.kind}: ${value}`);
    const seen = f.lastSeen ? new Date(f.lastSeen) : undefined;
    if (seen && !isNaN(seen.getTime()) && (!cur.last || seen > cur.last)) cur.last = seen;
    byService.set(svc.id, cur);
  }

  const assets: ObservedAsset[] = [...byService.values()].map(({ svc, hits, evidence, last }) => ({
    externalId: `net:${svc.id}`,
    type: svc.type,
    serviceId: svc.id,
    name: svc.name,
    vendor: svc.vendor,
    connectedSystems: [{ system: "Seen on", detail: device.slice(0, 120) }],
    activities: [
      {
        eventType: "discovery.seen",
        actorRef: device.slice(0, 120),
        occurredAt: last ?? new Date(),
        payload: { device, hits, evidence: [...evidence].slice(0, 10) },
      },
    ],
  }));

  const connector = await db.connector.upsert({
    where: { organizationId_provider: { organizationId, provider: "NETWORK" } },
    update: {},
    create: { organizationId, provider: "NETWORK", status: "CONNECTED", scopes: ["discovery"] },
  });
  await persistSyncResult(organizationId, connector.id, { provider: "NETWORK", assets, syncedAt: new Date(), warnings: [] });
  await recordInventorySnapshot(organizationId);
  return assets.map((a) => a.name);
}

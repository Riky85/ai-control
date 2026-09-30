import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { persistSyncResult } from "@/lib/connectors/upsert";
import { recordInventorySnapshot } from "@/lib/evidence";
import { notifyNewAi } from "@/lib/chat-actions";
import type { ObservedAsset } from "@/lib/connectors/types";
import { AI_SERVICES, matchApp, matchDomain, registrable, resolveCandidateDomain, type AiService } from "./catalog";
import { identitiesFor } from "./pseudonym";

export interface Finding {
  // "candidate" / "candidate_app": sembra un'AI ma non è nel catalogo (solo app desktop).
  kind: "domain" | "app" | "env" | "port" | "candidate" | "candidate_app";
  value: string;
  hits?: number;
  minutes?: number; // tempo d'uso stimato (app desktop)
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
 * Un dominio o un'app che "sembra AI" ma non è nel catalogo diventa un
 * servizio provvisorio, da rivedere: così si scoprono anche le AI nuove che
 * nessuno ha ancora inserito. Solo nomi validi e brevi, mai URL.
 */
function candidateService(kind: "candidate" | "candidate_app", raw: string): AiService | null {
  const v = raw.trim().toLowerCase();
  if (kind === "candidate") {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(v) || v.length > 80) return null;
    // Un solo candidato per sito: app.foo.ai e foo.ai sono la stessa AI.
    const reg = registrable(v);
    return { id: `cand:${reg}`, name: reg, vendor: reg, type: "AI_APPLICATION", domains: [reg] };
  }
  const name = raw.trim().replace(/\.(exe|app)$/i, "").slice(0, 60);
  if (!/^[\w .+-]{2,60}$/.test(name)) return null;
  return { id: `cand-app:${name.toLowerCase()}`, name, vendor: name, type: "AI_APPLICATION", domains: [], apps: [name] };
}

/**
 * Trasforma ciò che lo scanner (o un log) ha visto in sistemi AI.
 * Tutto ciò che arriva da qui parte "da rivedere": nessuno lo ha dichiarato.
 */
export async function ingestFindings(organizationId: string, device: string, findings: Finding[], userEmail?: string | null, source: "extension" | "desktop" | "scanner" | "edge" = "extension") {
  // Una riga di attività per AI e per giorno: così "giorni attivi" è vero
  // anche quando l'app desktop manda in una volta gli ultimi 30 giorni.
  type Day = { hits: number; minutes: number; evidence: Set<string>; last?: Date };
  const byService = new Map<string, { svc: AiService; days: Map<string, Day>; candidate: boolean }>();
  for (const f of findings.slice(0, 5000)) {
    const value = String(f.value ?? "").slice(0, 300);
    let svc: AiService | null = null;
    let candidate = false;
    if (f.kind === "domain") svc = matchDomain(value);
    else if (f.kind === "app") svc = matchApp(value);
    else if (f.kind === "env") svc = AI_SERVICES.find((s) => s.id === value) ?? null;
    else if (f.kind === "port") svc = AI_SERVICES.find((s) => s.id === value) ?? null;
    else if (f.kind === "candidate" || f.kind === "candidate_app") {
      // Prima si riprova col catalogo (magari nel frattempo l'abbiamo aggiunta).
      if (f.kind === "candidate") {
        // Sito del produttore (anthropic.com…) → niente; altro indirizzo di un'AI nota (claude.com) → quella AI.
        const r = resolveCandidateDomain(value);
        if (r.kind === "ignore") continue;
        svc = r.kind === "service" ? r.service : null;
      } else svc = matchApp(value);
      if (!svc) {
        svc = candidateService(f.kind, value);
        candidate = !!svc;
      }
    }
    if (!svc) continue;
    const cur = byService.get(svc.id) ?? { svc, days: new Map<string, Day>(), candidate };
    let seen = f.lastSeen ? new Date(f.lastSeen) : undefined;
    if (seen && (isNaN(seen.getTime()) || seen.getTime() > Date.now() + 86400000)) seen = undefined;
    const key = seen ? seen.toISOString().slice(0, 10) : "now";
    const day = cur.days.get(key) ?? { hits: 0, minutes: 0, evidence: new Set<string>() };
    day.hits += Math.max(1, Math.min(Number(f.hits) || 1, 1_000_000));
    day.minutes += Math.max(0, Math.min(Number(f.minutes) || 0, 24 * 60));
    day.evidence.add(`${f.via ?? f.kind}: ${value}`);
    if (seen && (!day.last || seen > day.last)) day.last = seen;
    cur.days.set(key, day);
    byService.set(svc.id, cur);
  }

  // angar Edge (rete): sempre "edge.seen", anche quando si sa di chi è il dispositivo.
  const eventType = source === "edge" ? "edge.seen" : !userEmail ? "discovery.seen" : source === "desktop" ? "desktop.active" : "extension.active";

  // Privacy nel database: fuori da "per persona" niente email (pseudonimo) e
  // niente nome del computer (il nome host spesso è il nome della persona).
  const ids = await identitiesFor(organizationId);
  const who = userEmail ? ids.person(userEmail) : null;
  if (!ids.people) device = privateDevice(device, ids.host);
  const assets: ObservedAsset[] = [...byService.values()].map(({ svc, days, candidate }) => ({
    externalId: `net:${svc.id}`,
    type: svc.type,
    // Le AI "possibili" non sono nel catalogo: niente serviceId (costi e risparmi non si applicano).
    serviceId: candidate ? undefined : svc.id,
    name: svc.name,
    vendor: svc.vendor,
    connectedSystems: [{ system: "Seen on", detail: device.slice(0, 120) }],
    // Con l'estensione o l'app desktop si sa anche chi la usa (email aziendale).
    users: who ? [{ email: who }] : [],
    activities: [...days.values()].slice(0, 60).map(({ hits, minutes, evidence, last }) => ({
      eventType,
      actorRef: (who ?? device).slice(0, 120),
      occurredAt: last ?? new Date(),
      payload: { device, hits, minutes: Math.round(minutes), evidence: [...evidence].slice(0, 10) },
    })),
  }));

  const connector = await db.connector.upsert({
    where: { organizationId_provider: { organizationId, provider: "NETWORK" } },
    update: {},
    create: { organizationId, provider: "NETWORK", status: "CONNECTED", scopes: ["discovery"] },
  });
  const since = new Date();
  await persistSyncResult(organizationId, connector.id, { provider: "NETWORK", assets, syncedAt: new Date(), warnings: [] });
  await cleanupCandidateAssets(organizationId).catch(() => 0);
  await recordInventorySnapshot(organizationId);
  // AI appena comparse: webhook "ai.discovered" + messaggio Slack/Teams con i pulsanti (mai bloccante).
  const fresh = await db.aiAsset.findMany({ where: { organizationId, connectorId: connector.id, deletedAt: null, status: "UNKNOWN", createdAt: { gte: since } }, select: { id: true, name: true, vendor: true }, take: 50 });
  if (fresh.length) notifyNewAi(organizationId, fresh);
  return assets.map((a) => a.name);
}

/**
 * Fonte senza il nome del computer: "Desktop app · mario-pc" → "Desktop app",
 * "MARIO-PC" (scanner) → "computer-1a2b3c4d". Log di rete e sensori Edge restano.
 */
export function privateDevice(device: string, host: (h: string) => string): string {
  if (/^(Network log|angar Edge)\b/.test(device) || device === "Browser extension" || device === "Desktop app") return device;
  const i = device.indexOf("·");
  if (i >= 0) return device.slice(0, i).trim().slice(0, 60) || "Device";
  return host(device);
}

/**
 * Token del workspace sempre disponibile (cifrato), così l'estensione si
 * scarica già configurata e il link aziendale funziona senza copiare nulla.
 */
export async function ensureWorkspaceToken(organizationId: string) {
  const { encryptJson, decryptJson } = await import("@/lib/crypto");
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const existing = decryptJson<{ token: string }>(org.discoveryTokenEncrypted)?.token;
  let token = existing;
  const data: Record<string, string> = {};
  if (!token) {
    const t = newDiscoveryToken();
    token = t.token;
    Object.assign(data, { discoveryTokenHash: t.hash, discoveryTokenHint: t.hint, discoveryTokenEncrypted: encryptJson({ token }) });
  }
  let joinCode = org.joinCode;
  if (!joinCode) {
    joinCode = randomBytes(9).toString("base64url");
    data.joinCode = joinCode;
  }
  if (Object.keys(data).length) await db.organization.update({ where: { id: organizationId }, data });
  return { token, joinCode };
}


/**
 * Pulizia dei doppioni già salvati: AI "da rivedere" che in realtà sono il sito
 * del produttore (anthropic.com) o un altro indirizzo di un'AI nota (claude.com),
 * o lo stesso sito due volte (app.foo.ai e foo.ai). Si nascondono (deletedAt).
 */
export async function cleanupCandidateAssets(organizationId: string) {
  const cands = await db.aiAsset.findMany({
    where: { organizationId, deletedAt: null, externalId: { startsWith: "net:cand:" } },
    select: { id: true, externalId: true, status: true },
    orderBy: { createdAt: "asc" },
  });
  const seen = new Set<string>();
  const hide: string[] = [];
  for (const a of cands) {
    const domain = (a.externalId ?? "").slice("net:cand:".length);
    if (a.status === "APPROVED" || a.status === "UNAPPROVED") {
      seen.add(registrable(domain)); // decisa da qualcuno: resta
      continue;
    }
    const r = resolveCandidateDomain(domain);
    const reg = registrable(domain);
    if (r.kind !== "new" || seen.has(reg)) hide.push(a.id);
    else seen.add(reg);
  }
  if (hide.length) await db.aiAsset.updateMany({ where: { id: { in: hide }, organizationId }, data: { deletedAt: new Date() } });
  return hide.length;
}

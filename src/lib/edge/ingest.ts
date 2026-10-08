// Pipeline condivisa da POST /api/edge/report (sensore) e POST /api/edge/logs (log dal cloud):
// valida, applica la privacy lato server, somma gli EdgeEvent, alimenta l'inventario
// (ingestFindings) e crea gli avvisi. Mai URL o contenuti: solo servizio, client, conteggi.
import { isIP } from "net";
import type { EdgeSensor, Organization } from "@prisma/client";
import { db } from "@/lib/db";
import { createAlert } from "@/lib/alerts";
import { ingestFindings, type Finding } from "@/lib/discovery/ingest";
import { displayableRef } from "@/lib/discovery/pseudonym";
import { privacyModeOf, type PrivacyMode } from "@/lib/privacy";
import { edgeService, buildMatcher, CAND_PREFIX } from "./config";
import { parseIp, type EdgeEventIn, type EdgeCandidateIn } from "./parse";

export const LIMITS = { events: 5000, candidates: 500, localModels: 200 };

export interface LocalModelIn {
  ip: string;
  port: number;
  runtime: string;
  models: string[];
}

export interface EdgeBatch {
  events: EdgeEventIn[];
  candidates: EdgeCandidateIn[];
  localModels: LocalModelIn[];
}

type Sensor = EdgeSensor & { organization: Organization };

const catalogMatcher = buildMatcher([]);

const DAY_MS = 86_400_000;
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

/** Giorno valido: formato YYYY-MM-DD, non nel futuro (oltre domani) né più vecchio di 40 giorni. */
export function normDay(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(v + "T00:00:00Z");
  if (!Number.isFinite(t)) return null;
  const now = Date.now();
  if (t > now + DAY_MS || t < now - 40 * DAY_MS) return null;
  return v;
}

const int = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : 0;
};

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
export const validDomain = (d: string) => d.length <= 80 && DOMAIN_RE.test(d);
const SOURCE_RE = /^(dns|scan|(syslog|cloud):[a-z0-9-]{2,20})$/;

/** "*" oppure un IP canonico; in modalità anonima sempre "*". */
function normClient(v: unknown, anonymous: boolean): string | null {
  if (anonymous) return "*";
  if (v === "*") return "*";
  if (typeof v !== "string" || v.length > 64) return null;
  return parseIp(v);
}

const RUNTIME_NAME: Record<string, string> = { ollama: "Ollama", lmstudio: "LM Studio", "lm-studio": "LM Studio" };
export const runtimeName = (r: string) => RUNTIME_NAME[r] ?? r;

/** Valida il corpo di /api/edge/report (i limiti del protocollo: oltre si tronca). */
export function batchFromReport(body: Record<string, unknown>, mode: PrivacyMode): EdgeBatch {
  const anonymous = mode === "anonymous";
  const events: EdgeEventIn[] = [];
  for (const e of (Array.isArray(body.events) ? body.events : []).slice(0, LIMITS.events)) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    const day = normDay(r.day);
    const client = normClient(r.client, anonymous);
    const source = typeof r.source === "string" && SOURCE_RE.test(r.source) ? r.source : null;
    const serviceId = typeof r.serviceId === "string" ? r.serviceId.slice(0, 100) : "";
    const known = edgeService(serviceId) || (serviceId.startsWith("cand:") && validDomain(serviceId.slice(5)));
    if (!day || !client || !source || !known) continue;
    const clientName = !anonymous && typeof r.clientName === "string" && /^[\w.-]{1,64}$/.test(r.clientName) ? r.clientName : null;
    const ev = { day, serviceId, client, clientName, hits: int(r.hits, 10_000_000), bytesUp: int(r.bytesUp, 1e13), blocked: int(r.blocked, 10_000_000), source };
    if (ev.hits || ev.bytesUp || ev.blocked) events.push(ev);
  }
  const candidates: EdgeCandidateIn[] = [];
  for (const c of (Array.isArray(body.candidates) ? body.candidates : []).slice(0, LIMITS.candidates)) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;
    const day = normDay(r.day);
    const client = normClient(r.client, anonymous);
    const domain = typeof r.domain === "string" ? r.domain.toLowerCase().replace(/\.+$/, "") : "";
    const source = typeof r.source === "string" && SOURCE_RE.test(r.source) ? r.source : null;
    if (!day || !client || !source || !validDomain(domain)) continue;
    candidates.push({ day, domain, client, hits: Math.max(1, int(r.hits, 10_000_000)), source });
  }
  const localModels: LocalModelIn[] = [];
  for (const m of (Array.isArray(body.localModels) ? body.localModels : []).slice(0, LIMITS.localModels)) {
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    const ip = typeof r.ip === "string" ? parseIp(r.ip) : null;
    const runtime = typeof r.runtime === "string" && /^[a-z0-9-]{2,20}$/.test(r.runtime) ? r.runtime : null;
    if (!ip || !runtime) continue;
    const models = (Array.isArray(r.models) ? r.models : []).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 80)).slice(0, 50);
    localModels.push({ ip, port: int(r.port, 65535), runtime, models });
  }
  return { events, candidates, localModels };
}

interface Row {
  day: string;
  serviceId: string;
  serviceName: string;
  kind: string;
  client: string;
  clientLabel: string | null;
  email: string | null;
  hits: number;
  bytesUp: number;
  blocked: number;
  source: string;
}

const rowKey = (r: { day: string; serviceId: string; client: string; source: string }) => `${r.day}|${r.serviceId}|${r.client}|${r.source}`;

/** IP → email della persona, dai computer con l'app desktop visti negli ultimi 7 giorni. */
async function emailsByIp(organizationId: string, ips: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const list = [...new Set(ips.filter((ip) => ip !== "*" && isIP(ip)))].slice(0, 2000);
  if (!list.length) return out;
  const devices = await db.desktopDevice.findMany({
    where: { organizationId, email: { not: null }, lastSeenAt: { gte: new Date(Date.now() - 7 * DAY_MS) }, ips: { hasSome: list } },
    orderBy: { lastSeenAt: "desc" },
    select: { ips: true, email: true },
    take: 5000,
  });
  for (const d of devices) for (const ip of d.ips) if (d.email && !out.has(ip)) out.set(ip, d.email);
  return out;
}

export interface ProcessResult {
  rows: number;
  newRows: number;
  alerts: number;
}

/**
 * Somma il batch negli EdgeEvent del sensore, poi inventario e avvisi.
 * La privacy si applica qui di nuovo (il sensore potrebbe essere vecchio o mal configurato).
 */
export async function processEdgeBatch(sensor: Sensor, batch: EdgeBatch): Promise<ProcessResult> {
  const org = sensor.organization;
  const organizationId = org.id;
  const mode = privacyModeOf(org);
  const anonymous = mode === "anonymous";
  const today = utcDay();

  const allIps = [...batch.events.map((e) => e.client), ...batch.candidates.map((c) => c.client), ...batch.localModels.map((m) => m.ip)];
  const ipEmail = anonymous ? new Map<string, string>() : await emailsByIp(organizationId, allIps);
  // Email dal log stesso (Cloudflare, Zscaler, Umbrella…) se c'è, altrimenti dall'IP dell'app desktop.
  const emailOf = (client: string, fromLog?: string | null) => (anonymous ? null : fromLog || (client === "*" ? null : ipEmail.get(client) ?? null));
  // Etichetta visibile solo in modalità "per persona": email (app desktop) o nome host.
  // (Uno pseudonimo p_… non è un nome: non diventa mai un'etichetta.)
  const labelOf = (client: string, name?: string | null, fromLog?: string | null) => (mode === "individual" && client !== "*" ? displayableRef(emailOf(client, fromLog)) ?? name ?? null : null);

  // 1. Righe unificate (eventi, AI candidate, modelli locali), senza doppioni nel batch.
  const rows = new Map<string, Row>();
  const put = (r: Row) => {
    const k = rowKey(r);
    const cur = rows.get(k);
    if (!cur) return void rows.set(k, r);
    cur.hits += r.hits;
    cur.bytesUp += r.bytesUp;
    cur.blocked += r.blocked;
    cur.clientLabel = cur.clientLabel ?? r.clientLabel;
  };
  for (const e of batch.events) {
    const client = anonymous ? "*" : e.client;
    const svc = edgeService(e.serviceId);
    const cand = e.serviceId.startsWith("cand:") ? e.serviceId.slice(5) : null;
    if (!svc && !cand) continue;
    put({
      day: e.day,
      serviceId: e.serviceId,
      serviceName: svc?.name ?? cand!,
      kind: svc?.kind ?? "web",
      client,
      clientLabel: labelOf(client, e.clientName, e.email),
      email: emailOf(client, e.email),
      hits: e.hits,
      bytesUp: e.bytesUp,
      blocked: e.blocked,
      source: e.source,
    });
  }
  for (const c of batch.candidates) {
    const client = anonymous ? "*" : c.client;
    // Nel frattempo il catalogo potrebbe conoscerla: allora è un'AI nota, non una candidata.
    const known = catalogMatcher.service(c.domain);
    if (known) {
      const svc = edgeService(known.serviceId)!;
      put({ day: c.day, serviceId: svc.id, serviceName: svc.name, kind: svc.kind, client, clientLabel: labelOf(client, null, c.email), email: emailOf(client, c.email), hits: c.hits, bytesUp: 0, blocked: 0, source: c.source });
      continue;
    }
    put({ day: c.day, serviceId: `cand:${c.domain}`, serviceName: c.domain, kind: "web", client, clientLabel: labelOf(client, null, c.email), email: emailOf(client, c.email), hits: c.hits, bytesUp: 0, blocked: 0, source: c.source });
  }
  for (const m of batch.localModels) {
    const client = anonymous ? "*" : m.ip;
    put({ day: today, serviceId: `local:${m.runtime}`, serviceName: runtimeName(m.runtime), kind: "local-model", client, clientLabel: labelOf(client), email: emailOf(client), hits: Math.max(1, m.models.length), bytesUp: 0, blocked: 0, source: "scan" });
  }
  const list = [...rows.values()];
  if (!list.length) return { rows: 0, newRows: 0, alerts: 0 };

  // 2. Quali righe sono nuove (primo avvistamento del giorno per quel client/AI/fonte).
  const days = [...new Set(list.map((r) => r.day))];
  const sids = [...new Set(list.map((r) => r.serviceId))];
  const existing = await db.edgeEvent.findMany({
    where: { sensorId: sensor.id, day: { in: days }, serviceId: { in: sids } },
    select: { day: true, serviceId: true, client: true, source: true },
  });
  const seen = new Set(existing.map(rowKey));
  const fresh = list.filter((r) => !seen.has(rowKey(r)));

  // 3. Somma (upsert con incremento), a piccoli gruppi in parallelo.
  for (let i = 0; i < list.length; i += 20) {
    await Promise.all(
      list.slice(i, i + 20).map((r) => {
        const where = { sensorId_day_serviceId_client_source: { sensorId: sensor.id, day: r.day, serviceId: r.serviceId, client: r.client, source: r.source } };
        const update = {
          hits: { increment: r.hits },
          bytesUp: { increment: BigInt(r.bytesUp) },
          blocked: { increment: r.blocked },
          ...(r.clientLabel ? { clientLabel: r.clientLabel.slice(0, 120) } : {}),
        };
        return db.edgeEvent.upsert({
          where,
          create: {
            organizationId,
            sensorId: sensor.id,
            day: r.day,
            serviceId: r.serviceId,
            serviceName: r.serviceName.slice(0, 120),
            kind: r.kind,
            client: r.client,
            clientLabel: r.clientLabel?.slice(0, 120) ?? null,
            hits: r.hits,
            bytesUp: BigInt(r.bytesUp),
            blocked: r.blocked,
            source: r.source,
          },
          update,
        }).catch((err: { code?: string }) => {
          // Due invii in parallelo (es. Logpush) creano la stessa riga: il secondo la aggiorna.
          if (err?.code === "P2002") return db.edgeEvent.update({ where, data: update });
          throw err;
        });
      })
    );
  }

  // 4. Inventario: solo i primi avvistamenti (costo limitato: una volta al giorno per client/AI).
  await feedInventory(organizationId, sensor, fresh).catch((err) => console.error("[edge] inventory", err));

  // 5. Avvisi.
  const alerts = await raiseAlerts(sensor, mode, list, fresh, batch.localModels, today).catch((err) => {
    console.error("[edge] alerts", err);
    return 0;
  });
  return { rows: list.length, newRows: fresh.length, alerts };
}

async function feedInventory(organizationId: string, sensor: { name: string; kind: string }, fresh: Row[]) {
  // Log importati o letti via API (sensore "import"): "network logs", non "angar Edge".
  const imported = sensor.kind === "import";
  const via = (source: string) => (imported ? `network logs ${source}` : `angar Edge ${source}`);
  // Solo ciò che si vede davvero usato (i tentativi bloccati non contano come uso).
  const used = fresh.filter((r) => r.hits > r.blocked || r.kind === "local-model");
  if (!used.length) return;
  const groups = new Map<string, Finding[]>();
  const now = new Date().toISOString();
  const today = utcDay();
  for (const r of used) {
    const lastSeen = r.day === today ? now : `${r.day}T12:00:00.000Z`;
    const hits = Math.max(1, r.hits - r.blocked);
    let f: Finding;
    if (r.kind === "local-model") f = { kind: "app", value: r.serviceName, hits, lastSeen, via: r.client === "*" ? "local models on the network" : `local models on ${r.client}` };
    else if (r.serviceId.startsWith("cand:")) f = { kind: "candidate", value: r.serviceId.slice(5), hits, lastSeen, via: via(r.source) };
    else f = { kind: "env", value: r.serviceId, hits, lastSeen, via: via(r.source) };
    const k = r.email ?? "";
    const g = groups.get(k) ?? [];
    if (g.length < 500) g.push(f);
    groups.set(k, g);
  }
  const device = (imported ? `Network logs · ${sensor.name}` : `angar Edge · ${sensor.name}`).slice(0, 120);
  // Costo limitato: al massimo 50 persone per invio (le altre arrivano al primo avvistamento di domani).
  const entries = [...groups.entries()].sort((a, b) => (a[0] === "" ? -1 : b[0] === "" ? 1 : 0)).slice(0, 51);
  for (const [email, findings] of entries) {
    await ingestFindings(organizationId, device, findings, email || null, "edge");
  }
}

const mb = (bytes: number) => Math.round(bytes / 1_000_000);

async function raiseAlerts(sensor: Sensor, mode: PrivacyMode, rows: Row[], fresh: Row[], localModels: LocalModelIn[], today: string): Promise<number> {
  const org = sensor.organization;
  const organizationId = org.id;
  const people = mode === "individual";
  const who = (r: { client: string; clientLabel: string | null }) => (r.clientLabel ? `${r.clientLabel} (${r.client})` : r.client);
  let created = 0;
  // Al massimo 10 tentativi per tipo di avviso e per invio (i doppioni li scarta dedupeKey).
  const budget: Record<string, number> = {};
  const alert = async (a: Parameters<typeof createAlert>[1]) => {
    const type = a.dedupeKey.split(":")[0];
    if ((budget[type] = (budget[type] ?? 10) - 1) < 0) return;
    if (await createAlert(organizationId, a)) created++;
  };

  // Asset dell'inventario per le AI coinvolte (stato, link).
  const sids = [...new Set(rows.filter((r) => r.kind !== "local-model").map((r) => r.serviceId))];
  const catalogIds = sids.filter((s) => !s.startsWith("cand:"));
  const candExt = sids.filter((s) => s.startsWith("cand:")).map((s) => CAND_PREFIX + s.slice(5));
  const assets = sids.length
    ? await db.aiAsset.findMany({
        where: { organizationId, deletedAt: null, OR: [{ serviceId: { in: catalogIds } }, { externalId: { in: candExt } }] },
        select: { id: true, name: true, status: true, serviceId: true, externalId: true, insteadAssetId: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const assetOf = new Map<string, (typeof assets)[number]>();
  for (const a of assets) {
    const k = a.serviceId && catalogIds.includes(a.serviceId) ? a.serviceId : a.externalId?.startsWith(CAND_PREFIX) ? "cand:" + a.externalId.slice(CAND_PREFIX.length) : null;
    if (k && !assetOf.has(k)) assetOf.set(k, a);
  }
  const hrefOf = (sid: string) => {
    const a = assetOf.get(sid);
    if (a) return `/estate/${a.id}`;
    return `/edge/sensors?view=${sid.startsWith("cand:") ? "new" : edgeService(sid)?.kind === "api" ? "invisible" : "ai"}`;
  };

  // (a) Upload oltre soglia verso un'AI non approvata (somma di oggi, tutte le fonti/sensori).
  const threshold = Math.max(0, org.uploadAlertMb ?? 100) * 1_000_000;
  const up = rows.filter((r) => r.day === today && r.bytesUp > 0 && r.kind !== "local-model" && assetOf.get(r.serviceId)?.status !== "APPROVED");
  if (threshold > 0 && up.length) {
    const sums = await db.edgeEvent.groupBy({
      by: ["serviceId", "client"],
      where: { organizationId, day: today, serviceId: { in: [...new Set(up.map((r) => r.serviceId))] }, client: { in: [...new Set(up.map((r) => r.client))] } },
      _sum: { bytesUp: true },
    });
    for (const s of sums) {
      const bytes = Number(s._sum.bytesUp ?? 0);
      if (bytes <= threshold) continue;
      const r = up.find((x) => x.serviceId === s.serviceId && x.client === s.client);
      if (!r) continue;
      const from = people && r.client !== "*" ? ` from ${who(r)}` : "";
      await alert({
        kind: "policy",
        severity: "critical",
        title: `${mb(bytes)} MB sent to ${r.serviceName}${from}`,
        body: `${mb(bytes)} MB were uploaded to ${r.serviceName} today${people && r.client !== "*" ? ` from ${who(r)}` : " from a device on your network"}, which isn't approved. That can be documents or data leaving the company — check what was shared. (Threshold: ${org.uploadAlertMb} MB/day.)`,
        href: hrefOf(r.serviceId),
        dedupeKey: `edge-upload:${r.serviceId}:${r.client}:${today}`,
      });
    }
  }

  // (b) Nuovo server di modelli AI locali.
  for (const m of localModels) {
    const where = people ? ` on ${m.ip}` : " on your network";
    const models = m.models.slice(0, 5).join(", ");
    await alert({
      kind: "new_ai",
      severity: "warning",
      title: `Local AI model server found: ${runtimeName(m.runtime)}${where}`,
      body: `angar Edge found ${runtimeName(m.runtime)}${where}${models ? ` serving ${models}${m.models.length > 5 ? "…" : ""}` : ""}. Local models run outside any provider's controls — check who uses it and with what data.`,
      href: "/edge/sensors?view=local",
      dedupeKey: `edge-local:${m.runtime}:${mode === "anonymous" ? "*" : m.ip}`,
    });
  }

  // (c) "Invisible AI": chiamate API da un client mai visto prima (script, automazioni, agenti).
  // Solo i primi avvistamenti del giorno: un client già visto oggi non è "nuovo".
  for (const r of fresh.filter((x) => x.kind === "api" && x.hits > x.blocked)) {
    const approved = assetOf.get(r.serviceId)?.status === "APPROVED";
    const from = people && r.client !== "*" ? who(r) : "a device on your network";
    await alert({
      kind: "new_ai",
      severity: approved ? "info" : "warning",
      title: `Invisible AI: ${r.serviceName} API used from ${from}`,
      body: `Calls to the ${r.serviceName} API came from ${from}. Nobody opens a website for this: it's usually a script, an automation or an AI agent — sometimes paid with a personal API key, outside company billing and controls. Find out who runs it.`,
      href: hrefOf(r.serviceId),
      // Senza nomi (privacy per reparto/anonima) un avviso per AI, non uno per dispositivo.
      dedupeKey: people ? `edge-api:${r.serviceId}:${r.client}` : `edge-api:${r.serviceId}`,
    });
  }

  // (d) Tentativi bloccati: un riepilogo al giorno per AI.
  const blocked = new Map<string, { name: string; n: number }>();
  for (const r of rows) if (r.blocked > 0) blocked.set(r.serviceId, { name: r.serviceName, n: (blocked.get(r.serviceId)?.n ?? 0) + r.blocked });
  // Le alternative consigliate ("usa X al posto di Y"): una sola query per tutte.
  const insteadIds = Array.from(new Set(Array.from(blocked.keys()).map((sid) => assetOf.get(sid)?.insteadAssetId).filter((x): x is string => !!x)));
  const insteadById = new Map(
    (insteadIds.length ? await db.aiAsset.findMany({ where: { id: { in: insteadIds }, organizationId, deletedAt: null }, select: { id: true, name: true } }) : []).map((x) => [x.id, x])
  );
  for (const [sid, b] of blocked) {
    const a = assetOf.get(sid);
    const instead = a?.insteadAssetId ? insteadById.get(a.insteadAssetId) ?? null : null;
    await alert({
      kind: "policy",
      severity: "info",
      title: `Blocked on the network: ${b.name}`,
      body: `${sensor.kind === "import" ? `Your network logs show ${b.n} blocked attempt${b.n === 1 ? "" : "s"} to reach ${b.name}.` : `angar Edge blocked ${b.n} attempt${b.n === 1 ? "" : "s"} to reach ${b.name} today.`}${instead ? ` Remind people to use ${instead.name} instead.` : ""}`,
      href: hrefOf(sid),
      dedupeKey: `edge-blocked:${sid}:${today}`,
    });
  }
  return created;
}

/** Aggiorna il sensore dopo un invio (versione, OS, IP, statistiche, ultimo contatto). */
export async function touchSensor(sensor: Sensor, report: { version?: unknown; os?: unknown; hostIp?: unknown; stats?: unknown; localModels?: LocalModelIn[]; logs?: { lines: number; aiLines: number } }) {
  const prev = (sensor.stats && typeof sensor.stats === "object" && !Array.isArray(sensor.stats) ? sensor.stats : {}) as Record<string, unknown>;
  const stats: Record<string, unknown> = {};
  if (report.stats && typeof report.stats === "object") {
    for (const k of ["dnsQueries", "aiQueries", "clients", "blocked", "logLines", "uptimeSec"]) {
      const v = (report.stats as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) stats[k] = Math.min(Math.floor(v), 1e12);
    }
  }
  if (report.logs) Object.assign(stats, { logLines: report.logs.lines, aiQueries: report.logs.aiLines });
  stats.reportedAt = new Date().toISOString();
  // L'ultima scansione LAN resta finché non ne arriva una nuova (avviene ogni 6 ore).
  const anonymous = privacyModeOf(sensor.organization) === "anonymous";
  if (report.localModels && report.localModels.length) {
    stats.localModels = report.localModels.slice(0, 50).map((m) => ({ ip: anonymous ? "*" : m.ip, port: m.port, runtime: m.runtime, models: m.models.slice(0, 20) }));
    stats.localModelsAt = stats.reportedAt;
  } else if (prev.localModels) {
    stats.localModels = prev.localModels;
    stats.localModelsAt = prev.localModelsAt;
  }
  const str = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
  const hostIp = typeof report.hostIp === "string" ? parseIp(report.hostIp) ?? undefined : undefined;
  await db.edgeSensor.update({
    where: { id: sensor.id },
    data: { version: str(report.version, 40), os: str(report.os, 60), hostIp, stats: stats as object, lastSeenAt: new Date() },
  });
}

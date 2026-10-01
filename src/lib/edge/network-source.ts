// Log di rete già presenti in azienda (file caricati, Cloudflare Gateway, Cisco Umbrella)
// passano dalla stessa pipeline di angar Edge: un "sensore" virtuale (kind "import",
// senza token utilizzabile) per fonte, poi processEdgeBatch → EdgeEvent, inventario
// (come "edge.seen", connettore NETWORK) e avvisi. Stessa privacy, stesse pagine.
import type { Organization } from "@prisma/client";
import { db } from "@/lib/db";
import { privacyModeOf } from "@/lib/privacy";
import { pseudonymWith, orgSalt } from "@/lib/discovery/pseudonym";
import { placeholderTokenHash } from "./device-id";
import { blockedFor, buildMatcher } from "./config";
import { LIMITS, processEdgeBatch, touchSensor } from "./ingest";
import type { EdgeCandidateIn, EdgeEventIn, Matcher } from "./parse";
import type { ImportResult } from "./log-import";

/** Fonti dei log importati: chiave stabile (salvata in tokenHint) → nome del sensore. */
export const IMPORT_SOURCES = {
  upload: "Imported network logs",
  CLOUDFLARE_GATEWAY: "Cloudflare Gateway",
  CISCO_UMBRELLA: "Cisco Umbrella",
} as const;
export type ImportSourceKey = keyof typeof IMPORT_SOURCES;

const hintOf = (key: ImportSourceKey) => `import:${key}`;

/** Sensore virtuale della fonte (creato al primo uso). Il token è un segnaposto: nessuno può inviare con esso. */
export async function importSensor(organizationId: string, key: ImportSourceKey) {
  const where = { organizationId, kind: "import", tokenHint: hintOf(key) };
  const found = await db.edgeSensor.findFirst({ where, include: { organization: true } });
  if (found) return found;
  return db.edgeSensor.create({
    data: { ...where, name: IMPORT_SOURCES[key], tokenHash: placeholderTokenHash(), dnsEnabled: false, syslogEnabled: true, blockEnabled: false, scanLan: false },
    include: { organization: true },
  });
}

/** Matcher del catalogo con le AI bloccate dall'azienda (come per i sensori). */
export async function importMatcher(organizationId: string): Promise<Matcher> {
  return buildMatcher(await blockedFor(organizationId));
}

export const isAnonymous = (org: Pick<Organization, "privacyMode"> | null) => privacyModeOf(org) === "anonymous";

export interface IngestSummary {
  rows: number;
  newRows: number;
  alerts: number;
}

/**
 * Manda il risultato aggregato nella pipeline Edge. Le persone note solo per email
 * diventano lo pseudonimo p_… come "client" (mai l'email in chiaro nell'EdgeEvent);
 * l'email passa a parte, e ingestFindings la salva secondo la modalità privacy.
 */
export async function ingestImport(organizationId: string, key: ImportSourceKey, r: ImportResult): Promise<IngestSummary> {
  const sensor = await importSensor(organizationId, key);
  const anonymous = isAnonymous(sensor.organization);
  const salt = r.events.some((e) => e.email) || r.candidates.some((c) => c.email) ? await orgSalt(organizationId) : "";
  const clientOf = (client: string, email: string | null) => (anonymous ? "*" : email ? pseudonymWith(salt, email) : client || "*");

  const events: EdgeEventIn[] = r.events
    .map((e) => ({
      day: e.day,
      serviceId: e.serviceId,
      kind: e.kind,
      client: clientOf(e.client, e.email),
      clientName: anonymous ? null : e.clientName ?? null,
      email: anonymous ? null : e.email,
      hits: e.hits,
      bytesUp: e.bytesUp,
      blocked: e.blocked,
      source: e.source,
    }))
    // Stessa persona/dispositivo nello stesso invio: l'inventario la riceve tutta insieme.
    .sort((a, b) => (a.client < b.client ? -1 : a.client > b.client ? 1 : a.day < b.day ? -1 : 1))
    .slice(0, 50_000);
  const candidates: EdgeCandidateIn[] = r.candidates
    .map((c) => ({ day: c.day, domain: c.domain, client: clientOf(c.client, c.email), email: anonymous ? null : c.email, hits: c.hits, source: c.source }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 1000);

  const total: IngestSummary = { rows: 0, newRows: 0, alerts: 0 };
  const chunks = Math.max(1, Math.ceil(events.length / LIMITS.events));
  for (let i = 0; i < chunks; i++) {
    const res = await processEdgeBatch(sensor, {
      events: events.slice(i * LIMITS.events, (i + 1) * LIMITS.events),
      candidates: i === 0 ? candidates : [],
      localModels: [],
    });
    total.rows += res.rows;
    total.newRows += res.newRows;
    total.alerts += res.alerts;
  }
  await touchSensor(sensor, { logs: { lines: r.lines, aiLines: r.aiLines } });
  return total;
}

/**
 * Ticket automatici in Jira (Cloud, REST v3) o ServiceNow (Table API, incident)
 * per gli avvisi importanti: AI non consentita in uso ("policy"), anomalie
 * ("anomaly"), chiavi finite in chiaro ("secret"), con gravità warning/critical.
 *
 * - Credenziali nel Connector (JIRA / SERVICENOW), cifrate con crypto.ts.
 * - Un ticket per avviso: createAlert chiama qui solo per un avviso NUOVO
 *   (vincolo unico su dedupeKey); in più il ticket porta un riferimento
 *   derivato dalla dedupeKey (etichetta Jira / correlation_id ServiceNow) che
 *   si cerca prima di crearne un altro (riavvii, due istanze).
 * - Non configurato = nessuna operazione. Mai un errore verso chi chiama.
 * - Solo host Atlassian Cloud / ServiceNow: niente richieste verso URL arbitrari.
 */
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { audit } from "@/lib/audit";

export type TicketProvider = "JIRA" | "SERVICENOW";
export const TICKET_PROVIDERS: TicketProvider[] = ["JIRA", "SERVICENOW"];
export const TICKET_KINDS = ["policy", "anomaly", "secret"] as const;
export const TICKET_SEVERITIES = ["warning", "critical"] as const;
const TIMEOUT_MS = 10_000;

export interface JiraConfig {
  site: string; // https://acme.atlassian.net
  email: string;
  apiToken: string;
  projectKey: string;
  issueType?: string; // default "Task"
}
export interface ServiceNowConfig {
  instance: string; // https://acme.service-now.com
  /** Vuoto con un token OAuth: si usa "Bearer". */
  user: string;
  secret: string; // password o token
  assignmentGroup?: string;
}

export interface TicketAlert {
  kind: string;
  severity: string;
  title: string;
  body: string;
  /** URL completo in angar (o null). */
  url: string | null;
  dedupeKey: string;
}

export type TicketResult = { ok: true; key: string; url: string; existing?: boolean } | { ok: false; error: string };

// ── Funzioni pure ─────────────────────────────────────────────────────────

export function shouldTicket(a: Pick<TicketAlert, "kind" | "severity">) {
  return (TICKET_KINDS as readonly string[]).includes(a.kind) && (TICKET_SEVERITIES as readonly string[]).includes(a.severity);
}

/** Riferimento stabile di un avviso, valido come etichetta Jira (niente spazi) e correlation_id. */
export function ticketRef(dedupeKey: string) {
  return "angar-" + createHash("sha256").update(dedupeKey).digest("hex").slice(0, 16);
}

/** https://<nome>.atlassian.net (Jira Cloud) o null. */
export function normaliseJiraSite(raw: string): string | null {
  const v = raw.trim().replace(/\/+$/, "");
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    const host = u.hostname.toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$/.test(host)) return null;
    return `https://${host}`;
  } catch {
    return null;
  }
}

/** https://<nome>.service-now.com (anche servicenowservices.com) o null. */
export function normaliseServiceNowInstance(raw: string): string | null {
  const v = raw.trim().replace(/\/+$/, "");
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    const host = u.hostname.toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,62}\.(service-now\.com|servicenowservices\.com)$/.test(host)) return null;
    return `https://${host}`;
  } catch {
    return null;
  }
}

export const isProjectKey = (k: string) => /^[A-Z][A-Z0-9_]{1,19}$/.test(k);

const KIND_LABEL: Record<string, string> = { policy: "AI not allowed in use", anomaly: "Spend anomaly", secret: "Leaked AI key", opportunity: "Opportunity", request: "AI system request", access: "App access" };

function summaryOf(a: TicketAlert) {
  return `[angar] ${a.title}`.replace(/[\r\n]+/g, " ").slice(0, 250);
}

/** Corpo del ticket Jira (REST v3: descrizione in Atlassian Document Format). */
export function jiraIssuePayload(cfg: Pick<JiraConfig, "projectKey" | "issueType">, a: TicketAlert) {
  const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
  const content: unknown[] = [para(a.body.slice(0, 3000)), para(`Type: ${KIND_LABEL[a.kind] ?? a.kind} · Severity: ${a.severity}`)];
  if (a.url) content.push({ type: "paragraph", content: [{ type: "text", text: "Open in angar", marks: [{ type: "link", attrs: { href: a.url } }] }] });
  content.push(para(`Reference: ${ticketRef(a.dedupeKey)} (created automatically by angar)`));
  return {
    fields: {
      project: { key: cfg.projectKey },
      issuetype: { name: cfg.issueType || "Task" },
      summary: summaryOf(a),
      labels: ["angar", `angar-${a.kind}`.replace(/[^a-zA-Z0-9_-]/g, ""), ticketRef(a.dedupeKey)],
      description: { type: "doc", version: 1, content },
    },
  };
}

/** Corpo dell'incident ServiceNow (Table API). urgency/impact: 1 alto … 3 basso. */
export function serviceNowIncidentPayload(cfg: Pick<ServiceNowConfig, "assignmentGroup">, a: TicketAlert) {
  const critical = a.severity === "critical";
  return {
    short_description: summaryOf(a).slice(0, 160),
    description: [a.body.slice(0, 3000), "", `Type: ${KIND_LABEL[a.kind] ?? a.kind} · Severity: ${a.severity}`, a.url ? `Open in angar: ${a.url}` : null, "Created automatically by angar."].filter((x) => x !== null).join("\n"),
    urgency: critical ? "1" : "2",
    impact: critical ? "2" : "3",
    correlation_id: ticketRef(a.dedupeKey),
    correlation_display: "angar",
    ...(cfg.assignmentGroup ? { assignment_group: cfg.assignmentGroup } : {}),
  };
}

export const jiraAuth = (c: Pick<JiraConfig, "email" | "apiToken">) => "Basic " + Buffer.from(`${c.email}:${c.apiToken}`).toString("base64");
export const serviceNowAuth = (c: Pick<ServiceNowConfig, "user" | "secret">) => (c.user ? "Basic " + Buffer.from(`${c.user}:${c.secret}`).toString("base64") : `Bearer ${c.secret}`);

// ── Chiamate ─────────────────────────────────────────────────────────────

async function call(url: string, init: { method: string; auth: string; body?: unknown }) {
  const r = await fetch(url, {
    method: init.method,
    headers: { Authorization: init.auth, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), "User-Agent": "angar-ticketing/1" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const text = await r.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // risposta non JSON (pagina di login, errore del proxy…)
  }
  return { status: r.status, ok: r.ok, json, text };
}

const httpError = (who: string, status: number, json: unknown, text: string) => {
  if (status === 401 || status === 403) return `${who} refused the credentials (${status}). Check the user and token and that they can create tickets.`;
  const j = json as { errorMessages?: string[]; errors?: Record<string, string>; error?: { message?: string; detail?: string } } | null;
  const msg = j?.errorMessages?.[0] ?? (j?.errors ? Object.values(j.errors)[0] : undefined) ?? j?.error?.message ?? j?.error?.detail ?? text.slice(0, 160);
  return `${who} answered ${status}${msg ? `: ${String(msg).slice(0, 200)}` : ""}`;
};

/** Credenziali e progetto validi (al salvataggio). */
export async function checkJira(cfg: JiraConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r = await call(`${cfg.site}/rest/api/3/project/${encodeURIComponent(cfg.projectKey)}`, { method: "GET", auth: jiraAuth(cfg) });
    if (r.status === 404) return { ok: false, error: `Project ${cfg.projectKey} wasn't found, or this user can't see it.` };
    return r.ok ? { ok: true } : { ok: false, error: httpError("Jira", r.status, r.json, r.text) };
  } catch (err) {
    return { ok: false, error: `Couldn't reach Jira: ${(err as Error).message.slice(0, 120)}` };
  }
}

export async function checkServiceNow(cfg: ServiceNowConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r = await call(`${cfg.instance}/api/now/table/incident?sysparm_limit=1&sysparm_fields=sys_id`, { method: "GET", auth: serviceNowAuth(cfg) });
    return r.ok ? { ok: true } : { ok: false, error: httpError("ServiceNow", r.status, r.json, r.text) };
  } catch (err) {
    return { ok: false, error: `Couldn't reach ServiceNow: ${(err as Error).message.slice(0, 120)}` };
  }
}

export async function createJiraIssue(cfg: JiraConfig, a: TicketAlert, opts: { dedupe: boolean }): Promise<TicketResult> {
  const auth = jiraAuth(cfg);
  if (opts.dedupe) {
    // Già aperto (stessa etichetta)? Se la ricerca fallisce si crea comunque.
    const found = await call(`${cfg.site}/rest/api/3/search/jql`, { method: "POST", auth, body: { jql: `labels = "${ticketRef(a.dedupeKey)}"`, maxResults: 1, fields: ["key"] } }).catch(() => null);
    const key = (found?.json as { issues?: { key?: string }[] } | null)?.issues?.[0]?.key;
    if (found?.ok && key) return { ok: true, key, url: `${cfg.site}/browse/${key}`, existing: true };
  }
  const r = await call(`${cfg.site}/rest/api/3/issue`, { method: "POST", auth, body: jiraIssuePayload(cfg, a) });
  const key = (r.json as { key?: string } | null)?.key;
  if (!r.ok || !key) return { ok: false, error: httpError("Jira", r.status, r.json, r.text) };
  return { ok: true, key, url: `${cfg.site}/browse/${key}` };
}

export async function createServiceNowIncident(cfg: ServiceNowConfig, a: TicketAlert, opts: { dedupe: boolean }): Promise<TicketResult> {
  const auth = serviceNowAuth(cfg);
  const link = (sysId: string) => `${cfg.instance}/nav_to.do?uri=${encodeURIComponent(`incident.do?sys_id=${sysId}`)}`;
  if (opts.dedupe) {
    const q = encodeURIComponent(`correlation_id=${ticketRef(a.dedupeKey)}`);
    const found = await call(`${cfg.instance}/api/now/table/incident?sysparm_query=${q}&sysparm_limit=1&sysparm_fields=number,sys_id`, { method: "GET", auth }).catch(() => null);
    const hit = (found?.json as { result?: { number?: string; sys_id?: string }[] } | null)?.result?.[0];
    if (found?.ok && hit?.number && hit.sys_id) return { ok: true, key: hit.number, url: link(hit.sys_id), existing: true };
  }
  // Valori leggibili (es. il nome del gruppo di assegnazione) accettati come tali.
  const r = await call(`${cfg.instance}/api/now/table/incident?sysparm_input_display_value=true&sysparm_fields=number,sys_id`, { method: "POST", auth, body: serviceNowIncidentPayload(cfg, a) });
  const res = (r.json as { result?: { number?: string; sys_id?: string } } | null)?.result;
  if (!r.ok || !res?.number || !res.sys_id) return { ok: false, error: httpError("ServiceNow", r.status, r.json, r.text) };
  return { ok: true, key: res.number, url: link(res.sys_id) };
}

// ── Dal database ─────────────────────────────────────────────────────────

type Row = { id: string; provider: TicketProvider; credentialsEncrypted: string | null };

function configOf(row: Row): JiraConfig | ServiceNowConfig | null {
  if (row.provider === "JIRA") {
    const c = decryptJson<JiraConfig>(row.credentialsEncrypted);
    const site = c ? normaliseJiraSite(c.site) : null;
    return c && site && c.email && c.apiToken && isProjectKey(c.projectKey) ? { ...c, site } : null;
  }
  const c = decryptJson<ServiceNowConfig>(row.credentialsEncrypted);
  const instance = c ? normaliseServiceNowInstance(c.instance) : null;
  return c && instance && c.secret ? { ...c, instance } : null;
}

async function openWith(row: Row, a: TicketAlert, dedupe: boolean): Promise<TicketResult> {
  const cfg = configOf(row);
  if (!cfg) return { ok: false, error: "The saved settings can't be read — connect again." };
  try {
    return row.provider === "JIRA" ? await createJiraIssue(cfg as JiraConfig, a, { dedupe }) : await createServiceNowIncident(cfg as ServiceNowConfig, a, { dedupe });
  } catch (err) {
    return { ok: false, error: (err as Error).name === "TimeoutError" ? "No answer in 10 seconds." : (err as Error).message.slice(0, 160) };
  }
}

async function record(row: Row, orgId: string, r: TicketResult, a: TicketAlert, action: string) {
  await db.connector
    .update({ where: { id: row.id }, data: r.ok ? { lastSyncedAt: new Date(), lastSyncError: null } : { lastSyncError: r.error.slice(0, 500) } })
    .catch(() => {});
  await audit(action, r.ok ? r.key : a.title.slice(0, 120), { provider: row.provider, kind: a.kind, severity: a.severity, ok: r.ok, ...(r.ok ? { existing: !!r.existing } : { error: r.error.slice(0, 200) }) }, { orgId, actorEmail: null });
}

// Stesso avviso in volo due volte nello stesso processo: si apre un ticket solo.
const inflight = new Set<string>();

/**
 * Chiamata da createAlert dopo un avviso nuovo. No-op se il tipo non merita un
 * ticket o se né Jira né ServiceNow sono collegati. Non lancia mai.
 */
export async function ticketForAlert(organizationId: string, a: TicketAlert): Promise<void> {
  try {
    if (!shouldTicket(a)) return;
    const rows = (await db.connector.findMany({
      where: { organizationId, provider: { in: TICKET_PROVIDERS }, status: "CONNECTED", credentialsEncrypted: { not: null } },
      select: { id: true, provider: true, credentialsEncrypted: true },
    })) as Row[];
    for (const row of rows) {
      const k = `${organizationId}:${row.provider}:${a.dedupeKey}`;
      if (inflight.has(k)) continue;
      inflight.add(k);
      try {
        const r = await openWith(row, a, true);
        await record(row, organizationId, r, a, r.ok ? "ticket.created" : "ticket.failed");
      } finally {
        inflight.delete(k);
      }
    }
  } catch (err) {
    console.error("[ticketing] failed", organizationId, err);
  }
}

/** "Send test ticket" dalle impostazioni: senza ricerca dei doppioni. */
export async function sendTestTicket(organizationId: string, provider: TicketProvider, appUrl: string, actorEmail: string): Promise<TicketResult> {
  const row = (await db.connector.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
    select: { id: true, provider: true, credentialsEncrypted: true },
  })) as Row | null;
  if (!row?.credentialsEncrypted) return { ok: false, error: `${provider === "JIRA" ? "Jira" : "ServiceNow"} isn't connected.` };
  const a: TicketAlert = {
    kind: "anomaly",
    severity: "warning",
    title: "Test ticket — angar is connected",
    body: `This is a test from angar, sent by ${actorEmail}. From now on angar opens a ticket here for AI that isn't allowed but is still used, spend anomalies and leaked AI keys (warning or critical). You can close this one.`,
    url: `${appUrl}/alerts`,
    dedupeKey: `ticket-test:${Date.now()}`,
  };
  const r = await openWith(row, a, false);
  await record(row, organizationId, r, a, "ticket.test");
  return r;
}

// ── Eventi dalle pagine (Opportunities "Act", richieste, accessi) ───────────

/** Strumento di ticketing collegato (il primo: Jira prima di ServiceNow), o null. */
export async function connectedTicketing(organizationId: string): Promise<{ provider: TicketProvider; label: string } | null> {
  const rows = await db.connector
    .findMany({ where: { organizationId, provider: { in: TICKET_PROVIDERS }, status: "CONNECTED", credentialsEncrypted: { not: null } }, select: { provider: true } })
    .catch(() => [] as { provider: string }[]);
  const p = (TICKET_PROVIDERS as string[]).find((x) => rows.some((r) => r.provider === x)) as TicketProvider | undefined;
  return p ? { provider: p, label: p === "JIRA" ? "Jira" : "ServiceNow" } : null;
}

export interface TicketEvent {
  /** "opportunity" | "request" | "access" | … (va nel tipo del ticket). */
  kind: string;
  title: string;
  body: string;
  /** URL completo in angar (o null). */
  url: string | null;
  /** Stessa chiave → stesso ticket (si cerca prima di crearne un altro). */
  dedupeKey: string;
  severity?: "warning" | "critical";
}

/**
 * Ticket su richiesta di una persona (es. "Act → Create a ticket" in Opportunities), senza il
 * filtro di shouldTicket. Cerca prima un ticket con lo stesso riferimento, così due clic non
 * aprono due ticket. Non lancia mai; l'esito finisce nel registro di audit.
 */
export async function ticketForEvent(organizationId: string, e: TicketEvent, actorEmail: string | null): Promise<TicketResult & { provider?: TicketProvider }> {
  try {
    const tool = await connectedTicketing(organizationId);
    if (!tool) return { ok: false, error: "Connect Jira or ServiceNow first (Settings → Integrations)." };
    const row = (await db.connector.findUnique({
      where: { organizationId_provider: { organizationId, provider: tool.provider } },
      select: { id: true, provider: true, credentialsEncrypted: true },
    })) as Row | null;
    if (!row?.credentialsEncrypted) return { ok: false, error: `${tool.label} isn't connected.` };
    const a: TicketAlert = { kind: e.kind, severity: e.severity ?? "warning", title: e.title, body: e.body, url: e.url, dedupeKey: e.dedupeKey.slice(0, 300) };
    const k = `${organizationId}:${row.provider}:${a.dedupeKey}`;
    if (inflight.has(k)) return { ok: false, error: "A ticket for this is being created — try again in a moment." };
    inflight.add(k);
    try {
      const r = await openWith(row, a, true);
      const res = await db.connector
        .update({ where: { id: row.id }, data: r.ok ? { lastSyncedAt: new Date(), lastSyncError: null } : { lastSyncError: r.error.slice(0, 500) } })
        .then(() => r)
        .catch(() => r);
      await audit(r.ok ? "ticket.created" : "ticket.failed", r.ok ? r.key : a.title.slice(0, 120), { provider: row.provider, kind: a.kind, ok: r.ok, ...(r.ok ? { existing: !!r.existing } : { error: r.error.slice(0, 200) }) }, { orgId: organizationId, actorEmail });
      return { ...res, provider: row.provider };
    } finally {
      inflight.delete(k);
    }
  } catch (err) {
    console.error("[ticketing] event failed", organizationId, (err as Error).message);
    return { ok: false, error: "The ticket couldn't be created." };
  }
}

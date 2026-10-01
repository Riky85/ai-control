/**
 * Storico email dei servizi AI (Microsoft 365 e Google Workspace).
 *
 * Al collegamento e poi ogni giorno si cercano, in ogni casella aziendale, i
 * messaggi dei mittenti dei servizi AI (discovery/email-senders.ts) degli
 * ultimi 24 mesi: iscrizioni, accessi, ricevute. Si leggono SOLO mittente,
 * data e oggetto; l'oggetto serve in memoria a capire il tipo di messaggio e
 * non viene mai salvato. Il testo non viene mai chiesto al provider.
 *
 * Si salva solo: servizio, persona (pseudonimo nella riga EmailHistory; nel
 * modello d'uso la stessa privacy degli altri connettori), prima e ultima data,
 * conteggi per tipo. Idempotente: ogni casella ha un cursore (scannedUntil) e i
 * messaggi già contati non si contano di nuovo.
 *
 * Microsoft: permesso applicativo Mail.ReadBasic.All (niente corpo del messaggio).
 * Google: delega a livello di dominio all'account di servizio di angar
 * (GOOGLE_SERVICE_ACCOUNT_JSON) con lo scope gmail.readonly — gmail.metadata
 * non permette la ricerca (q) — e si chiede sempre format=metadata.
 */
import { createSign } from "crypto";
import { Prisma, type Connector as ConnectorRow, type ConnectorProvider } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { AI_SERVICES } from "@/lib/discovery/catalog";
import { classifyEmail, searchTerms, chunk, graphKql, gmailQuery, SIGNAL_KINDS, type SignalKind } from "@/lib/discovery/email-senders";
import { identitiesFor, orgSalt, pseudonymWith } from "@/lib/discovery/pseudonym";
import { persistSyncResult } from "./upsert";
import { msToken } from "./microsoft365";
import { googleAccessToken } from "./google-workspace";
import type { ObservedAsset } from "./types";

export const EMAIL_WINDOW_MONTHS = 24;
/** Tempo massimo di una scansione: il resto riprende al giro successivo (ogni ora). */
const RUN_BUDGET_MS = 4 * 60_000;
const SLICE_MONTHS = 3;
const TERMS_PER_QUERY = 12;
const MAX_PAGES = 8;

export const MS_MAIL_PERMISSION = "Mail.ReadBasic.All";
export const GOOGLE_MAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

// ── Tipi ────────────────────────────────────────────────────────────────────

export interface ServiceSignal {
  first: string; // ISO
  last: string; // ISO
  signup: number;
  login: number;
  billing: number;
  other: number;
}
export type Signals = Record<string, ServiceSignal>;

/** Messaggio letto dal provider: l'oggetto resta solo in memoria. */
export interface RawMessage {
  from: string;
  subject?: string | null;
  receivedAt: Date;
}

export interface Mailbox {
  /** id nativo (Graph) o indirizzo (Gmail) usato per le chiamate. */
  id: string;
  email: string;
  name?: string;
  department?: string;
}

export class PermissionError extends Error {}
export class NoMailboxError extends Error {}
export class BudgetError extends Error {}

export interface MailSource {
  listMailboxes(): Promise<Mailbox[]>;
  fetch(mb: Mailbox, after: Date, until: Date, deadline: number): Promise<RawMessage[]>;
}

export interface HistoryRow {
  personRef: string;
  scannedUntil: Date | null;
  signals: Signals;
}

/** Dove stanno le righe EmailHistory (database in produzione, memoria nelle prove). */
export interface HistoryStore {
  rows(): Promise<HistoryRow[]>;
  save(personRef: string, scannedUntil: Date, signals: Signals): Promise<void>;
}

export interface PersonDelta {
  mailbox: Mailbox;
  personRef: string;
  /** Solo i messaggi nuovi di questo giro. */
  delta: Signals;
  /** Totale della persona dopo questo giro. */
  total: Signals;
}

export type EmailScanStatus = "ok" | "partial" | "needs_permission" | "unavailable" | "error";

export interface EmailScanState {
  status: EmailScanStatus;
  lastRunAt: string;
  /** Ultima scansione completa di tutte le caselle (allora i 24 mesi sono coperti). */
  completedAt?: string;
  mailboxes: number;
  done: number;
  services: number;
  message?: string;
}

// ── Funzioni pure ─────────────────────────────────────────────────────────

export function windowStart(now: Date, months = EMAIL_WINDOW_MONTHS) {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/** Fette di tempo (3 mesi) dalla più vecchia: ogni fetta finita fa avanzare il cursore. */
export function timeSlices(after: Date, until: Date, months = SLICE_MONTHS): { after: Date; until: Date }[] {
  const out: { after: Date; until: Date }[] = [];
  let cur = new Date(after);
  while (cur < until) {
    const next = new Date(cur);
    next.setUTCMonth(next.getUTCMonth() + months);
    const end = next < until ? next : new Date(until);
    out.push({ after: cur, until: end });
    cur = end;
  }
  return out;
}

const minIso = (a: string, b: string) => (a < b ? a : b);
const maxIso = (a: string, b: string) => (a > b ? a : b);

function addOne(signals: Signals, service: string, kind: SignalKind, at: Date) {
  const iso = at.toISOString();
  const cur = signals[service] ?? { first: iso, last: iso, signup: 0, login: 0, billing: 0, other: 0 };
  cur.first = minIso(cur.first, iso);
  cur.last = maxIso(cur.last, iso);
  cur[kind] += 1;
  signals[service] = cur;
}

/**
 * Messaggi → segnali, solo quelli ricevuti in (after, until]. L'oggetto si usa
 * qui per il tipo e poi si butta: nel risultato ci sono solo servizio, date, conteggi.
 */
export function foldMessages(messages: RawMessage[], after: Date, until: Date): Signals {
  const out: Signals = {};
  for (const m of messages) {
    const t = m.receivedAt;
    if (!(t instanceof Date) || isNaN(t.getTime()) || t <= after || t > until) continue;
    const c = classifyEmail(m.from, m.subject);
    if (c) addOne(out, c.service, c.kind, t);
  }
  return out;
}

/** Somma due insiemi di segnali (messaggi diversi: il cursore evita i doppioni). */
export function addSignals(a: Signals, b: Signals): Signals {
  const out: Signals = JSON.parse(JSON.stringify(a ?? {}));
  for (const [svc, s] of Object.entries(b ?? {})) {
    const cur = out[svc];
    if (!cur) {
      out[svc] = { ...s };
      continue;
    }
    cur.first = minIso(cur.first, s.first);
    cur.last = maxIso(cur.last, s.last);
    for (const k of SIGNAL_KINDS) cur[k] += s[k];
  }
  return out;
}

/** Prima e ultima data di ogni servizio su tutte le righe. */
export function aggregateServices(rows: { signals: Signals }[]): Map<string, { first: string; last: string; people: number; billing: number }> {
  const out = new Map<string, { first: string; last: string; people: number; billing: number }>();
  for (const r of rows) {
    for (const [svc, s] of Object.entries(r.signals ?? {})) {
      const cur = out.get(svc);
      if (!cur) out.set(svc, { first: s.first, last: s.last, people: 1, billing: s.billing });
      else {
        cur.first = minIso(cur.first, s.first);
        cur.last = maxIso(cur.last, s.last);
        cur.people += 1;
        cur.billing += s.billing;
      }
    }
  }
  return out;
}

/**
 * Scansione delle caselle: per ognuna, dal cursore (o da 24 mesi fa) a `now`,
 * a fette di 3 mesi. Si salva dopo ogni fetta, così un'interruzione (tempo
 * finito, riavvio) non conta mai due volte lo stesso messaggio.
 */
export async function scanMailboxes(
  source: MailSource,
  store: HistoryStore,
  opts: { ref: (email: string) => string; now: Date; deadline: number; concurrency?: number; windowMonths?: number }
): Promise<{ status: EmailScanStatus; mailboxes: number; done: number; changed: PersonDelta[]; message?: string }> {
  const mailboxes = await source.listMailboxes();
  const rows = new Map((await store.rows()).map((r) => [r.personRef, r]));
  const start = windowStart(opts.now, opts.windowMonths);
  // Prima le caselle mai lette o più indietro: un giro interrotto riprende da lì.
  const queue = mailboxes
    .map((mb) => ({ mb, ref: opts.ref(mb.email) }))
    .map((x) => ({ ...x, row: rows.get(x.ref) }))
    .sort((a, b) => (a.row?.scannedUntil?.getTime() ?? 0) - (b.row?.scannedUntil?.getTime() ?? 0));

  // Stato condiviso tra i lavoratori paralleli.
  const st = { permission: "unknown" as "unknown" | "ok" | "denied", partial: false, stop: false, done: 0, failed: 0, lastError: undefined as string | undefined };
  const changed = new Map<string, PersonDelta>();

  const one = async (item: (typeof queue)[number]) => {
    const { mb, ref, row } = item;
    const cursor = row?.scannedUntil && row.scannedUntil > start ? row.scannedUntil : start;
    let total: Signals = row?.signals ?? {};
    try {
      for (const slice of timeSlices(cursor, opts.now)) {
        if (Date.now() > opts.deadline) throw new BudgetError("time budget");
        const msgs = await source.fetch(mb, slice.after, slice.until, opts.deadline);
        st.permission = "ok";
        const delta = foldMessages(msgs, slice.after, slice.until);
        total = addSignals(total, delta);
        await store.save(ref, slice.until, total);
        if (Object.keys(delta).length) {
          const prev = changed.get(ref);
          changed.set(ref, { mailbox: mb, personRef: ref, delta: addSignals(prev?.delta ?? {}, delta), total });
        }
      }
      st.done++;
    } catch (err) {
      if (err instanceof PermissionError) {
        // Nessuna casella letta: manca il permesso. Altrimenti è solo questa casella.
        if (st.permission !== "ok") {
          st.permission = "denied";
          st.stop = true;
        } else st.failed++;
      } else if (err instanceof NoMailboxError) {
        st.done++; // utente senza casella di posta: niente da leggere
      } else if (err instanceof BudgetError) {
        st.partial = true;
        st.stop = true;
      } else {
        st.failed++;
        st.lastError = (err as Error).message.slice(0, 200);
      }
    }
  };

  // Finché non si sa se il permesso c'è, una casella alla volta; poi in parallelo.
  while (queue.length && !st.stop && st.permission === "unknown") await one(queue.shift()!);
  const worker = async () => {
    while (queue.length && !st.stop) {
      if (Date.now() > opts.deadline) {
        st.partial = true;
        st.stop = true;
        break;
      }
      await one(queue.shift()!);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 4) }, worker));
  if (queue.length && !st.stop) st.partial = true;

  const status: EmailScanStatus =
    st.permission === "denied" ? "needs_permission" : st.partial ? "partial" : st.failed > 0 && st.done === 0 ? "error" : "ok";
  return { status, mailboxes: mailboxes.length, done: st.done, changed: [...changed.values()], message: st.failed ? st.lastError : undefined };
}

// ── Chiamate HTTP con limiti (429 Retry-After) e tempo massimo ────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryAfterMs(header: string | null, attempt: number) {
  const s = Number(header);
  if (Number.isFinite(s) && s > 0) return Math.min(s, 120) * 1000;
  const at = header ? Date.parse(header) : NaN;
  if (Number.isFinite(at)) return Math.max(0, Math.min(at - Date.now(), 120_000));
  return Math.min(2 ** attempt * 1000, 30_000);
}

async function getJson(url: string, token: string, deadline: number): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    if (Date.now() > deadline) throw new BudgetError("time budget");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (res.ok) return res.json();
    const text = await res.text().catch(() => "");
    const throttled = res.status === 429 || res.status === 503 || res.status === 504 || (res.status === 403 && /rateLimitExceeded|userRateLimitExceeded/i.test(text));
    if (throttled) {
      if (attempt >= 4) throw new Error(`Throttled (${res.status}) after ${attempt + 1} tries`);
      const wait = retryAfterMs(res.headers.get("retry-after"), attempt);
      if (Date.now() + wait > deadline) throw new BudgetError("throttled past the time budget");
      await sleep(wait);
      continue;
    }
    if (/MailboxNotEnabledForRESTAPI|MailboxNotFound|ResourceNotFound|ErrorInvalidUser|failedPrecondition|Mail service not enabled/i.test(text) || res.status === 404) throw new NoMailboxError(text.slice(0, 160));
    if (res.status === 401 || res.status === 403 || /metadata scope/i.test(text)) throw new PermissionError(text.slice(0, 200));
    throw new Error(`${res.status} ${text.slice(0, 160)}`);
  }
}

// ── Microsoft Graph (Mail.ReadBasic.All) ─────────────────────────────────

const GRAPH = "https://graph.microsoft.com/v1.0";

export function graphMailSource(token: string): MailSource {
  const groups = chunk(searchTerms(), TERMS_PER_QUERY);
  return {
    async listMailboxes() {
      const out: Mailbox[] = [];
      let next: string | undefined = `${GRAPH}/users?$select=id,mail,userPrincipalName,displayName,department,accountEnabled&$top=999`;
      for (let i = 0; next && i < 50; i++) {
        const page: any = await getJson(next, token, Date.now() + 120_000);
        for (const u of page.value ?? []) {
          // Solo account attivi con una casella (mail valorizzato).
          if (u.accountEnabled === false || !u.mail) continue;
          out.push({ id: u.id, email: String(u.mail).toLowerCase(), name: u.displayName ?? undefined, department: u.department ?? undefined });
        }
        next = page["@odata.nextLink"];
      }
      return out;
    },
    async fetch(mb, after, until, deadline) {
      const out: RawMessage[] = [];
      // Lo stesso messaggio può rispondere a due gruppi di ricerca (openai.com e tm.openai.com): si conta una volta.
      const seen = new Set<string>();
      for (const terms of groups) {
        const search = `"${graphKql(terms, after, until)}"`;
        // Solo mittente, data e oggetto: mai body, bodyPreview o allegati.
        let next: string | undefined = `${GRAPH}/users/${encodeURIComponent(mb.id)}/messages?$search=${encodeURIComponent(search)}&$select=from,receivedDateTime,subject&$top=250`;
        for (let i = 0; next && i < MAX_PAGES; i++) {
          const page: any = await getJson(next, token, deadline);
          for (const m of page.value ?? []) {
            if (m.id) {
              if (seen.has(m.id)) continue;
              seen.add(m.id);
            }
            out.push({ from: m.from?.emailAddress?.address ?? "", subject: m.subject ?? null, receivedAt: new Date(m.receivedDateTime) });
          }
          next = page["@odata.nextLink"];
        }
      }
      return out;
    },
  };
}

// ── Google (delega a livello di dominio, gmail.readonly, format=metadata) ──

interface ServiceAccount {
  client_email: string;
  private_key: string;
  client_id?: string;
}

export function googleServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    if (!sa.client_email || !sa.private_key) return null;
    return { ...sa, private_key: sa.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

/** Token per leggere la casella `subject` (JWT firmato dall'account di servizio di angar). */
async function delegatedToken(sa: ServiceAccount, subject: string, deadline: number): Promise<string> {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: GOOGLE_MAIL_SCOPE, aud: "https://oauth2.googleapis.com/token", sub: subject, iat, exp: iat + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  if (Date.now() > deadline) throw new BudgetError("time budget");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    cache: "no-store",
  });
  if (res.ok) return ((await res.json()) as { access_token: string }).access_token;
  const text = await res.text().catch(() => "");
  // unauthorized_client: l'amministratore non ha autorizzato la delega con questo scope.
  if (/unauthorized_client|access_denied/i.test(text)) throw new PermissionError(text.slice(0, 200));
  if (/invalid_grant/i.test(text)) throw new NoMailboxError(text.slice(0, 160));
  throw new Error(`Google token ${res.status} ${text.slice(0, 160)}`);
}

export function gmailMailSource(adminToken: string, sa: ServiceAccount): MailSource {
  const groups = chunk(searchTerms(), TERMS_PER_QUERY);
  const tokens = new Map<string, string>();
  return {
    async listMailboxes() {
      const out: Mailbox[] = [];
      let pageToken: string | undefined;
      for (let i = 0; i < 100; i++) {
        const url = new URL("https://admin.googleapis.com/admin/directory/v1/users");
        url.searchParams.set("customer", "my_customer");
        url.searchParams.set("maxResults", "500");
        url.searchParams.set("projection", "basic");
        url.searchParams.set("fields", "users(primaryEmail,suspended,name/fullName,organizations),nextPageToken");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const page: any = await getJson(url.toString(), adminToken, Date.now() + 120_000);
        for (const u of page.users ?? []) {
          if (u.suspended || !u.primaryEmail) continue;
          const email = String(u.primaryEmail).toLowerCase();
          out.push({ id: email, email, name: u.name?.fullName ?? undefined, department: u.organizations?.find((o: any) => o?.department)?.department ?? undefined });
        }
        pageToken = page.nextPageToken;
        if (!pageToken) break;
      }
      return out;
    },
    async fetch(mb, after, until, deadline) {
      let token = tokens.get(mb.id);
      if (!token) tokens.set(mb.id, (token = await delegatedToken(sa, mb.id, deadline)));
      const base = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(mb.id)}/messages`;
      const ids = new Set<string>();
      for (const terms of groups) {
        let pageToken: string | undefined;
        for (let i = 0; i < MAX_PAGES * 2; i++) {
          const url = new URL(base);
          url.searchParams.set("q", gmailQuery(terms, after, until));
          url.searchParams.set("maxResults", "500");
          if (pageToken) url.searchParams.set("pageToken", pageToken);
          const page: any = await getJson(url.toString(), token, deadline);
          for (const m of page.messages ?? []) if (m.id) ids.add(m.id);
          pageToken = page.nextPageToken;
          if (!pageToken) break;
        }
      }
      // Solo intestazioni From e Subject (format=metadata): mai il corpo del messaggio.
      const out: RawMessage[] = [];
      const queue = [...ids];
      const work = async () => {
        while (queue.length) {
          const id = queue.shift()!;
          const m: any = await getJson(`${base}/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&fields=internalDate,payload/headers`, token!, deadline);
          const header = (n: string) => (m.payload?.headers ?? []).find((h: any) => String(h.name).toLowerCase() === n)?.value ?? null;
          out.push({ from: header("from") ?? "", subject: header("subject"), receivedAt: new Date(Number(m.internalDate)) });
        }
      };
      await Promise.all(Array.from({ length: 8 }, work));
      return out;
    },
  };
}

// ── Database e inventario ───────────────────────────────────────────────

const PROVIDERS = ["MICROSOFT_365", "GOOGLE_WORKSPACE"] as const;
type WorkplaceProvider = (typeof PROVIDERS)[number];
const isWorkplace = (p: string): p is WorkplaceProvider => (PROVIDERS as readonly string[]).includes(p);

export const emailScanOn = (row: { emailScanEnabled: boolean | null }) => row.emailScanEnabled !== false;
export const emailScanStateOf = (row: { emailScanState: Prisma.JsonValue | null }) => (row.emailScanState as unknown as EmailScanState | null) ?? null;

function dbStore(row: ConnectorRow): HistoryStore {
  return {
    async rows() {
      const rows = await db.emailHistory.findMany({ where: { connectorId: row.id }, select: { personRef: true, scannedUntil: true, signals: true } });
      return rows.map((r) => ({ personRef: r.personRef, scannedUntil: r.scannedUntil, signals: (r.signals as unknown as Signals) ?? {} }));
    },
    async save(personRef, scannedUntil, signals) {
      const data = { scannedUntil, signals: signals as unknown as Prisma.InputJsonValue };
      await db.emailHistory.upsert({
        where: { connectorId_personRef: { connectorId: row.id, personRef } },
        update: data,
        create: { organizationId: row.organizationId, connectorId: row.id, personRef, ...data },
      });
    },
  };
}

async function sourceFor(row: ConnectorRow): Promise<MailSource | { status: EmailScanStatus; message: string }> {
  if (row.provider === "MICROSOFT_365") {
    const tenantId = decryptJson<{ tenantId?: string }>(row.credentialsEncrypted)?.tenantId;
    if (!tenantId) return { status: "error", message: "Microsoft 365 isn't connected." };
    return graphMailSource(await msToken(tenantId));
  }
  const sa = googleServiceAccount();
  if (!sa) return { status: "unavailable", message: "Email history isn't available on this deployment yet." };
  const refresh = decryptJson<{ refreshToken?: string }>(row.credentialsEncrypted)?.refreshToken;
  if (!refresh) return { status: "error", message: "Google Workspace isn't connected." };
  return gmailMailSource(await googleAccessToken(refresh), sa);
}

/**
 * Segnali nuovi → inventario: l'AI compare in "Your AI" / To review (stesso
 * persistSyncResult degli altri connettori), con "first seen" fino a 24 mesi fa,
 * e l'uso di ogni persona con la stessa privacy (email solo in "By person").
 */
async function applyToInventory(row: ConnectorRow, changed: PersonDelta[]) {
  if (!changed.length) return;
  const organizationId = row.organizationId;
  const isMs = row.provider === "MICROSOFT_365";
  const prefix = isMs ? "ms" : "gw";
  const system = isMs ? "Microsoft 365" : "Google Workspace";
  const services = [...new Set(changed.flatMap((c) => Object.keys(c.delta)))].filter((id) => AI_SERVICES.some((s) => s.id === id));
  if (!services.length) return;

  const all = await db.emailHistory.findMany({ where: { connectorId: row.id }, select: { signals: true } });
  const agg = aggregateServices(all.map((r) => ({ signals: (r.signals as unknown as Signals) ?? {} })));

  // Data "ultimo visto" di prima: persistSyncResult la porta a oggi, qui si rimette quella vera.
  const before = await Promise.all(
    services.map(async (svc) => {
      const own = await db.aiAsset.findUnique({ where: { organizationId_connectorId_externalId: { organizationId, connectorId: row.id, externalId: `${prefix}:${svc}` } }, select: { lastSeenAt: true } });
      if (own) return own.lastSeenAt;
      const shared = await db.aiAsset.findFirst({ where: { organizationId, deletedAt: null, serviceId: svc }, orderBy: { createdAt: "asc" }, select: { lastSeenAt: true } });
      return shared ? shared.lastSeenAt : undefined; // undefined = AI nuova
    })
  );

  const assets: ObservedAsset[] = services.map((svc) => {
    const s = AI_SERVICES.find((x) => x.id === svc)!;
    return { externalId: `${prefix}:${svc}`, serviceId: svc, type: s.type, name: s.name, vendor: s.vendor, connectedSystems: [{ system, detail: "Email history" }] };
  });
  const res = await persistSyncResult(organizationId, row.id, { provider: row.provider, assets, syncedAt: new Date(), warnings: [] }, { touchConnector: false });

  const assetBySvc = new Map<string, string>();
  for (let i = 0; i < services.length; i++) {
    const svc = services[i];
    const assetId = res.assetIds[i];
    const a = agg.get(svc);
    if (!assetId || !a) continue;
    assetBySvc.set(svc, assetId);
    const cur = await db.aiAsset.findUnique({ where: { id: assetId }, select: { firstSeenAt: true } });
    const first = new Date(a.first);
    const last = new Date(a.last);
    const prev = before[i];
    await db.aiAsset.update({
      where: { id: assetId },
      data: {
        ...(cur && first < cur.firstSeenAt ? { firstSeenAt: first } : {}),
        lastSeenAt: prev === undefined ? last : prev && prev > last ? prev : last,
      },
    });
  }

  // Uso di ogni persona: stessa privacy del resto (identitiesFor).
  const ids = await identitiesFor(organizationId);
  const { USAGE_RETENTION_MONTHS } = await import("@/lib/jobs");
  const retention = new Date();
  retention.setMonth(retention.getMonth() - USAGE_RETENTION_MONTHS);
  for (const c of changed) {
    const email = ids.person(c.mailbox.email);
    const name = ids.people ? c.mailbox.name : undefined;
    const department = ids.department(c.mailbox.department) ?? undefined;
    const user = await db.user.upsert({
      where: { organizationId_email: { organizationId, email } },
      update: { name, department },
      create: { organizationId, email, name, department },
    });
    for (const [svc, d] of Object.entries(c.delta)) {
      const assetId = assetBySvc.get(svc);
      const tot = c.total[svc];
      if (!assetId || !tot) continue;
      const first = new Date(tot.first);
      const last = new Date(tot.last);
      const usage = await db.aiAssetUsage.findUnique({ where: { aiAssetId_userId: { aiAssetId: assetId, userId: user.id } } });
      if (usage) {
        await db.aiAssetUsage.update({
          where: { id: usage.id },
          data: { firstSeenAt: first < usage.firstSeenAt ? first : usage.firstSeenAt, lastSeenAt: usage.lastSeenAt && usage.lastSeenAt > last ? usage.lastSeenAt : last },
        });
      } else {
        await db.aiAssetUsage.create({ data: { aiAssetId: assetId, userId: user.id, firstSeenAt: first, lastSeenAt: last } });
      }
      // Un'attività per tipo e giro (solo messaggi nuovi). Ricevuta = paga di tasca propria o a nota spese: nessun importo.
      const at = new Date(d.last);
      if (at < retention) continue;
      for (const kind of SIGNAL_KINDS) {
        if (!d[kind]) continue;
        await db.aiAssetActivity.create({
          data: { aiAssetId: assetId, source: row.provider, eventType: `email.${kind}`, actorRef: email, occurredAt: at, payload: { count: d[kind], ...(kind === "billing" ? { note: "receipt email: paid personally or expensed" } : {}) } },
        });
      }
    }
  }
}

const running = new Set<string>();

/**
 * Una scansione dello storico email per un connettore Microsoft 365 / Google
 * Workspace. Non lancia mai: l'esito finisce in Connector.emailScanState.
 */
export async function runEmailHistory(organizationId: string, provider: ConnectorProvider, budgetMs = RUN_BUDGET_MS): Promise<EmailScanState | null> {
  if (!isWorkplace(provider)) return null;
  const row = await db.connector.findUnique({ where: { organizationId_provider: { organizationId, provider } } });
  if (!row || !row.credentialsEncrypted || row.status === "DISCONNECTED" || !emailScanOn(row)) return null;
  if (running.has(row.id)) return null;
  running.add(row.id);
  const prev = emailScanStateOf(row);
  const now = new Date();
  let state: EmailScanState;
  try {
    const source = await sourceFor(row);
    if (!("fetch" in source)) {
      state = { status: source.status, lastRunAt: now.toISOString(), completedAt: prev?.completedAt, mailboxes: 0, done: 0, services: prev?.services ?? 0, message: source.message };
    } else {
      // Nella riga EmailHistory sempre lo pseudonimo, in ogni modalità di privacy.
      const salt = await orgSalt(organizationId);
      const r = await scanMailboxes(source, dbStore(row), { ref: (email) => pseudonymWith(salt, email), now, deadline: Date.now() + budgetMs });
      await applyToInventory(row, r.changed);
      const all = await db.emailHistory.findMany({ where: { connectorId: row.id }, select: { signals: true } });
      const services = aggregateServices(all.map((x) => ({ signals: (x.signals as unknown as Signals) ?? {} }))).size;
      state = {
        status: r.status,
        lastRunAt: now.toISOString(),
        completedAt: r.status === "ok" ? now.toISOString() : prev?.completedAt,
        mailboxes: r.mailboxes,
        done: r.done,
        services,
        message: r.message,
      };
    }
  } catch (err) {
    state = { status: "error", lastRunAt: now.toISOString(), completedAt: prev?.completedAt, mailboxes: prev?.mailboxes ?? 0, done: 0, services: prev?.services ?? 0, message: (err as Error).message.slice(0, 200) };
  } finally {
    running.delete(row.id);
  }
  // Spento nel frattempo? Non si riscrive lo stato.
  await db.connector.updateMany({ where: { id: row.id, OR: [{ emailScanEnabled: null }, { emailScanEnabled: true }] }, data: { emailScanState: state as unknown as Prisma.InputJsonValue } });
  return state;
}

/** In background (collegamento, "Sync now", interruttore acceso): non blocca la richiesta. */
export function startEmailHistory(organizationId: string, provider: ConnectorProvider) {
  if (!isWorkplace(provider)) return;
  void runEmailHistory(organizationId, provider).catch((err) => console.error("[email-history] failed", organizationId, provider, err));
}

/**
 * Lavoro periodico (jobs.ts, ogni ora): ogni connettore una volta al giorno,
 * più il seguito delle scansioni interrotte dal tempo massimo.
 */
export async function emailHistoryJob(now = new Date(), budgetMs = 10 * 60_000) {
  const end = Date.now() + budgetMs;
  const rows = await db.connector.findMany({
    where: { provider: { in: [...PROVIDERS] }, status: "CONNECTED", credentialsEncrypted: { not: null }, OR: [{ emailScanEnabled: null }, { emailScanEnabled: true }] },
    select: { organizationId: true, provider: true, emailScanState: true },
  });
  let ran = 0;
  for (const r of rows) {
    const left = end - Date.now();
    if (left < 30_000) break;
    const st = emailScanStateOf(r);
    const due = !st || st.status === "partial" || now.getTime() - Date.parse(st.lastRunAt) > 20 * 3600_000;
    if (!due) continue;
    await runEmailHistory(r.organizationId, r.provider, Math.min(RUN_BUDGET_MS, left));
    ran++;
  }
  return ran;
}

/** Spegne lo storico email: niente più letture e via i segnali già salvati (le AI trovate restano). */
export async function turnOffEmailHistory(organizationId: string, provider: ConnectorProvider) {
  const row = await db.connector.findUnique({ where: { organizationId_provider: { organizationId, provider } }, select: { id: true } });
  if (!row) return;
  await db.connector.update({ where: { id: row.id }, data: { emailScanEnabled: false, emailScanState: Prisma.JsonNull } });
  await db.emailHistory.deleteMany({ where: { connectorId: row.id } });
}

// ── Testo per le pagine ─────────────────────────────────────────────────

export interface EmailHistoryView {
  on: boolean;
  line: string;
  hint?: { text: string; href?: string; cta?: string };
}

export function emailHistoryView(row: { provider: ConnectorProvider; emailScanEnabled: boolean | null; emailScanState: Prisma.JsonValue | null }, fmt: (d: Date) => string): EmailHistoryView | null {
  if (!isWorkplace(row.provider)) return null;
  if (!emailScanOn(row)) return { on: false, line: "Email history: off" };
  const st = emailScanStateOf(row);
  const found = (n: number) => `${n} AI service${n === 1 ? "" : "s"} found`;
  if (!st) return { on: true, line: "Email history: starting" };
  if (st.status === "unavailable") return { on: true, line: "Email history: not available on this deployment yet" };
  if (st.status === "needs_permission") {
    if (row.provider === "MICROSOFT_365") return { on: true, line: "Email history: not scanned", hint: { text: `Grant ${MS_MAIL_PERMISSION} to see ${EMAIL_WINDOW_MONTHS} months of history`, href: "/api/connectors/microsoft/connect", cta: "Grant" } };
    const id = googleServiceAccount()?.client_id;
    return { on: true, line: "Email history: not scanned", hint: { text: `Allow client ID ${id ?? "of angar"} the scope ${GOOGLE_MAIL_SCOPE} in Google Admin (domain-wide delegation) to see ${EMAIL_WINDOW_MONTHS} months of history` } };
  }
  if (st.status === "error") return { on: true, line: `Email history: last scan failed · ${fmt(new Date(st.lastRunAt))}`, hint: st.message ? { text: st.message } : undefined };
  if (st.completedAt) return { on: true, line: `Email history: ${EMAIL_WINDOW_MONTHS} months scanned · ${found(st.services)} · ${fmt(new Date(st.completedAt))}` };
  return { on: true, line: `Email history: scanning · ${st.done} of ${st.mailboxes} mailboxes · ${found(st.services)}` };
}

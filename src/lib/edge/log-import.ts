// Import di log di rete già esistenti (senza il box angar Edge): file caricati a mano
// (Zscaler NSS, FortiGate/FortiAnalyzer, BIND, Windows DNS, Pi-hole, pfSense/OPNsense,
// JSON e CSV generici) e righe lette dalle API (Cloudflare Gateway, Cisco Umbrella).
// Riusa i parser e il matching di parse.ts; in più legge il giorno di ogni riga e,
// se c'è, l'email della persona. Si tiene SOLO: AI del catalogo (o candidata), giorno,
// IP o email, conteggi. Mai URL, percorsi o query string.
// Modulo puro (nessun accesso al database).
import { isIP } from "net";
import { gunzipSync } from "zlib";
import { unzipSync } from "fflate";
import {
  aiCandidateDomain,
  hostOf,
  isAiCategory,
  isBlockAction,
  kvGet,
  parseCloudLine,
  parseGeneric,
  parseIp,
  parseKv,
  registrable,
  type LogHit,
  type Matcher,
} from "./parse";

/** Riga riconosciuta: come LogHit, più giorno e persona (se il log li ha). */
export interface ImportHit extends LogHit {
  day?: string | null;
  email?: string | null;
}

/** Evento aggregato per giorno, AI, persona/dispositivo e fonte. */
export interface ImportEvent {
  day: string;
  serviceId: string;
  kind: string;
  /** IP del dispositivo, "*" (anonimo) o "" quando c'è solo l'email. */
  client: string;
  email: string | null;
  clientName?: string | null;
  hits: number;
  bytesUp: number;
  blocked: number;
  source: string;
}

export interface ImportCandidate {
  day: string;
  domain: string;
  client: string;
  email: string | null;
  hits: number;
  source: string;
}

export interface ImportResult {
  events: ImportEvent[];
  candidates: ImportCandidate[];
  /** Righe lette (non vuote). */
  lines: number;
  /** Righe riconosciute in un formato noto. */
  parsed: number;
  /** Righe che portano a un'AI (del catalogo o candidata). */
  aiLines: number;
  /** Formato → righe riconosciute. */
  formats: Record<string, number>;
  services: string[];
  /** Persone o dispositivi distinti visti usare AI (0 in modalità anonima). */
  people: number;
  days: string[];
  warnings: string[];
}

export interface ImportOptions {
  anonymous: boolean;
  /** Prefisso della fonte: "import" (file) o "cloud" (API). */
  prefix?: string;
  /** Giorno quando la riga non ne ha uno (default: oggi). */
  fallbackDay?: string;
  /** Giorni più vecchi di così si scartano (default 365). */
  maxAgeDays?: number;
  maxLines?: number;
  now?: Date;
}

const DAY_MS = 86_400_000;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}/;

/** Prima email nel testo (minuscola), oppure null. */
export function emailIn(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 400) return null;
  const m = EMAIL_RE.exec(v);
  return m && m[0].length <= 120 ? m[0].toLowerCase() : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  return dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};
const monthOf = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1;

/** Epoch in secondi, millisecondi, micro o nanosecondi → giorno UTC. */
export function epochDay(v: unknown): string | null {
  let ms: number;
  if (typeof v === "number") ms = v < 1e11 ? v * 1000 : v < 1e14 ? v : v < 1e17 ? v / 1e3 : v / 1e6;
  else if (typeof v === "string" && /^\d{9,19}$/.test(v.trim())) {
    const s = v.trim();
    ms = s.length <= 10 ? Number(s) * 1000 : Number(s.slice(0, 13));
  } else return null;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Giorno di una riga di log, nei formati più comuni. `dmy`: date numeriche
 * giorno/mese (Windows DNS con impostazioni europee).
 */
export function dayOf(text: string, now: Date, dmy = false): string | null {
  let m = /(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}|\b)/.exec(text);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  // BIND: 30-Sep-2026 10:15:32.123
  m = /\b(\d{1,2})-([A-Za-z]{3})-(\d{4})\b/.exec(text);
  if (m && monthOf(m[2])) return ymd(+m[3], monthOf(m[2]), +m[1]);
  // Zscaler NSS: Mon Sep 30 10:15:32 2026
  m = /\b[A-Za-z]{3} ([A-Za-z]{3}) +(\d{1,2}) \d{2}:\d{2}:\d{2} (\d{4})\b/.exec(text);
  if (m && monthOf(m[1])) return ymd(+m[3], monthOf(m[1]), +m[2]);
  // Windows DNS / Excel: 9/30/2026 o 30/09/2026 (anche 30.09.2026)
  m = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/.exec(text);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const dayFirst = dmy || a > 12 || m[0].includes(".");
    return dayFirst ? ymd(+m[3], b, a) : ymd(+m[3], a, b);
  }
  // syslog senza anno: Sep 30 10:15:32 (anno corrente, o il precedente se cadrebbe nel futuro)
  m = /(?:^|[\s>])([A-Za-z]{3}) +(\d{1,2}) \d{2}:\d{2}:\d{2}\b/.exec(text);
  if (m && monthOf(m[1])) {
    const y = now.getUTCFullYear();
    const d = ymd(y, monthOf(m[1]), +m[2]);
    if (d && Date.parse(d + "T00:00:00Z") > now.getTime() + DAY_MS) return ymd(y - 1, monthOf(m[1]), +m[2]);
    return d;
  }
  // Fortinet: eventtime=1727691332123456789 (ns) / timestamp in secondi
  m = /\b(?:eventtime|itime|timestamp|ts)=(\d{10,19})\b/.exec(text);
  if (m) return epochDay(m[1]);
  return null;
}

const hit = (vendor: string, client: string | null, extra: Partial<ImportHit> = {}): ImportHit => ({ vendor, client, bytesUp: 0, blocked: false, aiCategory: false, dns: false, ...extra });

// ---------- parser dei formati aggiuntivi ----------

/** BIND query log: `client @0x… 192.168.1.10#53422 (chatgpt.com): query: chatgpt.com IN A +E(0)`. */
export function parseBind(line: string): ImportHit | null {
  if (!line.includes("query: ")) return null;
  const m = /client (?:@\S+ )?([0-9A-Fa-f:.]+)#\d+(?: \([^)]*\))?: (?:view [^:]+: )?query: (\S+) IN\b/.exec(line);
  if (!m) return null;
  const client = parseIp(m[1]);
  const host = hostOf(m[2]);
  if (!client || !host) return null;
  return hit("bind", client, { host, dns: true });
}

/** Windows DNS debug log: `… PACKET … UDP Rcv 192.168.1.10 1a2b   Q [0001   D   NOERROR] A (7)chatgpt(3)com(0)`. */
export function parseWindowsDns(line: string): ImportHit | null {
  if (!line.includes("PACKET")) return null;
  const m = /\b(?:UDP|TCP)\s+Rcv\s+([0-9A-Fa-f:.]+)\s+[0-9A-Fa-f]+\s+(R\s+)?Q\s+\[[^\]]*\]\s+\S+\s+((?:\(\d+\)[^\s(]*)+)/.exec(line);
  if (!m || m[2]) return null; // solo le domande ricevute dai client, non le risposte
  const client = parseIp(m[1]);
  const host = hostOf(m[3].replace(/\(\d+\)/g, ".").replace(/^\.+|\.+$/g, ""));
  if (!client || !host) return null;
  return hit("windows-dns", client, { host, dns: true });
}

const ZS_TIME = /^[A-Za-z]{3} [A-Za-z]{3} +\d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/;

/**
 * Zscaler NSS web log (CSV senza intestazione, formato del feed predefinito):
 * "Mon Sep 30 10:15:32 2026","jdoe@acme.com","HTTPS","chatgpt.com/c/…","Allowed","ChatGPT","Generative AI",…
 */
export function parseZscalerNss(line: string): ImportHit | null {
  if (!line.startsWith('"')) return null;
  const f = splitDelimited(line, ",");
  if (f.length < 5 || !ZS_TIME.test(f[0].trim())) return null;
  const email = emailIn(f[1]);
  let host: string | null = null;
  for (const x of f.slice(2, 8)) {
    if (/^(https?|ssl|tunnel|ftp|dns)$/i.test(x.trim())) continue;
    host = hostOf(x);
    if (host) break;
  }
  if (!host) return null;
  const action = f.find((x) => /^(allowed|blocked|block|allow)$/i.test(x.trim()));
  let client: string | null = null;
  for (const x of f) {
    const ip = parseIp(x);
    if (ip && isIP(ip) === 4 && /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip)) {
      client = ip;
      break;
    }
  }
  return hit("zscaler", client, { host, email, blocked: action ? isBlockAction(action) : false, aiCategory: f.some((x) => isAiCategory(x)) });
}

/** FortiGate / FortiAnalyzer (key=value): come parseFortinet, più utente e giorno. */
function fortinetExtra(line: string): Partial<ImportHit> {
  const kv = parseKv(line);
  const email = emailIn(kvGet(kv, ["user", "unauthuser", "srcuser", "email"]));
  const date = kvGet(kv, ["date"]);
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : epochDay(kvGet(kv, ["eventtime", "itime"]) ?? "");
  return { email, day };
}

// ---------- JSON ----------

type Json = Record<string, unknown>;

function flat(o: Json): Map<string, unknown> {
  const m = new Map<string, unknown>();
  const add = (obj: Json, depth: number) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === "object" && !Array.isArray(v) && depth < 2) add(v as Json, depth + 1);
      else if (!m.has(k.toLowerCase())) m.set(k.toLowerCase(), v);
    }
  };
  add(o, 0);
  return m;
}

const TIME_KEYS = ["datetime", "timestamp", "@timestamp", "time", "eventtime", "event_time", "date", "ts", "logged_time", "loggedtime", "starttime"];
const USER_KEYS = ["email", "useremail", "user_email", "login", "user", "username", "user_name", "userprincipalname", "upn", "identity", "srcuser", "src_user"];

/** Un oggetto JSON (Cloudflare Logpush, Zscaler NSS JSON, Umbrella API, SIEM). */
export function parseJsonRecord(o: unknown, now: Date): ImportHit | null {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const m = flat(o as Json);
  // Il parser condiviso vuole un IP; le esportazioni con la sola email vanno lette qui.
  const base = parseCloudLine(JSON.stringify(o));
  let email: string | null = null;
  for (const k of USER_KEYS) {
    email = emailIn(m.get(k));
    if (email) break;
  }
  // Umbrella: identities: [{ label: "Jane (jane@acme.com)" }]
  if (!email) {
    const ids = (o as Json).identities;
    if (Array.isArray(ids)) for (const i of ids) if ((email = emailIn((i as Json)?.label ?? i))) break;
  }
  let day: string | null = null;
  for (const k of TIME_KEYS) {
    const v = m.get(k);
    if (v === undefined || v === null || v === "") continue;
    day = typeof v === "number" ? epochDay(v) : typeof v === "string" ? (/^\d{9,19}$/.test(v) ? epochDay(v) : dayOf(v, now)) : null;
    if (day) break;
  }
  if (base) return { ...base, email, day };
  // Senza IP: basta l'email (o niente: conta solo l'azienda).
  const str = (keys: string[]) => {
    for (const k of keys) {
      const v = m.get(k);
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };
  const host = hostOf(str(["queryname", "query_name", "qname", "domain", "httphost", "hostname", "host", "fqdn", "servername", "sni", "dest_host", "desthost"])) ?? hostOf(str(["url", "requesturl", "request_url"]));
  if (!host) return null;
  const action = str(["resolverdecision", "action", "decision", "verdict"]);
  const cats = (o as Json).categories;
  const cat = Array.isArray(cats) ? cats.map((c) => (typeof c === "string" ? c : String((c as Json)?.label ?? ""))).join(" ") : str(["urlcategory", "category", "categorynames"]);
  const vendor = m.has("queryname") || m.has("resolverdecision") ? "cloudflare" : Array.isArray((o as Json).identities) ? "umbrella" : m.has("reqsize") || m.has("cintip") ? "zscaler" : "json";
  return hit(vendor, null, { host, email, day, blocked: action ? isBlockAction(action) : false, aiCategory: cat ? isAiCategory(cat) : false, dns: m.has("queryname") || m.has("qname") });
}

// ---------- CSV con intestazione ----------

/** Split con delimitatore e virgolette ("a,b" resta un campo; "" è una virgoletta). */
export function splitDelimited(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && q && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (c === '"') q = !q;
    else if (c === delim && !q) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

const norm = (h: string) => h.toLowerCase().replace(/^﻿/, "").replace(/[^a-z0-9@]/g, "");
const HOST_COLS = ["domain", "domainname", "query", "queryname", "qname", "question", "hostname", "host", "fqdn", "destination", "desthost", "destinationhost", "dsthost", "site", "website", "requesteddomain", "sni", "servername", "httphost"];
const URL_COLS = ["url", "requesturl", "fullurl", "eurl", "uri"];
const USER_COLS = ["email", "useremail", "user", "username", "login", "identity", "identities", "userprincipalname", "upn", "srcuser", "account", "policyidentity", "mostgranularidentity"];
const IP_COLS = ["clientip", "srcip", "sourceip", "source", "src", "client", "clientaddress", "internalip", "cintip", "clientinternalip", "internalipaddress", "clientipaddress", "sourceipaddress", "ip", "ipaddress", "deviceip", "requestorip"];
const TIME_COLS = ["timestamp", "time", "datetime", "date", "loggedtime", "ts", "@timestamp", "eventtime", "datetimeutc", "timeutc", "querytime", "starttime"];
const ACTION_COLS = ["action", "verdict", "decision", "status", "resolverdecision", "policyaction"];
const CAT_COLS = ["category", "categories", "urlcategory", "urlclass", "categorynames", "appclass"];
const NAME_COLS = ["devicename", "device", "computer", "computername", "devicehostname", "clientname", "srcname"];

export interface CsvLayout {
  delim: string;
  host: number;
  url: number;
  user: number;
  ip: number;
  time: number;
  action: number;
  cat: number;
  name: number;
}

/** Intestazione CSV con almeno una colonna dominio/URL → posizioni delle colonne. */
export function detectCsvHeader(line: string): CsvLayout | null {
  const delims = [",", ";", "\t", "|"];
  let best: CsvLayout | null = null;
  for (const delim of delims) {
    const cols = splitDelimited(line, delim).map(norm);
    if (cols.length < 2) continue;
    const find = (names: string[]) => {
      for (const n of names) {
        const i = cols.indexOf(n);
        if (i >= 0) return i;
      }
      return -1;
    };
    const layout: CsvLayout = { delim, host: find(HOST_COLS), url: find(URL_COLS), user: find(USER_COLS), ip: find(IP_COLS), time: find(TIME_COLS), action: find(ACTION_COLS), cat: find(CAT_COLS), name: find(NAME_COLS) };
    if (layout.host < 0 && layout.url < 0) continue;
    // Una riga di dati con un dominio nella colonna "host" non è un'intestazione.
    if (layout.host >= 0 && hostOf(splitDelimited(line, delim)[layout.host])) continue;
    if (!best) best = layout;
  }
  return best;
}

export function parseCsvRow(line: string, l: CsvLayout, now: Date): ImportHit | null {
  const f = splitDelimited(line, l.delim);
  const get = (i: number) => (i >= 0 ? f[i] ?? "" : "");
  const host = hostOf(get(l.host)) ?? hostOf(get(l.url));
  if (!host) return null;
  const userRaw = get(l.user);
  const t = get(l.time);
  const day = t ? (/^\d{9,19}$/.test(t) ? epochDay(t) : dayOf(t, now)) : null;
  const action = get(l.action);
  const name = get(l.name);
  return hit("csv", parseIp(get(l.ip)), {
    host,
    email: emailIn(userRaw),
    day,
    clientName: name && /^[\w.-]{1,64}$/.test(name) ? name : null,
    blocked: action ? isBlockAction(action) : false,
    aiCategory: isAiCategory(get(l.cat)),
    dns: l.host >= 0 && l.url < 0,
  });
}

// ---------- riconoscimento del formato e lettura ----------

/** Una riga di log in qualunque formato noto (il giorno lo calcola chi chiama, se manca). */
export function parseImportLine(line: string, now: Date): ImportHit | null {
  const t = line.trim();
  if (!t) return null;
  if (t.startsWith("{")) {
    try {
      return parseJsonRecord(JSON.parse(t), now);
    } catch {
      return null;
    }
  }
  const z = parseZscalerNss(t);
  if (z) return z;
  const b = parseBind(t) ?? parseWindowsDns(t);
  if (b) return b;
  const c = parseCloudLine(t);
  if (!c) return null;
  if (c.vendor === "fortinet") return { ...c, ...fortinetExtra(t) };
  if (c.vendor === "umbrella") {
    const f = splitDelimited(t, ",");
    return { ...c, email: emailIn(f[1]) ?? emailIn(f[2]), day: dayOf(f[0] ?? "", now) };
  }
  // dnsmasq (Pi-hole, UniFi) usa lo stesso formato "query[A] … from …".
  if (c.vendor === "unifi") return { ...c, vendor: "dnsmasq" };
  return c;
}

const VENDOR_LABEL: Record<string, string> = {
  cloudflare: "Cloudflare Gateway",
  umbrella: "Cisco Umbrella",
  zscaler: "Zscaler",
  fortinet: "Fortinet",
  paloalto: "Palo Alto",
  sophos: "Sophos",
  meraki: "Cisco Meraki",
  dnsmasq: "Pi-hole / dnsmasq",
  pfsense: "pfSense / OPNsense (Unbound)",
  bind: "BIND",
  "windows-dns": "Windows DNS",
  csv: "CSV",
  json: "JSON",
  generic: "Other (domains found in text)",
};
export const formatLabel = (v: string) => VENDOR_LABEL[v] ?? v;

/** Un file di testo: righe, documento JSON (array o { data: [...] }) o CSV con intestazione. */
function* records(text: string, now: Date): Generator<{ hit: ImportHit | null; raw: string }> {
  const head = text.slice(0, 200).trimStart();
  // Documento JSON intero (non JSON-lines): array, oppure oggetto con un array di righe.
  if (head.startsWith("[") || (head.startsWith("{") && !/\}\s*\r?\n\s*\{/.test(text.slice(0, 20000)))) {
    try {
      const doc = JSON.parse(text) as unknown;
      const rows = Array.isArray(doc)
        ? doc
        : doc && typeof doc === "object"
          ? (Object.values(doc as Json).find((v) => Array.isArray(v)) as unknown[] | undefined) ?? [doc]
          : [];
      for (const r of rows) yield { hit: parseJsonRecord(r, now), raw: "" };
      return;
    } catch {
      // non è un documento intero: si legge riga per riga
    }
  }
  let start = 0;
  let layout: CsvLayout | null | undefined;
  while (start < text.length) {
    let end = text.indexOf("\n", start);
    if (end < 0) end = text.length;
    const line = text.slice(start, Math.min(end, start + 64 * 1024)).replace(/[\r\0]+$/g, "");
    start = end + 1;
    if (!line.trim() || line.startsWith("#")) continue;
    // La prima riga può essere l'intestazione di un CSV generico.
    if (layout === undefined) {
      layout = line.trim().startsWith("{") ? null : detectCsvHeader(line);
      if (layout) continue;
    }
    yield { hit: layout ? parseCsvRow(line, layout, now) ?? parseImportLine(line, now) : parseImportLine(line, now), raw: line };
  }
}

/** File di testo o zip (anche annidato una volta) → [nome, testo]. */
export function textsOf(name: string, data: Uint8Array, limits = { files: 50, bytes: 200 * 1024 * 1024 }): { texts: [string, string][]; warnings: string[] } {
  const warnings: string[] = [];
  const isZip = name.toLowerCase().endsWith(".zip") || (data[0] === 0x50 && data[1] === 0x4b && data[2] === 3 && data[3] === 4);
  if (!isZip) {
    const gz = data[0] === 0x1f && data[1] === 0x8b;
    if (gz) {
      try {
        return { texts: [[name, gunzipSync(Buffer.from(data), { maxOutputLength: limits.bytes }).toString("utf8")]], warnings };
      } catch {
        return { texts: [], warnings: [`${name}: could not open the gzip file.`] };
      }
    }
    return { texts: [[name, Buffer.from(data).toString("utf8")]], warnings };
  }
  const texts: [string, string][] = [];
  try {
    let count = 0;
    let total = 0;
    let tooBig = false;
    const files = unzipSync(data, {
      filter: (f) => {
        if (f.name.endsWith("/") || f.name.startsWith("__MACOSX") || !/\.(csv|log|txt|json|jsonl|ndjson|tsv)$|^[^.]+$/i.test(f.name.split("/").pop() ?? "")) return false;
        count++;
        total += f.originalSize;
        if (count > limits.files || total > limits.bytes) {
          tooBig = true;
          return false;
        }
        return true;
      },
    });
    if (tooBig) warnings.push(`${name}: only part of the zip was read (up to ${limits.files} files and ${Math.round(limits.bytes / 1024 / 1024)} MB unzipped).`);
    for (const [n, d] of Object.entries(files)) texts.push([n, Buffer.from(d).toString("utf8")]);
  } catch {
    warnings.push(`${name}: could not open the zip file.`);
  }
  return { texts, warnings };
}

/**
 * Somma le righe AI per (giorno, AI, persona o dispositivo, fonte). Usato sia per i
 * file sia per le API (dove una riga porta già un conteggio). Le righe non AI si
 * scartano subito; dei domini resta solo il servizio del catalogo (o il dominio
 * registrabile per le AI candidate).
 */
export function createAggregator(matcher: Matcher, opts: ImportOptions) {
  const now = opts.now ?? new Date();
  const prefix = opts.prefix ?? "import";
  const fallbackDay = opts.fallbackDay ?? now.toISOString().slice(0, 10);
  const minDay = new Date(now.getTime() - (opts.maxAgeDays ?? 365) * DAY_MS).toISOString().slice(0, 10);
  const maxDay = new Date(now.getTime() + DAY_MS).toISOString().slice(0, 10);
  const events = new Map<string, ImportEvent>();
  const candidates = new Map<string, ImportCandidate>();
  const formats: Record<string, number> = {};
  const services = new Set<string>();
  const people = new Set<string>();
  const days = new Set<string>();
  const warnings: string[] = [];
  const st = { lines: 0, parsed: 0, aiLines: 0, tooOld: 0 };

  /** Una riga riconosciuta (count: righe/richieste che rappresenta). true se è AI. */
  function add(h: ImportHit, count = 1, dayHint?: string | null): boolean {
    const n = Math.max(1, Math.min(Math.floor(count) || 1, 100_000_000));
    st.parsed += n;
    formats[h.vendor] = (formats[h.vendor] ?? 0) + n;
    const day = h.day ?? dayHint ?? fallbackDay;
    if (day < minDay || day > maxDay) {
      st.tooOld += n;
      return false;
    }
    const source = `${prefix}:${h.vendor}`.slice(0, 40);
    const email = opts.anonymous ? null : h.email ?? null;
    const client = opts.anonymous ? "*" : email ? "" : h.client ? h.client : "*";
    // Persona se c'è l'email (l'IP allora non serve e non si tiene), altrimenti il dispositivo.
    const ident = email ?? client;
    const m = (h.host && (matcher.service(h.host) ?? matcher.blocked(h.host))) || (h.app ? matcher.byApp(h.app) : null);
    if (m) {
      const k = `${day}|${m.serviceId}|${ident}|${source}`;
      const e = events.get(k) ?? { day, serviceId: m.serviceId, kind: m.kind, client, email, hits: 0, bytesUp: 0, blocked: 0, source };
      e.hits += n;
      e.bytesUp += h.bytesUp;
      if (h.blocked) e.blocked += n;
      if (!e.clientName && !opts.anonymous && h.clientName && /^[\w.-]{1,64}$/.test(h.clientName)) e.clientName = h.clientName;
      events.set(k, e);
      services.add(m.serviceId);
    } else if (h.host) {
      const d = aiCandidateDomain(h.host) ?? (h.aiCategory ? registrable(h.host) : null);
      if (!d) return false;
      const k = `${day}|${d}|${ident}|${source}`;
      const c = candidates.get(k) ?? { day, domain: d, client, email, hits: 0, source };
      c.hits += n;
      candidates.set(k, c);
      services.add(`cand:${d}`);
    } else return false;
    st.aiLines += n;
    days.add(day);
    if (ident !== "*") people.add(ident);
    return true;
  }

  function result(): ImportResult {
    const w = [...warnings];
    if (st.tooOld) w.push(`${st.tooOld.toLocaleString("en-GB")} lines skipped: older than ${opts.maxAgeDays ?? 365} days or dated in the future.`);
    return {
      events: [...events.values()],
      candidates: [...candidates.values()],
      lines: st.lines,
      parsed: st.parsed,
      aiLines: st.aiLines,
      formats,
      services: [...services],
      people: people.size,
      days: [...days].sort(),
      warnings: w,
    };
  }

  return { add, result, warnings, st, now };
}

/** Legge uno o più file di log (testo già estratto) e somma le AI trovate. */
export function aggregateImport(texts: [string, string][], matcher: Matcher, opts: ImportOptions): ImportResult {
  const agg = createAggregator(matcher, opts);
  const now = agg.now;
  const max = opts.maxLines ?? 3_000_000;
  for (const [name, text] of texts) {
    if (agg.st.lines >= max) break;
    // Windows DNS con date europee: se una data ha il giorno > 12, tutto il file è giorno/mese.
    const dmy = /^\s*(1[3-9]|2\d|3[01])\/\d{1,2}\/\d{4}/m.test(text.slice(0, 200_000));
    let fileLines = 0;
    let fileParsed = 0;
    for (const { hit: h0, raw } of records(text, now)) {
      if (agg.st.lines >= max) {
        agg.warnings.push(`Stopped after ${max.toLocaleString("en-GB")} lines — export a shorter period for the rest.`);
        break;
      }
      agg.st.lines++;
      fileLines++;
      let h = h0;
      // Ultima possibilità: un IP privato e un dominio del catalogo nella riga.
      if (!h && raw) {
        const g = parseGeneric(raw);
        const host = g?.hosts.find((x) => matcher.service(x));
        if (g && host) h = hit("generic", g.client, { host });
      }
      if (!h) continue;
      fileParsed++;
      agg.add(h, 1, h.day ? null : raw ? dayOf(raw, now, dmy) : null);
    }
    if (fileLines > 0 && fileParsed === 0) agg.warnings.push(`${name}: format not recognised — no lines could be read.`);
  }
  return agg.result();
}

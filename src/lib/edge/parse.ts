// Parser dei log di rete (porting da edge/src/syslog + detect.rs), usati da
// POST /api/edge/logs (log inviati dal cloud: Cloudflare, Zscaler, Umbrella, SIEM).
// Estraggono SOLO: IP del client, nome host (mai path/URL), byte inviati,
// azione bloccata. Tutto ciò che non è AI viene scartato subito.
// Modulo puro (nessun accesso al database): testato da scripts/edge-parse-check.ts.
import { isIP } from "net";

export interface LogHit {
  vendor: string;
  client: string | null;
  clientName?: string | null;
  /** Host name only (never a path). */
  host?: string | null;
  /** Firewall application id (Palo Alto App-ID, Fortinet app) when there's no host. */
  app?: string | null;
  bytesUp: number;
  blocked: boolean;
  /** The firewall itself classified the destination as AI. */
  aiCategory: boolean;
  dns: boolean;
}

const hit = (vendor: string, client: string | null, extra: Partial<LogHit> = {}): LogHit => ({ vendor, client, bytesUp: 0, blocked: false, aiCategory: false, dns: false, ...extra });

// ---------- utilità (util.rs) ----------

export function isBlockAction(a: string): boolean {
  const s = a.trim().replace(/^"|"$/g, "").toLowerCase();
  return s.startsWith("block") || s.startsWith("deny") || s.startsWith("drop") || s.startsWith("reset") || s === "denied" || s === "blocked" || s === "reject" || s === "prohibited";
}

export function isAiCategory(c: string): boolean {
  const s = c.toLowerCase();
  return s.includes("artificial") || s.includes("generative ai") || s.includes("generative-ai") || s.includes("ai chatbot");
}

/** `key=value key2="value with spaces"` → pairs (keys lowercased). */
export function parseKv(line: string): [string, string][] {
  const out: [string, string][] = [];
  const n = line.length;
  const isKeyStart = (c: string) => /[A-Za-z0-9_]/.test(c);
  const isKey = (c: string) => /[A-Za-z0-9_.-]/.test(c);
  let i = 0;
  while (i < n) {
    while (i < n && !isKeyStart(line[i])) i++;
    const ks = i;
    while (i < n && isKey(line[i])) i++;
    if (i >= n || line[i] !== "=" || i === ks) {
      while (i < n && line[i] !== " ") i++;
      continue;
    }
    const key = line.slice(ks, i).toLowerCase();
    i++;
    let val: string;
    if (i < n && (line[i] === '"' || line[i] === "'")) {
      const q = line[i];
      i++;
      const vs = i;
      while (i < n && line[i] !== q) {
        if (line[i] === "\\") i++;
        i++;
      }
      const ve = Math.min(i, n);
      val = line.slice(vs, ve);
      i = ve + 1;
    } else {
      const vs = i;
      while (i < n && line[i] !== " ") i++;
      val = line.slice(vs, i);
    }
    out.push([key, val]);
  }
  return out;
}

export function kvGet(kv: [string, string][], keys: string[]): string | null {
  for (const k of keys) {
    const f = kv.find(([kk, v]) => kk === k && v !== "" && v !== "N/A");
    if (f) return f[1];
  }
  return null;
}

/** "chatgpt.com", "api.openai.com": letters/digits/-/. with at least one dot and a letter TLD. */
export function looksLikeHostname(h: string): boolean {
  if (h.length < 4 || h.length > 253 || !h.includes(".") || h.startsWith(".") || h.includes("..")) return false;
  if (!/^[A-Za-z0-9._-]+$/.test(h)) return false;
  const tld = h.split(".").pop() ?? "";
  return tld.length >= 2 && /^[A-Za-z]+$/.test(tld);
}

/** Host only, from a URL or "host/path" or plain host. Never returns the path. */
export function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().replace(/^"+|"+$/g, "");
  const p = v.indexOf("://");
  const rest = p >= 0 ? v.slice(p + 3) : v;
  const m = rest.search(/[/?# ]/);
  let auth = m >= 0 ? rest.slice(0, m) : rest;
  auth = auth.split("@").pop() ?? auth;
  if (auth.startsWith("[")) return null; // IPv6 literal
  const host = (auth.split(":")[0] ?? "").replace(/\.+$/, "").toLowerCase();
  return looksLikeHostname(host) ? host : null;
}

function v4Octets(s: string): number[] | null {
  if (isIP(s) !== 4) return null;
  return s.split(".").map(Number);
}

export function isPrivateV4(s: string): boolean {
  const o = v4Octets(s);
  if (!o) return false;
  return o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168) || (o[0] === 169 && o[1] === 254) || (o[0] === 100 && (o[1] & 0xc0) === 64);
}

/** First private IPv4 in the text (generic logs). */
export function firstPrivateIpv4(text: string): string | null {
  for (const t of text.split(/[^0-9.]+/)) {
    const s = t.replace(/^\.+|\.+$/g, "");
    if (isPrivateV4(s)) return s;
  }
  return null;
}

/** "192.168.1.34:52344" / "192.168.1.34" / "::ffff:192.168.1.34" → canonical IP. */
export function parseIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^"|"$/g, "");
  if (s.startsWith("[")) {
    const e = s.indexOf("]");
    if (e > 0) s = s.slice(1, e);
  }
  const canon = (ip: string) => {
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    return m ? m[1] : ip.toLowerCase();
  };
  if (isIP(s)) return canon(s);
  const c = s.lastIndexOf(":");
  if (c > 0) {
    const h = s.slice(0, c);
    if (isIP(h) === 4) return h;
  }
  return null;
}

// ---------- detect.rs ----------

const AI_WORDS = ["gpt", "llm", "copilot", "chatbot", "genai", "aichat", "openai", "anthropic", "ollama", "huggingface", "diffusion", "deepseek", "mistral", "gemini", "claude", "perplexity", "neural", "agentic"];
const SKIP_SUFFIX = [".local", ".lan", ".home", ".internal", ".localdomain", ".arpa", ".home.arpa", ".corp"];

/** Registrable domain ("chat.foo.co.uk" → "foo.co.uk"). */
export function registrable(host: string): string {
  const h = host.replace(/\.+$/, "");
  const labels = h.split(".");
  const n = labels.length;
  if (n <= 2) return h;
  const second = labels[n - 2];
  const take = labels[n - 1].length === 2 && ["co", "com", "org", "net", "ac", "gov", "edu"].includes(second) ? 3 : 2;
  return labels.slice(n - take).join(".");
}

/** A domain that looks like an AI service but isn't in the catalog (registrable domain only). */
export function aiCandidateDomain(raw: string): string | null {
  const host = raw.replace(/\.+$/, "").toLowerCase();
  if (isIP(host) || !host.includes(".") || host === "localhost" || SKIP_SUFFIX.some((s) => host.endsWith(s))) return null;
  if (!looksLikeHostname(host)) return null;
  const reg = registrable(host);
  const labels = host.split(".");
  const tld = labels[labels.length - 1];
  const isAi = (l: string) => l === "ai" || l.startsWith("ai-") || l.endsWith("-ai") || AI_WORDS.some((w) => l.includes(w));
  const regLabels = reg.split(".");
  if (tld === "ai" || regLabels.slice(0, -1).some(isAi)) return reg;
  return labels.slice(0, -1).some(isAi) ? host : null;
}

// ---------- vendor parsers ----------

export function parseFortinet(line: string): LogHit | null {
  if (!(line.includes("logid=") || line.includes("devid=")) || !line.includes("srcip=")) return null;
  const kv = parseKv(line);
  const client = parseIp(kvGet(kv, ["srcip"]));
  if (!client) return null;
  const host = hostOf(kvGet(kv, ["qname", "hostname"])) ?? hostOf(kvGet(kv, ["url"]));
  const app = kvGet(kv, ["app"]);
  if (!host && !app) return null;
  const action = kvGet(kv, ["action"]);
  const utm = kvGet(kv, ["utmaction"]);
  const cat = kvGet(kv, ["catdesc", "appcat"]);
  return hit("fortinet", client, {
    clientName: kvGet(kv, ["srcname"]),
    host,
    app,
    bytesUp: num(kvGet(kv, ["sentbyte"])),
    blocked: (action ? isBlockAction(action) : false) || (utm ? isBlockAction(utm) : false),
    aiCategory: cat ? isAiCategory(cat) : false,
    dns: kvGet(kv, ["subtype"]) === "dns" || kvGet(kv, ["qname"]) !== null,
  });
}

export function parseSophos(line: string): LogHit | null {
  const sfos = line.includes("src_ip=") || line.includes("log_component=");
  const utm = line.includes("httpproxy[") && line.includes("srcip=");
  if (!sfos && !utm) return null;
  const kv = parseKv(line);
  const client = parseIp(kvGet(kv, ["src_ip", "srcip"]));
  if (!client) return null;
  const host = hostOf(kvGet(kv, ["domain", "fqdn", "host"])) ?? hostOf(kvGet(kv, ["url"]));
  const app = kvGet(kv, ["application", "app_name"]);
  if (!host && !app) return null;
  const blocked = ["log_subtype", "action", "status"].some((k) => {
    const v = kvGet(kv, [k]);
    return v ? isBlockAction(v) : false;
  });
  const aiCategory = ["category", "category_name", "categoryname"].some((k) => {
    const v = kvGet(kv, [k]);
    return v ? isAiCategory(v) : false;
  });
  return hit("sophos", client, { host, app, bytesUp: num(kvGet(kv, ["sent_bytes", "bytes_sent", "sent_bytes_total"])), blocked, aiCategory });
}

/** CSV split honouring double quotes ("a,b" stays one field; "" is an escaped quote). */
export function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && q && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (c === '"') q = !q;
    else if (c === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function parsePaloAlto(line: string): LogHit | null {
  if (!(line.includes(",THREAT,") || line.includes(",TRAFFIC,"))) return null;
  const f = splitCsv(line);
  const t = f.findIndex((x) => x === "THREAT" || x === "TRAFFIC");
  if (t < 3) return null;
  const base = t - 3;
  const get = (k: number) => f[base + k] ?? "";
  const client = parseIp(get(7));
  if (!client) return null;
  const appRaw = get(14);
  const app = appRaw && appRaw !== "incomplete" && appRaw !== "not-applicable" ? appRaw : null;
  const action = get(30);
  if (f[t] === "THREAT") {
    if (get(4) !== "url") return null;
    const host = hostOf(get(31));
    if (!host) return null;
    return hit("paloalto", client, { host, app, blocked: isBlockAction(action), aiCategory: isAiCategory(get(33)) });
  }
  let host: string | null = null;
  for (const x of f.slice(base + 8)) {
    if (x.includes(".") && !x.includes(" ")) {
      const h = hostOf(x);
      if (h && !isIP(h) && !h.includes("/")) {
        host = h;
        break;
      }
    }
  }
  if (!app && !host) return null;
  return hit("paloalto", client, { host, app, bytesUp: num(get(32)), blocked: isBlockAction(action), aiCategory: isAiCategory(get(37)) });
}

export function parseMeraki(line: string): LogHit | null {
  if (!line.includes(" urls ") || !line.includes("request: ")) return null;
  const src = line.split(/\s+/).find((t) => t.startsWith("src="));
  const client = parseIp(src?.slice(4));
  if (!client) return null;
  const req = line.split("request: ")[1] ?? "";
  const toks = req.split(/\s+/).filter(Boolean);
  const url = toks.find((t) => t.includes("://")) ?? toks[1];
  const host = hostOf(url);
  if (!host) return null;
  return hit("meraki", client, { host });
}

export function parseUnifi(line: string): LogHit | null {
  const p = line.indexOf("query[");
  if (p < 0) return null;
  const rest = line.slice(p);
  const close = rest.indexOf("] ");
  if (close < 0) return null;
  const toks = rest.slice(close + 2).split(/\s+/).filter(Boolean);
  if (toks.length < 3 || toks[1] !== "from") return null;
  const client = parseIp(toks[2]);
  const host = hostOf(toks[0]);
  if (!client || !host) return null;
  return hit("unifi", client, { host, dns: true });
}

export function parsePfsense(line: string): LogHit | null {
  if (!line.includes("unbound")) return null;
  const p = line.indexOf("info: ");
  if (p < 0) return null;
  const toks = line.slice(p + 6).split(/\s+/).filter(Boolean);
  if (toks.length < 4) return null;
  const client = parseIp(toks[0]);
  if (!client) return null;
  const name = toks[1];
  if (!name.endsWith(".") || toks[3] !== "IN") return null;
  const host = hostOf(name);
  if (!host) return null;
  return hit("pfsense", client, { host, dns: true });
}

/** Fallback: first private IPv4 + every token that looks like a host name. */
export function parseGeneric(line: string): { client: string; hosts: string[] } | null {
  const ip = firstPrivateIpv4(line);
  if (!ip) return null;
  const hosts = line
    .split(/[^A-Za-z0-9._-]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, "").toLowerCase())
    .filter(looksLikeHostname)
    .slice(0, 32);
  return hosts.length ? { client: ip, hosts } : null;
}

/** Firewall syslog parsers, most specific first (same order as the sensor). */
export function parseSyslog(line: string): LogHit | null {
  return parsePaloAlto(line) ?? parseFortinet(line) ?? parseSophos(line) ?? parseMeraki(line) ?? parseUnifi(line) ?? parsePfsense(line);
}

// ---------- cloud log formats (only on the server) ----------

type Json = Record<string, unknown>;

function flatLower(o: Json): Map<string, unknown> {
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

function str(m: Map<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = m.get(k);
    if (typeof v === "string" && v.trim() && v !== "N/A" && v !== "-") return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

/**
 * JSON-lines: Cloudflare Gateway (DNS: QueryName/SrcIP, HTTP: HTTPHost/SourceIP),
 * Zscaler NSS (hostname/url + clientip/cintip + reqsize), or any SIEM JSON with similar fields.
 */
export function parseJsonLine(line: string): LogHit | null {
  let o: unknown;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const m = flatLower(o as Json);
  const has = (k: string) => m.has(k);
  const sourcetype = String(m.get("sourcetype") ?? "").toLowerCase();
  const vendor =
    has("queryname") || has("httphost") || has("resolverdecision") || sourcetype.includes("cloudflare")
      ? "cloudflare"
      : sourcetype.includes("zscaler") || has("reqsize") || has("cintip") || has("clientinternalip")
        ? "zscaler"
        : sourcetype.includes("umbrella")
          ? "umbrella"
          : "json";
  const host =
    hostOf(str(m, ["queryname", "query_name", "qname", "httphost", "hostname", "host", "domain", "fqdn", "servername", "sni", "dest_host", "desthost"])) ??
    hostOf(str(m, ["url", "requesturl", "request_url"]));
  if (!host) return null;
  const client = parseIp(str(m, ["srcip", "sourceip", "source_ip", "cintip", "clientinternalip", "clientip", "client_ip", "cip", "src_ip", "src", "internal_ip", "internalip"]));
  if (!client) return null;
  const action = str(m, ["resolverdecision", "action", "decision", "verdict"]);
  const cat = str(m, ["urlcategory", "urlcat", "category", "categories", "categorynames", "urlsupercategory"]);
  const isDns = has("queryname") || has("qname") || has("query_name") || sourcetype.includes("dns");
  return hit(vendor, client, {
    clientName: str(m, ["devicename", "device_name", "hostname_client", "devicehostname"]),
    host,
    bytesUp: num(str(m, ["reqsize", "requestsize", "request_size", "bytesout", "bytes_out", "sentbytes", "sent_bytes", "bytessent", "bytes_sent"])),
    blocked: action ? isBlockAction(action) : false,
    aiCategory: cat ? isAiCategory(cat) : false,
    dns: isDns,
  });
}

/**
 * Cisco Umbrella CSV. DNS: "ts","identity","identities","internal IP","external IP","action","qtype","rcode","domain.","categories"…
 * Proxy: "ts","identities","internal IP","external IP","dest IP","content type","verdict","URL","referer","ua","status","reqsize"…
 */
export function parseUmbrellaCsv(line: string): LogHit | null {
  if (!line.startsWith('"')) return null;
  const f = splitCsv(line);
  if (f.length < 9) return null;
  const dnsHost = hostOf(f[8]);
  const dnsIp = parseIp(f[3]);
  if (dnsHost && dnsIp && /^(allowed|blocked)$/i.test(f[5] ?? "")) {
    return hit("umbrella", dnsIp, { host: dnsHost, blocked: isBlockAction(f[5]), aiCategory: isAiCategory(f[9] ?? ""), dns: true });
  }
  const pIp = parseIp(f[2]);
  const pHost = hostOf(f[7]);
  if (pIp && pHost) {
    return hit("umbrella", pIp, { host: pHost, blocked: isBlockAction(f[6] ?? ""), bytesUp: num(f[11]) });
  }
  return null;
}

/** Any line of a cloud push: JSON, Umbrella CSV, then the firewall syslog parsers. */
export function parseCloudLine(line: string): LogHit | null {
  const t = line.trim();
  if (!t) return null;
  if (t.startsWith("{")) return parseJsonLine(t);
  return parseUmbrellaCsv(t) ?? parseSyslog(t);
}

function num(v: string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 1e12) : 0;
}

// ---------- matching and aggregation (syslog::process_line) ----------

export interface Match {
  serviceId: string;
  kind: string;
}

export interface Matcher {
  service(host: string): Match | null;
  blocked(host: string): Match | null;
  byApp(app: string): Match | null;
}

export interface EdgeEventIn {
  day: string;
  serviceId: string;
  kind?: string;
  client: string;
  clientName?: string | null;
  /** Email della persona, quando il log la riporta (Cloudflare, Zscaler, Umbrella…). */
  email?: string | null;
  hits: number;
  bytesUp: number;
  blocked: number;
  source: string;
}

export interface EdgeCandidateIn {
  day: string;
  domain: string;
  client: string;
  email?: string | null;
  hits: number;
  source: string;
}

/** Suffix match against a list of domains (same as catalog matchDomain). */
export function suffixMatch(host: string, domains: string[]): boolean {
  const h = host.toLowerCase().replace(/\.+$/, "");
  return domains.some((d) => h === d || h.endsWith("." + d) || (d.startsWith("bedrock") && h.includes(d)));
}

/** Service whose id or name appears in a firewall App-ID ("openai-chatgpt" → chatgpt). */
export function serviceByApp(app: string, services: { id: string; name: string; kind: string }[]): Match | null {
  const a = `-${app.toLowerCase().replace(/[^a-z0-9]/g, "-")}-`;
  const s = services.find((s) => {
    const id = s.id.toLowerCase();
    const name = s.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    return (id.length >= 4 && a.includes(`-${id}-`)) || (name.length >= 4 && a === `-${name}-`);
  });
  return s ? { serviceId: s.id, kind: s.kind || "web" } : null;
}

/**
 * Parses a whole log push and aggregates AI hits per (day, service, client, source).
 * Non-AI lines are dropped; hosts are never kept beyond the catalog match.
 */
export function aggregateLog(text: string, matcher: Matcher, opts: { day: string; anonymous: boolean; prefix?: string; maxLines?: number }) {
  const prefix = opts.prefix ?? "cloud";
  const events = new Map<string, EdgeEventIn>();
  const candidates = new Map<string, EdgeCandidateIn>();
  const names = new Map<string, string>();
  let lines = 0;
  let aiLines = 0;
  const add = (serviceId: string, kind: string, client: string, source: string, bytesUp: number, blocked: boolean) => {
    const c = opts.anonymous ? "*" : client;
    const k = `${serviceId}|${c}|${source}`;
    const e = events.get(k) ?? { day: opts.day, serviceId, kind, client: c, hits: 0, bytesUp: 0, blocked: 0, source };
    e.hits++;
    e.bytesUp += bytesUp;
    if (blocked) e.blocked++;
    events.set(k, e);
    aiLines++;
  };
  const max = opts.maxLines ?? 200_000;
  let start = 0;
  while (start < text.length && lines < max) {
    let end = text.indexOf("\n", start);
    if (end < 0) end = text.length;
    const line = text.slice(start, Math.min(end, start + 64 * 1024)).replace(/[\r\0]+$/g, "");
    start = end + 1;
    if (!line.trim()) continue;
    lines++;
    const h = parseCloudLine(line);
    if (h) {
      if (!h.client) continue;
      const source = `${prefix}:${h.vendor}`;
      if (h.clientName && !opts.anonymous && /^[\w.-]{1,64}$/.test(h.clientName)) names.set(h.client, h.clientName);
      const m = (h.host && (matcher.service(h.host) ?? matcher.blocked(h.host))) || (h.app ? matcher.byApp(h.app) : null);
      if (m) add(m.serviceId, m.kind, h.client, source, h.bytesUp, h.blocked);
      else if (h.host) {
        const d = aiCandidateDomain(h.host) ?? (h.aiCategory ? registrable(h.host) : null);
        if (d) {
          const c = opts.anonymous ? "*" : h.client;
          const k = `${d}|${c}|${source}`;
          const cur = candidates.get(k) ?? { day: opts.day, domain: d, client: c, hits: 0, source };
          cur.hits++;
          candidates.set(k, cur);
        }
      }
      continue;
    }
    const g = parseGeneric(line);
    if (g) {
      for (const host of g.hosts) {
        const m = matcher.service(host);
        if (m) {
          add(m.serviceId, m.kind, g.client, `${prefix}:generic`, 0, false);
          break;
        }
      }
    }
  }
  const evs = [...events.values()].map((e) => (names.has(e.client) ? { ...e, clientName: names.get(e.client)! } : e));
  return { events: evs, candidates: [...candidates.values()], lines, aiLines };
}

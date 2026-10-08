/**
 * angar Gateway — il proxy. Una richiesta:
 * 1. endpoint supportato? (altrimenti 404 JSON)
 * 2. chiave virtuale agk_… → azienda, team, chiave
 * 3. limite di frequenza (memoria + conteggio dal database)
 * 4. corpo (max 10 MB) → regole: solo UE, modelli, dati sanitari, tetto mensile
 * 5. redazione dei valori sensibili nei testi
 * 6. inoltro al provider (timeout, abort se il client chiude), risposta in
 *    streaming senza accumulare il corpo; dall'uso letto al volo → costo
 * 7. log di soli metadati (mai testo del prompt o della risposta)
 *
 * Il database arriva da fuori (GatewayStore): così la logica si prova senza Postgres.
 */
import { randomBytes } from "crypto";
import { rateLimit, retryAfter, clientIp } from "@/lib/rate-limit";
import { costOf } from "./cost";
import { totalRedactions, type RedactCounts } from "./detect";
import { hashGatewayKey, keyFromHeaders } from "./keys";
import { aiSystemDecision, decide, effectivePolicy, modelAllowed, redactBody, requestTexts, type OrgPolicy } from "./policy";
import { DEFAULT_BASE, PASS_RESPONSE_HEADERS, testOverride, upstreamHeaders } from "./upstream";
import { createJsonUsageTap, createUsageTap, type GatewayProvider, type UsageResult } from "./usage";

export const MAX_BODY_BYTES = 10 * 1024 * 1024;
export const UPSTREAM_TIMEOUT_MS = Number(process.env.GATEWAY_TIMEOUT_MS ?? 300_000);
const BAD_KEY_LIMIT = 30; // tentativi con chiave sbagliata al minuto per IP

export interface GatewayKeyRow {
  id: string;
  organizationId: string;
  name: string;
  team: string;
  last4: string;
  provider: string;
  monthlyCapEur: number | null;
  allowedModels: string[];
  redactOverride: boolean | null;
  blockHealthOverride: boolean | null;
  revokedAt: Date | null;
}

export interface UpstreamConfig {
  apiKey: string | null;
  baseUrl: string | null;
  euHosted: boolean;
}

export interface OrgContext {
  planOk: boolean;
  /** Solo UE imposto da fuori: deployment (ANGAR_EU_ONLY) o workspace (Settings → Privacy). */
  forcedEuOnly: boolean;
  policy: OrgPolicy;
  upstreams: Partial<Record<GatewayProvider, UpstreamConfig>>;
  /** Provider il cui sistema AI è "Not allowed" nell'estate → nome dell'AI (assente = nessun blocco). */
  notAllowed?: Partial<Record<GatewayProvider, string>>;
}

export interface LogEntry {
  id: string;
  organizationId: string;
  keyId: string | null;
  keyName: string;
  keyLast4: string;
  team: string;
  provider: GatewayProvider;
  endpoint: string;
  model: string | null;
  stream: boolean;
  inputTokens: number;
  outputTokens: number;
  costEur: number;
  latencyMs: number;
  overheadMs: number | null;
  status: number;
  result: "allowed" | "redacted" | "blocked" | "error";
  reason: string | null;
  redactions: RedactCounts | null;
}

export interface GatewayStore {
  findKey(hash: string): Promise<GatewayKeyRow | null>;
  orgContext(orgId: string): Promise<OrgContext>;
  /** Spesa del mese (EUR) della chiave e del suo team. */
  monthSpend(orgId: string, keyId: string, team: string): Promise<{ key: number; team: number }>;
  /** Richieste della chiave nell'ultimo minuto (limite tra più repliche). */
  recentCount(keyId: string): Promise<number>;
  /** Il nome host dell'endpoint risolve solo a IP pubblici? */
  hostIsPublic(baseUrl: string): Promise<boolean>;
  log(entry: LogEntry): Promise<void>;
}

// ── Endpoint supportati ──────────────────────────────────────────────────

interface Route {
  endpoint: string;
  method: "GET" | "POST";
}

const ROUTES: Record<GatewayProvider, Record<string, Route>> = {
  openai: {
    "POST chat/completions": { endpoint: "chat/completions", method: "POST" },
    "POST embeddings": { endpoint: "embeddings", method: "POST" },
    "GET models": { endpoint: "models", method: "GET" },
  },
  anthropic: {
    "POST messages": { endpoint: "messages", method: "POST" },
  },
};

export const SUPPORTED_ENDPOINTS = Object.entries(ROUTES).flatMap(([p, r]) => Object.keys(r).map((k) => `${p}: ${k.replace(" ", " /")}`));

export const isProvider = (p: string): p is GatewayProvider => p === "openai" || p === "anthropic";

// ── Risposte d'errore nel formato del provider ───────────────────────────

const NO_STORE = { "cache-control": "no-store" };

export function errorResponse(provider: GatewayProvider | null, status: number, message: string, code: string, requestId?: string, extra?: Record<string, string>): Response {
  const body =
    provider === "anthropic"
      ? { type: "error", error: { type: status === 429 ? "rate_limit_error" : status === 401 ? "authentication_error" : status === 403 ? "permission_error" : status === 404 ? "not_found_error" : status === 413 ? "request_too_large" : status >= 500 ? "api_error" : "invalid_request_error", message }, angar: { code } }
      : { error: { message, type: status === 429 ? "rate_limit_exceeded" : status >= 500 ? "server_error" : "invalid_request_error", code } };
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...NO_STORE, ...(requestId ? { "x-angar-request-id": requestId } : {}), ...extra } });
}

// ── Corpo con limite ─────────────────────────────────────────────────────

async function readBody(req: Request, limit: number): Promise<string | null> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > limit) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  return Buffer.concat(parts).toString("utf8");
}

export const newRequestId = () => "req_" + randomBytes(9).toString("base64url");

// ── Handler ──────────────────────────────────────────────────────────────

export interface HandleOptions {
  store: GatewayStore;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Chiamato dopo il log (es. aggiornare la spesa giornaliera). */
  onLogged?: (entry: LogEntry) => void;
}

export async function handleGateway(req: Request, providerRaw: string, path: string[], opts: HandleOptions): Promise<Response> {
  const now = opts.now ?? Date.now;
  const t0 = now();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const store = opts.store;

  if (!isProvider(providerRaw)) {
    return errorResponse(null, 404, `Unknown provider "${providerRaw}". Use /api/gateway/openai/v1 or /api/gateway/anthropic/v1.`, "unknown_provider");
  }
  const provider = providerRaw;
  const route = ROUTES[provider][`${req.method.toUpperCase()} ${path.join("/")}`];
  if (!route) {
    const supported = Object.keys(ROUTES[provider]).map((k) => k.replace(" ", " /v1/")).join(", ");
    return errorResponse(provider, 404, `${req.method} /v1/${path.join("/")} isn't supported by angar Gateway yet. Supported: ${supported}.`, "unsupported_endpoint");
  }

  // Chiave virtuale.
  const ip = clientIp(req.headers);
  const raw = keyFromHeaders(req.headers);
  const key = raw ? await store.findKey(hashGatewayKey(raw)) : null;
  if (!key || key.revokedAt) {
    if (!rateLimit(`gw-bad:${ip}`, BAD_KEY_LIMIT, 60_000)) return errorResponse(provider, 429, "Too many requests with an invalid key.", "rate_limited", undefined, { "retry-after": "60" });
    return errorResponse(provider, 401, raw ? "Invalid or revoked angar Gateway key." : `Missing angar Gateway key. Send it as ${provider === "anthropic" ? "x-api-key" : "Authorization: Bearer"} agk_…`, "invalid_key");
  }
  if (key.provider !== "any" && key.provider !== provider) {
    return errorResponse(provider, 403, `This key is for ${key.provider === "openai" ? "OpenAI" : "Anthropic"} only.`, "wrong_provider");
  }

  const id = newRequestId();
  const ctx = await store.orgContext(key.organizationId);
  if (!ctx.planOk) return errorResponse(provider, 403, "angar Gateway is available on the Govern plan. An owner can change plan in angar → Plan & billing.", "plan", id);
  const policy = effectivePolicy(ctx.policy, key, ctx.forcedEuOnly);

  const base: Omit<LogEntry, "status" | "result" | "reason" | "latencyMs" | "overheadMs"> = {
    id,
    organizationId: key.organizationId,
    keyId: key.id,
    keyName: key.name,
    keyLast4: key.last4,
    team: key.team,
    provider,
    endpoint: route.endpoint,
    model: null,
    stream: false,
    inputTokens: 0,
    outputTokens: 0,
    costEur: 0,
    redactions: null,
  };
  let logged = false;
  const log = (e: Partial<LogEntry> & Pick<LogEntry, "status" | "result">) => {
    if (logged) return;
    logged = true;
    const entry: LogEntry = { ...base, reason: null, overheadMs: null, latencyMs: Math.max(0, Math.round(now() - t0)), ...e };
    void store
      .log(entry)
      .then(() => opts.onLogged?.(entry))
      .catch((err) => console.error("[gateway] log failed", err));
  };
  const blocked = (status: number, reason: string, message: string, extra?: Record<string, string>) => {
    log({ status, result: "blocked", reason });
    return errorResponse(provider, status, message, reason, id, extra);
  };

  // Limite di frequenza: secchio in memoria, poi il conteggio dal database (più repliche).
  if (!rateLimit(`gw:${key.id}`, policy.rpmLimit, 60_000) || (await store.recentCount(key.id)) >= policy.rpmLimit) {
    return blocked(429, "rate_limited", `Rate limit: ${policy.rpmLimit} requests a minute for this key.`, { "retry-after": String(retryAfter(policy.rpmLimit, 60_000)) });
  }

  // Sistema AI del provider segnato "Not allowed" nell'estate: la decisione vale anche qui.
  const na = aiSystemDecision(provider, ctx.notAllowed?.[provider]);
  if (!na.ok) return blocked(na.status, na.reason, na.message);

  // Provider a valle.
  const up = ctx.upstreams[provider];
  const override = testOverride(provider);
  const baseUrl = (override ?? up?.baseUrl ?? DEFAULT_BASE[provider]).replace(/\/+$/, "");
  const upstreamEu = Boolean(up?.baseUrl && up.euHosted);
  if (!up?.apiKey) {
    log({ status: 503, result: "error", reason: "no_upstream" });
    return errorResponse(provider, 503, `No ${provider === "openai" ? "OpenAI" : "Anthropic"} key is set for the gateway yet. An admin can add it in angar → Gateway → Policies.`, "no_upstream", id);
  }
  if (!override && up.baseUrl && !(await store.hostIsPublic(baseUrl))) {
    log({ status: 502, result: "error", reason: "upstream_error" });
    return errorResponse(provider, 502, "The custom endpoint doesn't resolve to a public address.", "upstream_blocked", id);
  }

  // Corpo e regole.
  let body: any = null;
  if (route.method === "POST") {
    const text = await readBody(req, MAX_BODY_BYTES);
    if (text === null) return blocked(413, "bad_request", "Request body is larger than 10 MB.");
    try {
      body = JSON.parse(text || "null");
    } catch {
      return errorResponse(provider, 400, "Request body must be JSON.", "bad_request", id);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse(provider, 400, "Request body must be a JSON object.", "bad_request", id);
    base.model = typeof body.model === "string" ? body.model.slice(0, 120) : null;
    base.stream = body.stream === true;

    const spent = policy.keyCapEur !== null || policy.teamCapEur !== null ? await store.monthSpend(key.organizationId, key.id, key.team) : { key: 0, team: 0 };
    const d = decide({ policy, model: base.model, upstreamEu, texts: policy.blockHealth ? requestTexts(provider, route.endpoint, body) : [], spentKeyEur: spent.key, spentTeamEur: spent.team });
    if (!d.ok) return blocked(d.status, d.reason, d.message);

    const red = redactBody(provider, route.endpoint, body, policy.redactKinds);
    body = red.body;
    if (totalRedactions(red.counts) > 0) base.redactions = red.counts;

    // OpenAI in streaming: chiedere l'uso nell'ultimo blocco.
    if (provider === "openai" && route.endpoint === "chat/completions" && base.stream) {
      body.stream_options = { ...(body.stream_options && typeof body.stream_options === "object" ? body.stream_options : {}), include_usage: true };
    }
  } else if (policy.euOnly && !upstreamEu) {
    return blocked(403, "eu_only", "EU-only mode is on and this provider endpoint is outside the EU.");
  }

  // Inoltro: timeout e abort se il client chiude.
  const ac = new AbortController();
  let abortWhy: "client" | "timeout" | null = null;
  const timer = setTimeout(() => {
    abortWhy = "timeout";
    ac.abort();
  }, UPSTREAM_TIMEOUT_MS);
  const onClientAbort = () => {
    abortWhy ??= "client";
    ac.abort();
  };
  if (req.signal.aborted) onClientAbort();
  else req.signal.addEventListener("abort", onClientAbort, { once: true });
  const cleanup = () => {
    clearTimeout(timer);
    req.signal.removeEventListener("abort", onClientAbort);
  };

  const overheadMs = Math.round(now() - t0);
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/${route.endpoint}`, {
      method: route.method,
      headers: upstreamHeaders(provider, baseUrl, up.apiKey, req.headers),
      body: route.method === "POST" ? JSON.stringify(body) : undefined,
      signal: ac.signal,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    cleanup();
    const why = abortWhy as "client" | "timeout" | null;
    const reason = why === "client" ? "client_closed" : why === "timeout" ? "upstream_timeout" : "upstream_error";
    log({ status: why === "client" ? 499 : 504, result: "error", reason, overheadMs });
    return errorResponse(provider, why === "timeout" ? 504 : 502, why === "timeout" ? "The provider didn't answer in time." : "Couldn't reach the provider.", reason, id);
  }

  const headers = new Headers({ ...NO_STORE, "x-angar-request-id": id });
  for (const h of PASS_RESPONSE_HEADERS) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  const resultOf = (status: number): LogEntry["result"] => (status >= 400 ? "error" : base.redactions ? "redacted" : "allowed");

  // GET /models: piccolo, si legge tutto per filtrare i modelli non consentiti.
  if (route.endpoint === "models") {
    const text = await res.text().catch(() => "");
    cleanup();
    let out = text;
    if (res.ok && policy.allowedModels) {
      try {
        const j = JSON.parse(text);
        if (Array.isArray(j.data)) j.data = j.data.filter((m: any) => modelAllowed(m?.id, policy.allowedModels));
        out = JSON.stringify(j);
      } catch {
        // risposta non JSON: si gira com'è
      }
    }
    log({ status: res.status, result: resultOf(res.status), reason: res.ok ? null : "upstream_error", overheadMs });
    return new Response(out, { status: res.status, headers });
  }

  if (!res.body) {
    cleanup();
    log({ status: res.status, result: resultOf(res.status), reason: res.ok ? null : "upstream_error", overheadMs });
    return new Response(null, { status: res.status, headers });
  }

  const isSse = (res.headers.get("content-type") ?? "").includes("text/event-stream");
  const tap = isSse ? createUsageTap(provider) : createJsonUsageTap(provider);
  if (isSse) {
    headers.set("cache-control", "no-cache, no-transform");
    headers.set("x-accel-buffering", "no");
  }
  const finish = (status: number, reason: string | null) => {
    cleanup();
    let u: UsageResult;
    try {
      u = tap.result();
    } catch {
      u = { inputTokens: 0, outputTokens: 0, model: null, seen: false };
    }
    const model = u.model ?? base.model;
    const c = costOf(model, u);
    log({
      status,
      result: status === 499 ? "error" : resultOf(status),
      reason: reason ?? (status >= 400 ? "upstream_error" : null),
      model,
      inputTokens: u.inputTokens + (u.cacheWriteTokens ?? 0) + (u.cacheReadTokens ?? 0),
      outputTokens: u.outputTokens,
      costEur: Math.round(c.eur * 1e6) / 1e6,
      overheadMs,
    });
  };

  // Passaggio blocco per blocco (pull): niente accumulo del corpo.
  const reader = res.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          finish(res.status, null);
          return;
        }
        tap.push(value);
        controller.enqueue(value);
      } catch (err) {
        const why = abortWhy as "client" | "timeout" | null;
        finish(why === "client" ? 499 : why === "timeout" ? 504 : 502, why === "client" ? "client_closed" : why === "timeout" ? "upstream_timeout" : "upstream_error");
        controller.error(err);
      }
    },
    cancel() {
      abortWhy ??= "client";
      ac.abort();
      void reader.cancel().catch(() => {});
      finish(499, "client_closed");
    },
  });
  return new Response(stream, { status: res.status, headers });
}

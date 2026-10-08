/**
 * angar Gateway — regole e decisione (pure, niente database).
 *
 * Regole dell'azienda (GatewayPolicy) con override della singola chiave
 * (GatewayKey). Prima di tutto: il sistema AI del provider (openai-api / anthropic-api)
 * segnato "Not allowed" nell'estate → bloccato (aiSystemDecision). Poi, come in Policies:
 * 1. solo UE (endpoint a valle fuori UE → bloccato)
 * 2. modelli consentiti
 * 3. dati sanitari
 * 4. tetto mensile (chiave e team)
 * La redazione viene dopo, sul corpo che verrà inoltrato.
 */
import { REDACT_KINDS, isRedactKind, mentionsHealthData, redactText, type RedactCounts, type RedactKind } from "./detect";
import type { GatewayProvider } from "./usage";

export interface OrgPolicy {
  euOnly: boolean;
  redact: boolean;
  redactKinds: RedactKind[];
  blockHealth: boolean;
  modelsRestricted: boolean;
  allowedModels: string[];
  teamCaps: Record<string, number>;
  rpmLimit: number;
}

export const DEFAULT_POLICY: OrgPolicy = {
  euOnly: false,
  redact: true,
  redactKinds: [...REDACT_KINDS],
  blockHealth: true,
  modelsRestricted: false,
  allowedModels: [],
  teamCaps: {},
  rpmLimit: 600,
};

export interface KeyOverrides {
  monthlyCapEur: number | null;
  allowedModels: string[];
  redactOverride: boolean | null;
  blockHealthOverride: boolean | null;
}

/** Riga del database → regole (con valori sicuri se mancano). */
export function policyFromRow(row: Partial<{ euOnly: boolean; redact: boolean; redactKinds: string[]; blockHealth: boolean; modelsRestricted: boolean; allowedModels: string[]; teamCaps: unknown; rpmLimit: number }> | null | undefined): OrgPolicy {
  if (!row) return { ...DEFAULT_POLICY, redactKinds: [...DEFAULT_POLICY.redactKinds] };
  const caps: Record<string, number> = {};
  if (row.teamCaps && typeof row.teamCaps === "object" && !Array.isArray(row.teamCaps)) {
    for (const [k, v] of Object.entries(row.teamCaps as Record<string, unknown>)) if (typeof v === "number" && v > 0) caps[k] = v;
  }
  return {
    euOnly: row.euOnly ?? DEFAULT_POLICY.euOnly,
    redact: row.redact ?? DEFAULT_POLICY.redact,
    redactKinds: (row.redactKinds ?? DEFAULT_POLICY.redactKinds).filter(isRedactKind),
    blockHealth: row.blockHealth ?? DEFAULT_POLICY.blockHealth,
    modelsRestricted: row.modelsRestricted ?? false,
    allowedModels: row.allowedModels ?? [],
    teamCaps: caps,
    rpmLimit: row.rpmLimit && row.rpmLimit > 0 ? row.rpmLimit : DEFAULT_POLICY.rpmLimit,
  };
}

export interface EffectivePolicy {
  euOnly: boolean;
  redactKinds: RedactKind[]; // vuoto = niente redazione
  blockHealth: boolean;
  /** null = tutti i modelli. */
  allowedModels: string[] | null;
  keyCapEur: number | null;
  teamCapEur: number | null;
  rpmLimit: number;
}

/** Regole effettive per una chiave: l'override della chiave vince su quella dell'azienda. */
export function effectivePolicy(org: OrgPolicy, key: KeyOverrides & { team: string }, forcedEuOnly = false): EffectivePolicy {
  const redact = key.redactOverride ?? org.redact;
  const keyModels = key.allowedModels.filter(Boolean);
  return {
    euOnly: forcedEuOnly || org.euOnly,
    redactKinds: redact ? org.redactKinds : [],
    blockHealth: key.blockHealthOverride ?? org.blockHealth,
    allowedModels: keyModels.length ? keyModels : org.modelsRestricted ? org.allowedModels : null,
    keyCapEur: key.monthlyCapEur && key.monthlyCapEur > 0 ? key.monthlyCapEur : null,
    teamCapEur: key.team && org.teamCaps[key.team] ? org.teamCaps[key.team] : null,
    rpmLimit: org.rpmLimit,
  };
}

/**
 * Il modello richiesto è nell'elenco? Corrispondenza esatta o per prefisso
 * di versione: "gpt-4o-mini" consente "gpt-4o-mini-2024-07-18";
 * "claude-sonnet" consente "claude-sonnet-4-5". Un elemento che finisce con "*"
 * è un prefisso esplicito.
 */
export function modelAllowed(model: string | null | undefined, allowed: string[] | null): boolean {
  if (!allowed) return true;
  if (!model) return false;
  const m = model.toLowerCase();
  return allowed.some((raw) => {
    const a = raw.trim().toLowerCase();
    if (!a) return false;
    if (a.endsWith("*")) return m.startsWith(a.slice(0, -1));
    return m === a || m.startsWith(a + "-") || m.startsWith(a + "@") || m.startsWith(a + ":");
  });
}

export type BlockReason = "eu_only" | "model_not_allowed" | "health_data" | "cap_exceeded" | "ai_not_allowed";

/** Servizio del catalogo (AiAsset.serviceId) che corrisponde a ogni provider del Gateway. */
export const GATEWAY_SERVICE_ID: Record<GatewayProvider, string> = { openai: "openai-api", anthropic: "anthropic-api" };
const PROVIDER_NAME: Record<GatewayProvider, string> = { openai: "OpenAI", anthropic: "Anthropic" };

/**
 * Il sistema AI del provider è "Not allowed" (UNAPPROVED) nell'estate? Allora il Gateway nega
 * ogni richiesta verso quel provider. name = nome dell'AI non consentita, null se consentita.
 */
export function aiSystemDecision(provider: GatewayProvider, name: string | null | undefined): Decision {
  if (!name) return { ok: true };
  return {
    ok: false,
    reason: "ai_not_allowed",
    status: 403,
    message: `${name} is set to Not allowed in angar, so the Gateway blocks requests to ${PROVIDER_NAME[provider]}. An admin can change this in angar → AI Estate.`,
  };
}

export const REASON_LABEL: Record<string, string> = {
  eu_only: "Outside the EU",
  model_not_allowed: "Model not allowed",
  health_data: "Health data",
  cap_exceeded: "Monthly cap reached",
  ai_not_allowed: "AI system not allowed",
  rate_limited: "Rate limit",
  upstream_error: "Provider error",
  upstream_timeout: "Provider timeout",
  client_closed: "Client disconnected",
  no_upstream: "No provider key",
  bad_request: "Invalid request",
  plan: "Plan",
};

export interface DecisionInput {
  policy: EffectivePolicy;
  model: string | null;
  /** L'endpoint a valle è nell'UE (dichiarato dall'admin). */
  upstreamEu: boolean;
  /** Testi della richiesta (prima della redazione), per il controllo sanitario. */
  texts: string[];
  spentKeyEur: number;
  spentTeamEur: number;
}

export type Decision = { ok: true } | { ok: false; reason: BlockReason; status: number; message: string };

export function decide(i: DecisionInput): Decision {
  const p = i.policy;
  if (p.euOnly && !i.upstreamEu) {
    return { ok: false, reason: "eu_only", status: 403, message: "EU-only mode is on and this provider endpoint is outside the EU. An admin can set an EU endpoint in angar → Gateway → Policies." };
  }
  if (!modelAllowed(i.model, p.allowedModels)) {
    return { ok: false, reason: "model_not_allowed", status: 403, message: `Model "${i.model ?? "(none)"}" is not allowed for this key. Allowed: ${(p.allowedModels ?? []).join(", ") || "none"}.` };
  }
  if (p.blockHealth && i.texts.some(mentionsHealthData)) {
    return { ok: false, reason: "health_data", status: 403, message: "This request looks like it contains health data, which your company's AI policy doesn't allow to send to AI providers." };
  }
  if (p.keyCapEur !== null && i.spentKeyEur >= p.keyCapEur) {
    return { ok: false, reason: "cap_exceeded", status: 429, message: `This key reached its monthly cap of €${p.keyCapEur}. It resets on the 1st of next month; an admin can raise it in angar.` };
  }
  if (p.teamCapEur !== null && i.spentTeamEur >= p.teamCapEur) {
    return { ok: false, reason: "cap_exceeded", status: 429, message: `This team reached its monthly cap of €${p.teamCapEur}. It resets on the 1st of next month; an admin can raise it in angar.` };
  }
  return { ok: true };
}

// ── Testi della richiesta: lettura e redazione ───────────────────────────

/**
 * Parti di testo della richiesta, per endpoint. Si toccano solo i campi di
 * testo (content stringa, blocchi { type: "text" }, system, input degli
 * embedding): mai immagini, base64, argomenti di tool o altri campi.
 */
function eachText(provider: GatewayProvider, endpoint: string, body: any, fn: (s: string) => string) {
  const mapContent = (c: any): any => {
    if (typeof c === "string") return fn(c);
    if (Array.isArray(c))
      return c.map((part) => {
        if (part && typeof part === "object") {
          if (typeof part.text === "string" && (part.type === "text" || part.type === "input_text" || part.type === undefined)) return { ...part, text: fn(part.text) };
          // Anthropic: tool_result con contenuto testuale.
          if (part.type === "tool_result" && part.content !== undefined) return { ...part, content: mapContent(part.content) };
        }
        return part;
      });
    return c;
  };
  if (!body || typeof body !== "object") return body;
  const out = { ...body };
  if (endpoint === "embeddings") {
    if (typeof out.input === "string") out.input = fn(out.input);
    else if (Array.isArray(out.input)) out.input = out.input.map((x: unknown) => (typeof x === "string" ? fn(x) : x));
    return out;
  }
  if (Array.isArray(out.messages)) out.messages = out.messages.map((m: any) => (m && typeof m === "object" && m.content !== undefined ? { ...m, content: mapContent(m.content) } : m));
  if (provider === "anthropic" && out.system !== undefined) out.system = mapContent(out.system);
  return out;
}

/** Tutti i testi della richiesta (per il controllo sanitario). */
export function requestTexts(provider: GatewayProvider, endpoint: string, body: unknown): string[] {
  const texts: string[] = [];
  eachText(provider, endpoint, body, (s) => {
    texts.push(s);
    return s;
  });
  return texts;
}

/** Corpo con i valori sensibili sostituiti, e quanti per tipo. */
export function redactBody<T>(provider: GatewayProvider, endpoint: string, body: T, kinds: readonly RedactKind[]): { body: T; counts: RedactCounts } {
  const counts: RedactCounts = {};
  if (!kinds.length) return { body, counts };
  const next = eachText(provider, endpoint, body, (s) => redactText(s, kinds, counts).text);
  return { body: next, counts };
}

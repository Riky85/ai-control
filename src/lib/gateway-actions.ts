"use server";

/**
 * angar Gateway — azioni (solo admin, con il piano Govern). Ogni modifica va
 * nel registro di audit e svuota le cache del proxy per quell'azienda.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { encryptJson } from "@/lib/crypto";
import { planGate, requireFeature } from "@/lib/plan-gate";
import { newGatewayKey } from "@/lib/gateway/keys";
import { REDACT_KINDS } from "@/lib/gateway/detect";
import { policyFromRow } from "@/lib/gateway/policy";
import { checkUpstreamUrl } from "@/lib/gateway/upstream";
import { invalidateGatewayCache } from "@/lib/gateway/store";

const MAX_KEYS = 200;
const clean = (v: unknown, n = 60) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const back = (tab: string, extra = "") => `/gateway?tab=${tab}${extra}`;

/** "gpt-4o-mini, claude-sonnet" → elenco pulito (max 30 modelli). */
function parseModels(v: unknown): string[] {
  return Array.from(new Set(String(v ?? "").split(/[\s,;]+/).map((m) => m.trim().toLowerCase()).filter((m) => /^[a-z0-9][a-z0-9._:@/*-]{0,79}$/.test(m)))).slice(0, 30);
}

function parseEur(v: unknown): number | null {
  const s = String(v ?? "").replace(/[€\s,]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n * 100) / 100, 10_000_000) : null;
}

const triState = (v: unknown): boolean | null => (v === "on" ? true : v === "off" ? false : null);

async function admin(tab: string) {
  const s = await requireRole("ADMIN", back(tab));
  await requireFeature("gateway", back(tab));
  return s;
}

function done(orgId: string, tab: string, extra = "") {
  invalidateGatewayCache(orgId);
  revalidatePath("/gateway");
  redirect(back(tab, extra));
}

// ── Chiavi ───────────────────────────────────────────────────────────────

/** Nuova chiave virtuale: si vede una volta sola. */
export async function createGatewayKeyAction(input: { name: string; team: string; provider: string; cap: string; models: string }): Promise<{ key: string; last4: string } | { error: string }> {
  const s = await requireRole("ADMIN", back("keys"));
  const gate = await planGate(s.orgId, "gateway");
  if (!gate.ok) return { error: gate.message };
  const name = clean(input?.name) || "Gateway key";
  const team = clean(input?.team, 40);
  const provider = ["openai", "anthropic", "any"].includes(input?.provider) ? input.provider : "any";
  if ((await db.gatewayKey.count({ where: { organizationId: s.orgId, revokedAt: null } })) >= MAX_KEYS) return { error: `At most ${MAX_KEYS} active keys — revoke one first.` };
  const k = newGatewayKey();
  const monthlyCapEur = parseEur(input?.cap);
  const allowedModels = parseModels(input?.models);
  await db.gatewayKey.create({ data: { organizationId: s.orgId, name, team, keyHash: k.hash, last4: k.last4, provider, monthlyCapEur, allowedModels, createdBy: s.email } });
  await audit("gateway.key.create", name, { last4: k.last4, team, provider, monthlyCapEur, allowedModels });
  invalidateGatewayCache(s.orgId);
  revalidatePath("/gateway");
  return { key: k.key, last4: k.last4 };
}

export async function updateGatewayKeyAction(formData: FormData) {
  const s = await admin("keys");
  const key = await db.gatewayKey.findFirst({ where: { id: String(formData.get("id") ?? ""), organizationId: s.orgId, revokedAt: null } });
  if (!key) redirect(back("keys"));
  const data = {
    name: clean(formData.get("name")) || key!.name,
    team: clean(formData.get("team"), 40),
    monthlyCapEur: parseEur(formData.get("cap")),
    allowedModels: parseModels(formData.get("models")),
    redactOverride: triState(formData.get("redact")),
    blockHealthOverride: triState(formData.get("health")),
  };
  await db.gatewayKey.update({ where: { id: key!.id }, data });
  await audit("gateway.key.update", data.name, { last4: key!.last4, ...data });
  done(s.orgId, "keys", "&saved=1");
}

export async function revokeGatewayKeyAction(formData: FormData) {
  const s = await requireRole("ADMIN", back("keys"));
  const key = await db.gatewayKey.findFirst({ where: { id: String(formData.get("id") ?? ""), organizationId: s.orgId, revokedAt: null } });
  if (key) {
    await db.gatewayKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    await audit("gateway.key.revoke", key.name, { last4: key.last4, team: key.team });
  }
  done(s.orgId, "keys", "&revoked=1");
}

// ── Regole ───────────────────────────────────────────────────────────────

const TOGGLES = ["euOnly", "redact", "blockHealth", "modelsRestricted"] as const;
type Toggle = (typeof TOGGLES)[number];

/** Interruttore di una regola. */
export async function toggleGatewayRuleAction(formData: FormData) {
  const s = await admin("policies");
  const field = String(formData.get("field") ?? "") as Toggle;
  if (!TOGGLES.includes(field)) redirect(back("policies"));
  const on = formData.get("on") === "1";
  await db.gatewayPolicy.upsert({ where: { organizationId: s.orgId }, create: { organizationId: s.orgId, [field]: on, updatedBy: s.email }, update: { [field]: on, updatedBy: s.email } });
  await audit("gateway.policy.update", field, { [field]: on });
  done(s.orgId, "policies");
}

/** Tipi da redigere, modelli consentiti e limite di frequenza. */
export async function saveGatewayPolicyAction(formData: FormData) {
  const s = await admin("policies");
  const section = String(formData.get("section") ?? "");
  const data: Record<string, unknown> = { updatedBy: s.email };
  if (section === "redact") data.redactKinds = REDACT_KINDS.filter((k) => formData.get(`kind_${k}`) === "on");
  if (section === "models") data.allowedModels = parseModels(formData.get("models"));
  if (section === "rate") {
    const n = Math.round(Number(formData.get("rpm")));
    if (!Number.isFinite(n) || n < 1 || n > 100_000) redirect(back("policies", "&error=" + encodeURIComponent("Pick a rate limit between 1 and 100,000 requests a minute.")));
    data.rpmLimit = n;
  }
  if (Object.keys(data).length === 1) redirect(back("policies"));
  await db.gatewayPolicy.upsert({ where: { organizationId: s.orgId }, create: { organizationId: s.orgId, ...data }, update: data });
  const { updatedBy: _u, ...meta } = data;
  await audit("gateway.policy.update", section, meta);
  done(s.orgId, "policies", "&saved=1");
}

/** Tetto mensile di un team (vuoto = nessun tetto). */
export async function saveTeamCapAction(formData: FormData) {
  const s = await admin("policies");
  const team = clean(formData.get("team"), 40);
  if (!team) redirect(back("policies", "&error=" + encodeURIComponent("Name the team first.")));
  const cap = parseEur(formData.get("cap"));
  const row = await db.gatewayPolicy.findUnique({ where: { organizationId: s.orgId } });
  const caps = { ...policyFromRow(row).teamCaps };
  if (cap === null) delete caps[team];
  else caps[team] = cap;
  await db.gatewayPolicy.upsert({ where: { organizationId: s.orgId }, create: { organizationId: s.orgId, teamCaps: caps, updatedBy: s.email }, update: { teamCaps: caps, updatedBy: s.email } });
  await audit("gateway.policy.team_cap", team, { capEur: cap });
  done(s.orgId, "policies", "&saved=1#caps");
}

// ── Provider a valle ─────────────────────────────────────────────────────

/** Chiave del provider (cifrata) e endpoint opzionale. La chiave non torna mai indietro: solo le ultime 4 cifre. */
export async function saveGatewayUpstreamAction(formData: FormData) {
  const s = await admin("policies");
  const provider = String(formData.get("provider") ?? "");
  if (provider !== "openai" && provider !== "anthropic") redirect(back("policies"));
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const rawUrl = String(formData.get("baseUrl") ?? "").trim();
  const clearKey = formData.get("clearKey") === "1";
  const euHosted = formData.get("euHosted") === "on";
  let baseUrl: string | null = null;
  if (rawUrl) {
    const c = checkUpstreamUrl(rawUrl);
    if (!c.ok) redirect(back("policies", "&error=" + encodeURIComponent(c.error) + "#providers"));
    baseUrl = (c as { url: string }).url;
  }
  if (apiKey && (apiKey.length < 20 || apiKey.length > 300 || /\s/.test(apiKey))) redirect(back("policies", "&error=" + encodeURIComponent("That doesn't look like a provider API key.") + "#providers"));
  if (apiKey.startsWith("agk_")) redirect(back("policies", "&error=" + encodeURIComponent("Paste the provider's key here, not an angar Gateway key.") + "#providers"));
  const keyData = apiKey ? { credentialsEncrypted: encryptJson({ apiKey }), keyLast4: apiKey.slice(-4) } : clearKey ? { credentialsEncrypted: null, keyLast4: null } : {};
  const data = { ...keyData, baseUrl, euHosted: Boolean(baseUrl) && euHosted, updatedBy: s.email };
  await db.gatewayUpstream.upsert({ where: { organizationId_provider: { organizationId: s.orgId, provider } }, create: { organizationId: s.orgId, provider, ...data }, update: data });
  await audit("gateway.upstream.update", provider, { keyChanged: Boolean(apiKey), keyRemoved: clearKey && !apiKey, baseUrl, euHosted: data.euHosted });
  done(s.orgId, "policies", "&saved=1#providers");
}

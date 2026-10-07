/**
 * Job giornaliero dell'AI estate: popola gli archi del grafo dai dati REALI.
 * Idempotente: upsert per chiave stabile (observedKey / key); gli archi rifiutati o
 * confermati non cambiano stato; quelli non più visti diventano "stale" (non cancellati).
 *
 * Fonti:
 * - Gateway angar (30 giorni): modello + fornitore per ogni chiave/app, team della chiave;
 * - connettori cloud (Azure / Bedrock / Vertex): modelli dalle voci di fatturazione (cloud.usage);
 * - Admin API OpenAI / Anthropic: modelli dall'uso (provider.usage), se il piano lo espone;
 * - campo "model" dell'AI (inserito a mano o da import: dichiarato; da un connettore: dedotto);
 *   MAI i modelli "disponibili" di una chiave API (non sono uso);
 * - collegamenti ai dati, owner e reparto, prodotti a posti (abbonamenti).
 */
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { resolveModel, normaliseModelId, productsForService, catalog } from "@/lib/pricing/service";
import { serviceOf } from "@/lib/savings";

const DAY = 86400000;
const WINDOW_DAYS = 30;
/** Origini gestite dal job (gli archi "user" sono delle persone e non si toccano). */
const DEP_ORIGINS = ["gateway", "data_link", "owner", "department", "subscription", "service_product", "asset_vendor"];
const USE_ORIGINS = ["gateway", "cloud_billing", "provider_usage", "asset_record"];

const CLOUD_DEPLOYMENT: Record<string, string> = { "azure-openai": "azure-openai", bedrock: "aws-bedrock", "vertex-ai": "google-vertex", "gemini-api": "google-direct" };
const PLATFORM_DEPLOYMENT: Record<string, string> = { Azure: "azure-openai", Bedrock: "aws-bedrock", "Vertex AI": "google-vertex" };
const API_KEY_CONNECTORS = new Set(["GOOGLE_GEMINI", "MISTRAL", "GROQ", "COHERE", "DEEPSEEK", "XAI", "TOGETHER", "OPENROUTER", "HUGGINGFACE"]);

/** Modello del catalogo da un nome di fatturazione o di log ("Claude Sonnet 4.5", "gpt-4o-2024-08-06"). */
export function resolveLoose(raw: string) {
  const tries = [raw, raw.toLowerCase().replace(/\s+/g, "-"), raw.toLowerCase().replace(/\s+/g, "-").replace(/\./g, "-")];
  let family: ReturnType<typeof resolveModel> = null;
  for (const t of tries) {
    const r = resolveModel(t);
    if (r && r.match !== "family") return r;
    family ??= r;
  }
  return family;
}

const confOf = (match: string | null | undefined, base: "HIGH" | "MEDIUM" | "LOW") => (match === "family" ? "LOW" : match === "prefix" && base === "HIGH" ? "MEDIUM" : base);

interface UseRow {
  rawModel: string;
  deploymentId: string | null;
  region?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  requests?: number;
  spendEur?: number;
  endpoints?: string[];
  maxPrompt?: number;
}

export async function populateEstate(orgId: string, now = new Date()) {
  const runStart = new Date(now.getTime() - 1000);
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY);
  const stats = { modelUses: 0, edges: 0, applications: 0, stale: 0 };

  const assets = await db.aiAsset.findMany({
    where: { organizationId: orgId, deletedAt: null },
    include: {
      connector: { select: { provider: true } },
      dataAccess: { include: { dataAsset: { select: { id: true, name: true } } } },
      subscriptions: { where: { effectiveUntil: null }, select: { id: true, productId: true, source: true, origin: true } },
      activities: { where: { eventType: { in: ["cloud.usage", "provider.usage"] } }, orderBy: { occurredAt: "desc" }, take: 2 },
    },
  });

  const edge = async (d: { fromType: string; fromId: string; toType: string; toId: string; relation: string; source: string; origin: string; confidence: string; evidence: string }) => {
    const observedKey = `${d.origin}|${d.fromType}:${d.fromId}|${d.relation}|${d.toType}:${d.toId}`;
    const ex = await db.dependency.findUnique({ where: { organizationId_observedKey: { organizationId: orgId, observedKey } }, select: { id: true, status: true } });
    const evidence = { text: d.evidence } as Prisma.InputJsonValue;
    if (!ex) await db.dependency.create({ data: { organizationId: orgId, ...d, evidence, observedKey, firstSeenAt: now, lastSeenAt: now } });
    else await db.dependency.update({ where: { id: ex.id }, data: { lastSeenAt: now, evidence, confidence: d.confidence, source: d.source, ...(ex.status === "stale" ? { status: "active" } : {}) } });
    stats.edges++;
  };

  // Scrive gli usi di modelli di un'AI per un'origine, con la quota (token, altrimenti spesa).
  const writeUses = async (assetId: string, origin: string, source: string, base: "HIGH" | "MEDIUM" | "LOW", list: UseRow[], evidence: string) => {
    const merged = new Map<string, UseRow>();
    for (const u of list) {
      const k = `${normaliseModelId(u.rawModel)}|${u.deploymentId ?? ""}`;
      const m = merged.get(k);
      if (!m) merged.set(k, { ...u, endpoints: [...(u.endpoints ?? [])] });
      else {
        m.inputTokens = (m.inputTokens ?? 0) + (u.inputTokens ?? 0);
        m.outputTokens = (m.outputTokens ?? 0) + (u.outputTokens ?? 0);
        m.requests = (m.requests ?? 0) + (u.requests ?? 0);
        m.spendEur = (m.spendEur ?? 0) + (u.spendEur ?? 0);
        m.endpoints = [...new Set([...(m.endpoints ?? []), ...(u.endpoints ?? [])])];
        m.maxPrompt = Math.max(m.maxPrompt ?? 0, u.maxPrompt ?? 0) || undefined;
      }
    }
    const rows = [...merged.values()];
    const tokens = rows.reduce((t, u) => t + (u.inputTokens ?? 0) + (u.outputTokens ?? 0), 0);
    const spend = rows.reduce((t, u) => t + (u.spendEur ?? 0), 0);
    for (const u of rows) {
      const r = resolveLoose(u.rawModel);
      const key = `${origin}|${normaliseModelId(u.rawModel)}|${u.deploymentId ?? ""}`;
      const t = (u.inputTokens ?? 0) + (u.outputTokens ?? 0);
      const share = tokens > 0 ? t / tokens : spend > 0 ? (u.spendEur ?? 0) / spend : rows.length === 1 ? 1 : null;
      const data = {
        rawModel: u.rawModel,
        modelId: r?.model.id ?? null,
        match: r?.match ?? null,
        providerId: r?.model.providerId ?? null,
        deploymentId: u.deploymentId,
        region: u.region ?? null,
        share,
        shareBasis: tokens > 0 ? "tokens" : spend > 0 ? "spend" : null,
        inputTokens30d: u.inputTokens ?? null,
        outputTokens30d: u.outputTokens ?? null,
        requests30d: u.requests ?? null,
        spendEur30d: u.spendEur != null ? Math.round(u.spendEur * 100) / 100 : null,
        endpoints: u.endpoints ?? [],
        maxPromptTokens: u.maxPrompt ?? null,
        source,
        origin,
        confidence: confOf(r?.match, base),
        evidence: { text: r?.match === "family" ? `${evidence} · closest catalog model ${r.model.name}` : evidence } as Prisma.InputJsonValue,
        lastSeenAt: now,
      };
      const ex = await db.aiAssetModelUse.findUnique({ where: { aiAssetId_key: { aiAssetId: assetId, key } }, select: { id: true, status: true } });
      if (!ex) await db.aiAssetModelUse.create({ data: { organizationId: orgId, aiAssetId: assetId, key, firstSeenAt: now, ...data } });
      else await db.aiAssetModelUse.update({ where: { id: ex.id }, data: { ...data, ...(ex.status === "stale" ? { status: "active" } : {}) } });
      stats.modelUses++;
    }
  };

  // ── 1. Gateway: chiavi = applicazioni, modelli con token e quote ──
  const [groups, upstreams] = await Promise.all([
    db.gatewayRequest.groupBy({
      by: ["keyId", "keyName", "team", "provider", "model", "endpoint"],
      where: { organizationId: orgId, createdAt: { gte: since }, result: { in: ["allowed", "redacted"] }, model: { not: null } },
      _sum: { inputTokens: true, outputTokens: true, costEur: true },
      _max: { inputTokens: true },
      _count: { _all: true },
    }),
    db.gatewayUpstream.findMany({ where: { organizationId: orgId }, select: { provider: true, baseUrl: true, euHosted: true } }),
  ]);
  const gwService: Record<string, string> = { openai: "openai-api", anthropic: "anthropic-api" };
  const gwUses = new Map<string, UseRow[]>();
  for (const g of groups) {
    const asset = assets.filter((a) => a.serviceId === gwService[g.provider]).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (!asset || !g.model) continue;
    const up = upstreams.find((u) => u.provider === g.provider);
    const dep = up?.baseUrl && /azure/i.test(up.baseUrl) ? "azure-openai" : g.provider === "openai" ? "openai-direct" : "anthropic-direct";
    gwUses.set(asset.id, [
      ...(gwUses.get(asset.id) ?? []),
      { rawModel: g.model, deploymentId: dep, region: up?.euHosted ? "eu" : null, inputTokens: g._sum.inputTokens ?? 0, outputTokens: g._sum.outputTokens ?? 0, requests: g._count._all, spendEur: g._sum.costEur ?? 0, endpoints: [g.endpoint], maxPrompt: g._max.inputTokens ?? 0 },
    ]);
    if (g.keyId) {
      const externalRef = `gateway-key:${g.keyId}`;
      const app = await db.application.upsert({
        where: { organizationId_externalRef: { organizationId: orgId, externalRef } },
        update: { name: g.keyName || "Gateway key" },
        create: { organizationId: orgId, externalRef, name: g.keyName || "Gateway key", kind: "internal", source: "observed" },
      });
      stats.applications++;
      await edge({ fromType: "application", fromId: app.id, toType: "system", toId: asset.id, relation: "calls", source: "observed", origin: "gateway", confidence: "HIGH", evidence: "Seen in angar Gateway logs (last 30 days)" });
      if (g.team) await edge({ fromType: "team", fromId: g.team, toType: "application", toId: app.id, relation: "uses", source: "observed", origin: "gateway", confidence: "HIGH", evidence: "Team set on the Gateway key" });
    }
  }
  for (const [assetId, list] of gwUses) await writeUses(assetId, "gateway", "observed", "HIGH", list, "Seen in angar Gateway logs (last 30 days)");

  for (const a of assets) {
    // ── 2. Cloud: modelli dalle voci di fatturazione ──
    const cloud = a.activities.find((x) => x.eventType === "cloud.usage");
    const cp = cloud?.payload as { platform?: string; models?: { model: string; eur: number }[] } | null;
    if (cp?.models?.length) {
      const dep = (a.serviceId && CLOUD_DEPLOYMENT[a.serviceId]) || (cp.platform && PLATFORM_DEPLOYMENT[cp.platform]) || null;
      const list = cp.models.filter((m) => m.model !== "Other usage").map((m) => ({ rawModel: m.model, deploymentId: dep, spendEur: m.eur }));
      if (list.length) await writeUses(a.id, "cloud_billing", "observed", "HIGH", list, `Billing SKUs from ${cp.platform ?? "cloud billing"} (last 30 days)`);
    }
    // ── 3. Admin API OpenAI / Anthropic: modelli dall'uso ──
    const pu = a.activities.find((x) => x.eventType === "provider.usage");
    const pp = pu?.payload as { provider?: string; models?: { model: string; inputTokens: number; outputTokens: number; requests?: number }[] } | null;
    if (pp?.models?.length) {
      const dep = pp.provider === "anthropic" ? "anthropic-direct" : "openai-direct";
      await writeUses(a.id, "provider_usage", "observed", "HIGH", pp.models.map((m) => ({ rawModel: m.model, deploymentId: dep, inputTokens: m.inputTokens, outputTokens: m.outputTokens, requests: m.requests })), `${pp.provider === "anthropic" ? "Anthropic" : "OpenAI"} admin usage report (last 30 days)`);
    }
    // ── 4. Campo "model" dell'AI, solo se nessuna fonte osservata e non da una chiave API ──
    const observed = gwUses.has(a.id) || !!cp?.models?.length || !!pp?.models?.length;
    const fromKeyTest = a.connector && API_KEY_CONNECTORS.has(a.connector.provider);
    const recordUse = !observed && !!a.model && !fromKeyTest && !["AZURE_OPENAI", "AWS_BEDROCK", "GOOGLE_VERTEX"].includes(a.connector?.provider ?? "");
    if (recordUse) {
      const names = (a.model ?? "").split(",").map((s) => s.replace(/\(.*\)/, "").trim()).filter(Boolean).slice(0, 5);
      const declared = !a.connectorId;
      await writeUses(a.id, "asset_record", declared ? "declared" : "inferred", declared ? "MEDIUM" : "LOW", names.map((n) => ({ rawModel: n, deploymentId: null })), declared ? "Model entered on the AI record" : `Model named by the ${a.connector?.provider.replace(/_/g, " ").toLowerCase() ?? "source"} connector, usage not measured`);
    }

    // ── 5. Dati raggiunti ──
    for (const d of a.dataAccess)
      await edge({ fromType: "system", fromId: a.id, toType: "data", toId: d.dataAsset.id, relation: "reads", source: a.type === "MCP_SERVER" ? "inferred" : "observed", origin: "data_link", confidence: a.type === "MCP_SERVER" ? "MEDIUM" : "HIGH", evidence: a.type === "MCP_SERVER" ? "What this MCP server can reach (MCP catalog)" : "Data link recorded on the AI system" });
    // ── 6. Owner e reparto ──
    if (a.ownerId) await edge({ fromType: "system", fromId: a.id, toType: "person", toId: a.ownerId, relation: "owned_by", source: "declared", origin: "owner", confidence: "HIGH", evidence: "Owner set on the AI system" });
    if (a.department) await edge({ fromType: "system", fromId: a.id, toType: "team", toId: a.department, relation: "owned_by", source: a.connectorId ? "observed" : "declared", origin: "department", confidence: "MEDIUM", evidence: "Department on the AI system" });
    // ── 7. Prodotti a posti e fornitore ──
    const subs = a.subscriptions.filter((s) => s.productId);
    for (const s of subs)
      await edge({ fromType: "system", fromId: a.id, toType: "product", toId: s.productId!, relation: "subscribes", source: s.origin === "manual" || s.source === "contract" ? "declared" : s.source === "estimate" ? "inferred" : "observed", origin: "subscription", confidence: s.source === "estimate" ? "MEDIUM" : "HIGH", evidence: `Subscription (${s.source})` });
    const svc = serviceOf(a);
    if (!subs.length && svc && a.type !== "AI_API") {
      const seat = productsForService(svc).filter((p) => p.kind === "seat");
      if (seat.length === 1) await edge({ fromType: "system", fromId: a.id, toType: "product", toId: seat[0].id, relation: "subscribes", source: "inferred", origin: "service_product", confidence: "MEDIUM", evidence: `Recognised as ${seat[0].name}` });
    }
    // Fornitore dal vendor dell'AI, solo se nient'altro porta a un fornitore.
    // (un modello solo "disponibile" su una chiave API non conta: lì vale il vendor).
    const hasModel = observed || recordUse;
    if (!hasModel && !subs.length && a.vendor) {
      const p = catalog().providers.find((x) => x.name.toLowerCase() === a.vendor!.toLowerCase() || x.id === a.vendor!.toLowerCase());
      await edge({ fromType: "system", fromId: a.id, toType: "provider", toId: p?.id ?? `name:${a.vendor}`, relation: "provided_by", source: "observed", origin: "asset_vendor", confidence: p ? "MEDIUM" : "LOW", evidence: "Vendor recorded when the AI was found" });
    }
  }

  // ── Non più visti: "stale" (mai rifiutati o confermati) ──
  const s1 = await db.dependency.updateMany({ where: { organizationId: orgId, origin: { in: DEP_ORIGINS }, status: "active", lastSeenAt: { lt: runStart } }, data: { status: "stale" } });
  const s2 = await db.aiAssetModelUse.updateMany({ where: { organizationId: orgId, origin: { in: USE_ORIGINS }, status: "active", lastSeenAt: { lt: runStart } }, data: { status: "stale" } });
  stats.stale = s1.count + s2.count;
  return stats;
}

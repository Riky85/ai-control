/**
 * Catalogo prezzi AI normalizzato: dai dati di partenza (file accanto) a record
 * piatti con id stabili, gli stessi che pricing/catalog-sync.ts scrive nel database.
 * Puro e deterministico: nessun accesso al database qui.
 */
import { PROVIDERS, DEPLOYMENTS, DIRECT_DEPLOYMENT } from "./providers";
import { OPENAI_MODELS } from "./openai";
import { ANTHROPIC_MODELS } from "./anthropic";
import { GOOGLE_MODELS } from "./google";
import { MISTRAL_MODELS, OTHER_MODELS } from "./mistral";
import { SEAT_PRODUCTS, API_PRODUCTS, DEPLOYMENT_PRODUCT } from "./seats";
import type { BillingModel, Capabilities, ComponentKind, Confidence, Lifecycle, SeedComponent, SeedModel, ServiceTier, SourceType, Tier, Unit } from "./types";

export * from "./types";
export { VERIFIED_ON } from "./helpers";

export interface CatProvider { id: string; name: string; kind: string; website: string | null; pricingUrl: string | null; hqRegion: string | null; euDataResidency: boolean | null }
export interface CatDeployment { id: string; kind: string; hostProviderId: string; name: string; regions: string[] }
export interface CatProduct { id: string; providerId: string; name: string; kind: string; serviceId: string | null; billingModel: BillingModel; website: string | null; pricingUrl: string | null }
export interface CatPlan { id: string; productId: string; name: string; audience: "personal" | "business" | "enterprise"; billingModel: BillingModel; minSeats: number | null; maxSeats: number | null; status: string; notes: string | null }
export interface CatSeatType { id: string; planId: string; key: string; name: string; isDefault: boolean; legacyPlanId: string | null; legacyName: string | null }
export interface CatModel {
  id: string;
  providerId: string;
  apiId: string;
  name: string;
  family: string;
  tier: Tier | null;
  lifecycle: Lifecycle;
  releasedAt: Date | null;
  deprecatedAt: Date | null;
  retiresAt: Date | null;
  replacementId: string | null;
  contextWindow: number | null;
  maxOutput: number | null;
  modalitiesIn: string[];
  modalitiesOut: string[];
  capabilities: Capabilities;
  sourceUrl: string | null;
  sourceType: SourceType;
  lastVerifiedAt: Date;
  confidence: Confidence;
}
export interface CatRule { id: string; billingModel: BillingModel; modelId: string | null; productId: string | null; planId: string | null; seatTypeId: string | null; deploymentId: string | null; minSeats: number | null; notes: string | null }
export interface CatComponent {
  /** Chiave stabile (regola, voce, regione, livello, contesto, data d'inizio). */
  key: string;
  ruleId: string;
  kind: ComponentKind;
  unit: Unit;
  price: number;
  currency: "USD" | "EUR";
  region: string;
  serviceTier: ServiceTier;
  contextAbove: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  sourceUrl: string | null;
  sourceType: SourceType;
  lastVerifiedAt: Date;
  confidence: Confidence;
  /** Prezzo della versione precedente della stessa voce, se c'è. */
  previousPrice: number | null;
  note: string | null;
}

export interface Catalog {
  version: string;
  providers: CatProvider[];
  deployments: CatDeployment[];
  products: CatProduct[];
  plans: CatPlan[];
  seatTypes: CatSeatType[];
  models: CatModel[];
  rules: CatRule[];
  components: CatComponent[];
}

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const modelId = (provider: string, apiId: string) => `${provider}:${apiId}`;

/**
 * Ripiego per famiglia quando l'id del modello non è nel catalogo (stesso ordine
 * del vecchio elenco API_MODELS: il primo che corrisponde vince).
 */
export const FAMILY_FALLBACKS: [RegExp, string][] = [
  [/fable/i, "anthropic:claude-fable-5-1"],
  [/mythos/i, "anthropic:claude-mythos-5-1"],
  [/opus/i, "anthropic:claude-opus-5-5"],
  [/sonnet/i, "anthropic:claude-sonnet-5-5"],
  [/haiku/i, "anthropic:claude-haiku-4-5"],
  [/gpt-6[-. ]?astra/i, "openai:gpt-6-astra"],
  [/gpt-5\.5(?!.*mini)/i, "openai:gpt-5.5"],
  [/luna/i, "openai:gpt-6-luna"],
  [/nano|4o-mini|-mini/i, "openai:gpt-4o-mini"],
  [/gpt-6|gpt-5|gpt-4\.1|gpt-4o|\bo3|\bo4/i, "openai:gpt-6.1-sol"],
  [/embedding-3-large/i, "openai:text-embedding-3-large"],
  [/text-embedding-3|embedding-3-small/i, "openai:text-embedding-3-small"],
  [/codestral-embed/i, "mistral:codestral-embed"],
  [/mistral-embed/i, "mistral:mistral-embed"],
  [/embed/i, "angar:embedding-unknown"],
  [/gemini.*pro/i, "google:gemini-3.1-pro-preview"],
  [/gemini.*flash-lite/i, "google:gemini-3.5-flash-lite"],
  [/gemini.*flash/i, "google:gemini-3.8-flash"],
  [/mistral-large/i, "mistral:mistral-large-3"],
  [/mistral-medium/i, "mistral:mistral-medium-3.5"],
  [/mistral-small/i, "mistral:mistral-small-4"],
  [/ministral.*14b/i, "mistral:ministral-3-14b"],
  [/ministral.*3b/i, "mistral:ministral-3-3b"],
  [/ministral/i, "mistral:ministral-3-8b"],
  [/codestral/i, "mistral:codestral"],
  [/deepseek/i, "deepseek:deepseek-chat"],
  [/grok/i, "xai:grok"],
];

// Hash FNV-1a (niente moduli Node: il catalogo si importa anche in contesti edge).
function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function componentKey(ruleId: string, c: SeedComponent) {
  return [ruleId, c.kind, c.region ?? "global", c.serviceTier ?? "standard", c.contextAbove ?? 0, c.from].join("|");
}

function toComponents(ruleId: string, list: SeedComponent[]): CatComponent[] {
  return list.map((c) => ({
    key: componentKey(ruleId, c),
    ruleId,
    kind: c.kind,
    unit: c.unit,
    price: c.price,
    currency: c.currency,
    region: c.region ?? "global",
    serviceTier: c.serviceTier ?? "standard",
    contextAbove: c.contextAbove ?? 0,
    effectiveFrom: day(c.from),
    effectiveUntil: c.until ? day(c.until) : null,
    sourceUrl: c.src.url,
    sourceType: c.src.type,
    lastVerifiedAt: day(c.src.verified),
    confidence: c.src.confidence,
    previousPrice: null,
    note: c.note ?? c.src.note ?? null,
  }));
}

/** Collega ogni voce alla versione precedente della stessa voce (stessa regola, tipo, regione, livello, contesto). */
function linkVersions(list: CatComponent[]) {
  const groups = new Map<string, CatComponent[]>();
  for (const c of list) {
    const k = [c.ruleId, c.kind, c.region, c.serviceTier, c.contextAbove].join("|");
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  for (const g of groups.values()) {
    g.sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
    for (let i = 1; i < g.length; i++) g[i].previousPrice = g[i - 1].price;
  }
}

function buildModel(m: SeedModel): CatModel {
  return {
    id: modelId(m.provider, m.apiId),
    providerId: m.provider,
    apiId: m.apiId,
    name: m.name,
    family: m.family,
    tier: m.tier ?? null,
    lifecycle: m.lifecycle,
    releasedAt: m.releasedAt ? day(m.releasedAt) : null,
    deprecatedAt: m.deprecatedAt ? day(m.deprecatedAt) : null,
    retiresAt: m.retiresAt ? day(m.retiresAt) : null,
    replacementId: m.replacement ? modelId(m.provider, m.replacement) : null,
    contextWindow: m.contextWindow ?? null,
    maxOutput: m.maxOutput ?? null,
    modalitiesIn: m.in,
    modalitiesOut: m.out,
    capabilities: m.caps,
    sourceUrl: m.src.url,
    sourceType: m.src.type,
    lastVerifiedAt: day(m.src.verified),
    confidence: m.src.confidence,
  };
}

export const SEED_MODELS: SeedModel[] = [...OPENAI_MODELS, ...ANTHROPIC_MODELS, ...GOOGLE_MODELS, ...MISTRAL_MODELS, ...OTHER_MODELS];

export function buildCatalog(): Catalog {
  const models = SEED_MODELS.map(buildModel);
  const rules: CatRule[] = [];
  const components: CatComponent[] = [];
  for (const m of SEED_MODELS) {
    const id = modelId(m.provider, m.apiId);
    for (const r of m.rules) {
      const ruleId = `model:${id}@${r.deployment}`;
      rules.push({ id: ruleId, billingModel: r.billingModel ?? "TOKEN_BASED", modelId: id, productId: DEPLOYMENT_PRODUCT[r.deployment] ?? null, planId: null, seatTypeId: null, deploymentId: r.deployment, minSeats: null, notes: r.notes ?? null });
      components.push(...toComponents(ruleId, r.components));
    }
  }
  const products: CatProduct[] = [];
  const plans: CatPlan[] = [];
  const seatTypes: CatSeatType[] = [];
  for (const p of [...SEAT_PRODUCTS, ...API_PRODUCTS]) {
    products.push({ id: p.id, providerId: p.provider, name: p.name, kind: p.kind, serviceId: p.serviceId ?? null, billingModel: p.billingModel, website: p.website ?? null, pricingUrl: p.pricingUrl ?? null });
    for (const pl of p.plans) {
      plans.push({ id: pl.id, productId: p.id, name: pl.name, audience: pl.audience, billingModel: pl.billingModel, minSeats: pl.minSeats ?? null, maxSeats: pl.maxSeats ?? null, status: "active", notes: pl.notes ?? null });
      for (const s of pl.seatTypes) {
        const stId = `${pl.id}:${s.key}`;
        seatTypes.push({ id: stId, planId: pl.id, key: s.key, name: s.name, isDefault: !!s.isDefault, legacyPlanId: s.legacyPlanId ?? null, legacyName: s.legacyName ?? null });
        const ruleId = `seat:${stId}`;
        rules.push({ id: ruleId, billingModel: pl.billingModel, modelId: null, productId: p.id, planId: pl.id, seatTypeId: stId, deploymentId: null, minSeats: pl.minSeats ?? null, notes: pl.notes ?? null });
        components.push(...toComponents(ruleId, s.components));
      }
    }
  }
  linkVersions(components);
  const providers: CatProvider[] = PROVIDERS.map((p) => ({ id: p.id, name: p.name, kind: p.kind, website: p.website ?? null, pricingUrl: p.pricingUrl ?? null, hqRegion: p.hqRegion ?? null, euDataResidency: p.euDataResidency ?? null }));
  const deployments: CatDeployment[] = DEPLOYMENTS.map((d) => ({ id: d.id, kind: d.kind, hostProviderId: d.host, name: d.name, regions: d.regions }));
  const body = { providers, deployments, products, plans, seatTypes, models, rules, components };
  return { version: fnv(JSON.stringify(body)), ...body };
}

export { DIRECT_DEPLOYMENT };

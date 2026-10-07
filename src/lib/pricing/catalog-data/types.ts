/**
 * Tipi del catalogo prezzi AI (dati di partenza, versionati nel codice).
 *
 * Il catalogo vive qui come dati puri e viene caricato nel database da
 * pricing/catalog-sync.ts (idempotente). Nessun prezzo altrove nel codice:
 * chi ha bisogno di un prezzo passa da pricing/service.ts.
 */

export type BillingModel = "SEAT_BASED" | "USAGE_BASED" | "TOKEN_BASED" | "CREDIT_BASED" | "HYBRID" | "CONTRACTED" | "CUSTOM";
export type SourceType = "official" | "secondary" | "customer" | "angar_estimate";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type Lifecycle = "active" | "preview" | "deprecated" | "sunset" | "retired";
export type Tier = "frontier" | "balanced" | "light";
export type ServiceTier = "standard" | "batch" | "flex" | "priority" | "fast" | "promotion";
export type DeploymentKind = "DIRECT_API" | "AZURE" | "BEDROCK" | "VERTEX" | "OTHER";

export type ComponentKind =
  | "input"
  | "output"
  | "cached_input"
  | "cache_write"
  | "cache_write_1h"
  | "reasoning"
  | "image_input"
  | "audio_input"
  | "audio_output"
  | "image_output"
  | "embedding"
  | "search"
  | "tool_call"
  | "session_hour"
  | "credit"
  | "seat_monthly"
  | "seat_annual";

export type Unit = "1M_tokens" | "seat_month" | "1K_requests" | "image" | "hour" | "credit";

export interface Capabilities {
  toolCalling?: boolean;
  structuredOutput?: boolean;
  vision?: boolean;
  audio?: boolean;
  reasoning?: boolean;
  batch?: boolean;
  caching?: boolean;
  streaming?: boolean;
  embeddings?: boolean;
  fineTuning?: boolean;
  mcp?: boolean;
}

/** Da dove viene un numero, e quanto ci si può fidare. */
export interface Provenance {
  url: string | null;
  type: SourceType;
  /** AAAA-MM-GG */
  verified: string;
  confidence: Confidence;
  note?: string;
}

/** Una voce di prezzo, valida da `from` (incluso) a `until` (escluso). */
export interface SeedComponent {
  kind: ComponentKind;
  unit: Unit;
  price: number;
  currency: "USD" | "EUR";
  region?: string; // default "global"
  serviceTier?: ServiceTier; // default "standard"
  contextAbove?: number; // default 0
  from: string; // AAAA-MM-GG
  until?: string;
  src: Provenance;
  note?: string;
}

export interface SeedProvider {
  id: string;
  name: string;
  kind: "model_provider" | "cloud" | "app_vendor";
  website?: string;
  pricingUrl?: string;
  hqRegion?: string;
  euDataResidency?: boolean;
}

export interface SeedDeployment {
  id: string;
  kind: DeploymentKind;
  host: string; // provider id
  name: string;
  regions: string[];
}

/** Prezzi di un modello su un deployment. */
export interface SeedModelRule {
  deployment: string;
  billingModel?: BillingModel; // default TOKEN_BASED
  notes?: string;
  components: SeedComponent[];
}

export interface SeedModel {
  provider: string;
  apiId: string;
  name: string;
  family: string;
  tier?: Tier;
  lifecycle: Lifecycle;
  releasedAt?: string;
  deprecatedAt?: string;
  retiresAt?: string;
  replacement?: string; // apiId dello stesso provider
  contextWindow?: number;
  maxOutput?: number;
  in: string[];
  out: string[];
  caps: Capabilities;
  src: Provenance;
  rules: SeedModelRule[];
}

export interface SeedSeatType {
  key: string; // "standard" | "premium"…
  name: string;
  /** Nome mostrato nel vecchio elenco dei piani (es. "ChatGPT Business (premium seat)"). */
  legacyName?: string;
  legacyPlanId?: string;
  isDefault?: boolean;
  components: SeedComponent[];
}

export interface SeedPlan {
  id: string;
  name: string;
  audience: "personal" | "business" | "enterprise";
  billingModel: BillingModel;
  minSeats?: number;
  maxSeats?: number;
  notes?: string;
  seatTypes: SeedSeatType[];
}

export interface SeedProduct {
  id: string;
  provider: string;
  name: string;
  kind: "seat" | "api" | "hybrid";
  serviceId?: string;
  billingModel: BillingModel;
  website?: string;
  pricingUrl?: string;
  plans: SeedPlan[];
}

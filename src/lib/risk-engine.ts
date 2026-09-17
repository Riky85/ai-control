/**
 * Risk engine deterministico — PRD sezione 6.
 *
 * Claude non e' mai la fonte di verita' per lo score. Questo modulo calcola
 * lo score da fattori concreti letti dal database. Un layer separato,
 * opzionale, puo' poi chiedere a un LLM di *spiegare in prosa* un
 * assessment gia' calcolato — mai il contrario.
 */

import type {
  AiAsset,
  AiAssetConnectedSystem,
  AiAssetDataAccess,
  AiAssetActivity,
  DataAsset,
} from "@prisma/client";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskResult {
  score: number;
  level: RiskLevel;
  reasons: string[];
  mitigations: string[];
}

type AssetWithGraph = AiAsset & {
  connectedSystems: AiAssetConnectedSystem[];
  dataAccess: (AiAssetDataAccess & { dataAsset: DataAsset })[];
  activities: AiAssetActivity[];
};

const SENSITIVE_TIERS = ["PII", "FINANCIAL", "SOURCE_CODE"];
const WRITE_EVENT_PATTERN = /create|write|update|delete|merge|push|deploy/i;
const PRODUCTION_PATTERN = /prod(uction)?/i;

export function assessAssetRisk(asset: AssetWithGraph): RiskResult {
  const reasons: string[] = [];
  const mitigations: string[] = [];
  let score = 0;

  // Provider esterno non gestito: nessun connettore = non riconducibile a un
  // piano Enterprise/managed del cliente.
  if (!asset.connectorId) {
    score += 20;
    reasons.push("Unmanaged external provider (no known enterprise integration)");
  }

  // Accesso a dati sensibili
  const sensitiveAccess = asset.dataAccess.filter((d) =>
    SENSITIVE_TIERS.includes(d.dataAsset.sensitivity)
  );
  if (sensitiveAccess.length > 0) {
    score += Math.min(20, sensitiveAccess.length * 8);
    reasons.push(
      `Access to sensitive data: ${sensitiveAccess.map((d) => d.dataAsset.name).join(", ")}`
    );
  }

  // Capacita' agentica: tipo AI_AGENT / AI_DEV_TOOL con evidenza di azioni di scrittura
  const isAgentic = asset.type === "AI_AGENT" || asset.type === "AI_DEV_TOOL";
  const hasWriteActivity = asset.activities.some((a) => WRITE_EVENT_PATTERN.test(a.eventType));
  if (isAgentic && hasWriteActivity) {
    score += 20;
    reasons.push("Agentic capability with observed write actions");
  } else if (isAgentic) {
    score += 8;
    reasons.push("Agentic capability (no write action observed so far)");
  }

  // Nessun owner assegnato
  if (!asset.ownerId) {
    score += 15;
    reasons.push("No owner assigned");
  } else {
    mitigations.push("Owner assigned");
  }

  // Stato non revisionato/non approvato
  if (asset.status === "UNKNOWN" || asset.status === "UNAPPROVED") {
    score += 15;
    reasons.push(`Status: ${asset.status === "UNKNOWN" ? "unknown" : "not approved"}`);
  } else if (asset.status === "APPROVED") {
    mitigations.push("Asset approved and reviewed");
  }

  // Sistema collegato di produzione
  const prodSystems = asset.connectedSystems.filter((s) => PRODUCTION_PATTERN.test(s.detail ?? ""));
  if (prodSystems.length > 0) {
    score += 10;
    reasons.push(
      `Connected to production systems: ${prodSystems.map((s) => s.detail).join(", ")}`
    );
  }

  score = Math.min(100, score);

  let level: RiskLevel = "LOW";
  if (score >= 70) level = "CRITICAL";
  else if (score >= 45) level = "HIGH";
  else if (score >= 20) level = "MEDIUM";

  if (reasons.length === 0) {
    reasons.push("No elevated risk factors detected");
  }

  return { score, level, reasons, mitigations };
}

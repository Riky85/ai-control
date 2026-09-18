/**
 * Assurance engine deterministico.
 *
 * Stessa regola del risk engine (src/lib/risk-engine.ts): nessun LLM decide
 * un esito. Ogni controllo legge un fatto concreto dal database e produce
 * PASSED / WARNING / FAILED con una motivazione verificabile. Il punteggio
 * di Assurance è la percentuale di controlli superati (i warning contano
 * a metà) — non è l'inverso del risk score: il risk score misura quanto
 * l'asset è pericoloso, l'assurance score misura quanto è stato verificato.
 * Un asset può avere rischio alto ma assurance alta se è stato revisionato,
 * ha un owner, è classificato e il rischio è mitigato.
 *
 * ATTENZIONE SUI 4 LIVELLI (ASSURED/NEEDS_REVIEW/RESTRICTED/BLOCKED):
 * "Restricted" e "Blocked" sono etichette dichiarative — descrivono quanto
 * l'asset dovrebbe essere limitato, ma il prodotto non applica ancora
 * nessun blocco reale (nessun enforcement runtime, per scelta esplicita
 * di scope). Sono calcolate deterministicamente da quanti controlli
 * falliscono e da quanto è alto il rischio, non da un evento di blocco
 * effettivo. Non vanno presentate all'utente come "l'asset è stato
 * bloccato", ma come "l'asset dovrebbe essere trattato come bloccato".
 */

import type {
  AiAsset,
  AiAssetConnectedSystem,
  AiAssetDataAccess,
  AiAssetActivity,
  DataAsset,
} from "@prisma/client";
import type { RiskLevel } from "./risk-engine";

export type CheckStatus = "PASSED" | "WARNING" | "FAILED";
export type AssuranceLevel = "ASSURED" | "NEEDS_REVIEW" | "RESTRICTED" | "BLOCKED";

export interface AssuranceCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface AssuranceResult {
  score: number;
  level: AssuranceLevel;
  passedCount: number;
  warningCount: number;
  failedCount: number;
  checks: AssuranceCheck[];
}

type AssetWithGraph = AiAsset & {
  connectedSystems: AiAssetConnectedSystem[];
  dataAccess: (AiAssetDataAccess & { dataAsset: DataAsset })[];
  activities: AiAssetActivity[];
};

const SENSITIVE_TIERS = ["PII", "FINANCIAL", "SOURCE_CODE"];

export function runAssuranceChecks(
  asset: AssetWithGraph,
  risk: { level: RiskLevel; mitigations: string[] },
  orgHasActivePolicy: boolean
): AssuranceResult {
  const checks: AssuranceCheck[] = [];

  checks.push(
    asset.ownerId
      ? { key: "owner_assigned", label: "Owner assigned", status: "PASSED", detail: "An owner is on record." }
      : { key: "owner_assigned", label: "Owner assigned", status: "FAILED", detail: "No owner assigned." }
  );

  checks.push(
    asset.status === "APPROVED"
      ? { key: "human_reviewed", label: "Reviewed by a human", status: "PASSED", detail: "Status is Approved." }
      : asset.status === "UNREVIEWED"
        ? { key: "human_reviewed", label: "Reviewed by a human", status: "WARNING", detail: "Detected but not yet reviewed." }
        : { key: "human_reviewed", label: "Reviewed by a human", status: "FAILED", detail: `Status is ${asset.status.toLowerCase()}.` }
  );

  checks.push(
    asset.vendor
      ? { key: "vendor_identified", label: "Vendor identified", status: "PASSED", detail: `Vendor: ${asset.vendor}.` }
      : { key: "vendor_identified", label: "Vendor identified", status: "WARNING", detail: "No vendor recorded." }
  );

  const sensitiveAccess = asset.dataAccess.filter((d) => SENSITIVE_TIERS.includes(d.dataAsset.sensitivity));
  if (sensitiveAccess.length === 0) {
    checks.push({
      key: "sensitive_data_managed",
      label: "Sensitive data on a managed provider",
      status: "PASSED",
      detail: "No sensitive data declared for this asset.",
    });
  } else if (asset.connectorId) {
    checks.push({
      key: "sensitive_data_managed",
      label: "Sensitive data on a managed provider",
      status: "PASSED",
      detail: `Sensitive data (${sensitiveAccess.map((d) => d.dataAsset.name).join(", ")}) is behind a managed connector.`,
    });
  } else {
    checks.push({
      key: "sensitive_data_managed",
      label: "Sensitive data on a managed provider",
      status: "FAILED",
      detail: `Sensitive data (${sensitiveAccess.map((d) => d.dataAsset.name).join(", ")}) on an unmanaged provider.`,
    });
  }

  checks.push(
    asset.euAiActTier !== "UNCLASSIFIED"
      ? { key: "eu_ai_act_classified", label: "EU AI Act classification set", status: "PASSED", detail: `Classified as ${asset.euAiActTier.replace(/_/g, " ").toLowerCase()}.` }
      : { key: "eu_ai_act_classified", label: "EU AI Act classification set", status: "WARNING", detail: "Not classified yet." }
  );

  checks.push(
    asset.activities.length > 0
      ? { key: "activity_observed", label: "Activity being observed", status: "PASSED", detail: `${asset.activities.length} event(s) on record.` }
      : { key: "activity_observed", label: "Activity being observed", status: "WARNING", detail: "No activity imported yet — behavior can't be confirmed." }
  );

  if (risk.level === "HIGH" || risk.level === "CRITICAL") {
    checks.push(
      risk.mitigations.length > 0
        ? { key: "risk_mitigated", label: "Elevated risk has a mitigation", status: "WARNING", detail: `${risk.level} risk, partially mitigated: ${risk.mitigations.join(", ")}.` }
        : { key: "risk_mitigated", label: "Elevated risk has a mitigation", status: "FAILED", detail: `${risk.level} risk with no recorded mitigation.` }
    );
  } else {
    checks.push({ key: "risk_mitigated", label: "Elevated risk has a mitigation", status: "PASSED", detail: `Risk level is ${risk.level.toLowerCase()}.` });
  }

  checks.push(
    orgHasActivePolicy
      ? { key: "governed_by_policy", label: "Covered by an active policy", status: "PASSED", detail: "The organization has at least one active policy." }
      : { key: "governed_by_policy", label: "Covered by an active policy", status: "WARNING", detail: "No active policies defined for the organization yet." }
  );

  const passedCount = checks.filter((c) => c.status === "PASSED").length;
  const warningCount = checks.filter((c) => c.status === "WARNING").length;
  const failedCount = checks.filter((c) => c.status === "FAILED").length;
  const score = Math.round((100 * (passedCount + warningCount * 0.5)) / checks.length);

  const level: AssuranceLevel =
    failedCount > 0 && (risk.level === "CRITICAL" || failedCount >= 2)
      ? "BLOCKED"
      : failedCount > 0
        ? "RESTRICTED"
        : warningCount > 0
          ? "NEEDS_REVIEW"
          : "ASSURED";

  return { score, level, passedCount, warningCount, failedCount, checks };
}

import { db } from "@/lib/db";
import { assessAssetRisk } from "@/lib/risk-engine";
import { runAssuranceChecks } from "@/lib/assurance-engine";

/** Rischio + assurance di un asset (motori deterministici, mai un LLM). */
export async function assessAsset(assetId: string) {
  const full = await db.aiAsset.findUnique({
    where: { id: assetId },
    include: { connectedSystems: true, dataAccess: { include: { dataAsset: true } }, activities: { orderBy: { occurredAt: "desc" }, take: 50 } },
  });
  if (!full) return;
  const risk = assessAssetRisk(full);
  await db.riskAssessment.create({ data: { aiAssetId: assetId, level: risk.level, score: risk.score, reasons: risk.reasons, mitigations: risk.mitigations } });
  const orgHasActivePolicy = (await db.policy.count({ where: { organizationId: full.organizationId, enabled: true } })) > 0;
  const a = runAssuranceChecks(full, risk, orgHasActivePolicy);
  await db.assuranceReport.create({
    data: { aiAssetId: assetId, level: a.level, score: a.score, passedCount: a.passedCount, warningCount: a.warningCount, failedCount: a.failedCount, checks: a.checks as any },
  });
}

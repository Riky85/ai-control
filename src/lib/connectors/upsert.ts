import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { ConnectorSyncResult } from "./types";
import { assessAssetRisk } from "@/lib/risk-engine";
import { runAssuranceChecks } from "@/lib/assurance-engine";

/**
 * Scrive il risultato di un sync nel database in modo idempotente:
 * rieseguire lo stesso sync non deve mai duplicare asset o utenti.
 * Al termine, ricalcola il risk assessment per ogni asset toccato
 * (sempre con il motore deterministico, mai con un LLM).
 */
export async function persistSyncResult(
  organizationId: string,
  connectorId: string,
  result: ConnectorSyncResult
) {
  const touchedAssetIds: string[] = [];

  for (const observed of result.assets) {
    const existing = await db.aiAsset.findUnique({
      where: {
        organizationId_connectorId_externalId: {
          organizationId,
          connectorId,
          externalId: observed.externalId,
        },
      },
    });

    const asset = await db.aiAsset.upsert({
      where: {
        organizationId_connectorId_externalId: {
          organizationId,
          connectorId,
          externalId: observed.externalId,
        },
      },
      update: {
        ...(observed.serviceId ? { serviceId: observed.serviceId } : {}),
        name: observed.name,
        vendor: observed.vendor,
        model: observed.model,
        lastSeenAt: new Date(),
      },
      create: {
        organizationId,
        connectorId,
        externalId: observed.externalId,
        type: observed.type,
        serviceId: observed.serviceId,
        name: observed.name,
        vendor: observed.vendor,
        model: observed.model,
        status: "UNKNOWN", // ogni asset appena scoperto parte non revisionato
        lastSeenAt: new Date(),
      },
    });
    touchedAssetIds.push(asset.id);

    // Costo reale dalla fatturazione del provider: sostituisce le stime.
    if (typeof observed.monthlyCost === "number" && Number.isFinite(observed.monthlyCost)) {
      const value = Math.round(observed.monthlyCost * 100) / 100;
      await db.aiSystemCost.upsert({
        where: { aiAssetId: asset.id },
        update: { monthlyCostEstimate: value, basis: "billing_connector", confidence: "HIGH", notes: observed.costNote ?? null },
        create: { aiAssetId: asset.id, monthlyCostEstimate: value, basis: "billing_connector", confidence: "HIGH", notes: observed.costNote ?? null },
      });
    }

    // Change detection: confronto diretto vecchio/nuovo su model e vendor —
    // i due campi di "dipendenza" che il sync può davvero osservare cambiare.
    // Solo per asset già esistenti: un asset appena creato non e' un cambiamento.
    if (existing) {
      const trackedFields: [string, string | null, string | null][] = [
        ["model", existing.model, observed.model ?? null],
        ["vendor", existing.vendor, observed.vendor ?? null],
      ];
      for (const [field, oldValue, newValue] of trackedFields) {
        if (oldValue !== newValue && (oldValue || newValue)) {
          await db.assetChange.create({
            data: { aiAssetId: asset.id, field, oldValue, newValue },
          });
        }
      }
    }

    for (const sys of observed.connectedSystems ?? []) {
      const exists = await db.aiAssetConnectedSystem.findFirst({
        where: { aiAssetId: asset.id, system: sys.system, detail: sys.detail },
      });
      if (!exists) {
        await db.aiAssetConnectedSystem.create({
          data: { aiAssetId: asset.id, system: sys.system, detail: sys.detail },
        });
      }
    }

    for (const activity of observed.activities ?? []) {
      await db.aiAssetActivity.create({
        data: {
          aiAssetId: asset.id,
          source: result.provider,
          eventType: activity.eventType,
          actorRef: activity.actorRef,
          occurredAt: activity.occurredAt,
          payload: activity.payload as any,
        },
      });
    }

    for (const observedUser of observed.users ?? []) {
      const user = await db.user.upsert({
        where: { organizationId_email: { organizationId, email: observedUser.email } },
        update: { name: observedUser.name, department: observedUser.department },
        create: {
          organizationId,
          email: observedUser.email,
          name: observedUser.name,
          department: observedUser.department,
        },
      });

      await db.aiAssetUsage.upsert({
        where: { aiAssetId_userId: { aiAssetId: asset.id, userId: user.id } },
        update: { lastSeenAt: new Date() },
        create: { aiAssetId: asset.id, userId: user.id, lastSeenAt: new Date() },
      });
    }
  }

  await db.connector.update({
    where: { id: connectorId },
    data: {
      lastSyncedAt: new Date(),
      status: "CONNECTED",
      lastSyncError: null,
      lastSyncWarnings: result.warnings.length > 0 ? result.warnings : Prisma.JsonNull,
    },
  });

  // Ricalcola il risk assessment e l'assurance report per ogni asset toccato
  // in questo sync (entrambi deterministici, mai un LLM).
  const orgHasActivePolicy = (await db.policy.count({ where: { organizationId, enabled: true } })) > 0;
  for (const assetId of touchedAssetIds) {
    const full = await db.aiAsset.findUniqueOrThrow({
      where: { id: assetId },
      include: {
        connectedSystems: true,
        dataAccess: { include: { dataAsset: true } },
        activities: { orderBy: { occurredAt: "desc" }, take: 50 },
      },
    });
    const risk = assessAssetRisk(full);
    await db.riskAssessment.create({
      data: {
        aiAssetId: assetId,
        level: risk.level,
        score: risk.score,
        reasons: risk.reasons,
        mitigations: risk.mitigations,
      },
    });
    const assurance = runAssuranceChecks(full, risk, orgHasActivePolicy);
    await db.assuranceReport.create({
      data: {
        aiAssetId: assetId,
        level: assurance.level,
        score: assurance.score,
        passedCount: assurance.passedCount,
        warningCount: assurance.warningCount,
        failedCount: assurance.failedCount,
        checks: assurance.checks as any,
      },
    });
  }

  return { assetsTouched: touchedAssetIds.length, warnings: result.warnings };
}

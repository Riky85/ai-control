import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { ConnectorSyncResult } from "./types";
import { assessAssetRisk } from "@/lib/risk-engine";

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
    const asset = await db.aiAsset.upsert({
      where: {
        organizationId_connectorId_externalId: {
          organizationId,
          connectorId,
          externalId: observed.externalId,
        },
      },
      update: {
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
        name: observed.name,
        vendor: observed.vendor,
        model: observed.model,
        status: "UNKNOWN", // ogni asset appena scoperto parte non revisionato
        lastSeenAt: new Date(),
      },
    });
    touchedAssetIds.push(asset.id);

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

  // Ricalcola il risk assessment per ogni asset toccato in questo sync
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
  }

  return { assetsTouched: touchedAssetIds.length, warnings: result.warnings };
}

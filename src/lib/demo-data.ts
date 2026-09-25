import type { PrismaClient } from "@prisma/client";
import { assessAssetRisk } from "./risk-engine";
import { runAssuranceChecks } from "./assurance-engine";

/**
 * Dati di esempio (Demo Manufacturing): 4 sistemi AI, persone, dati,
 * costi, cambiamenti. Si caricano in qualunque workspace — da Settings →
 * "Load demo data" — e all'avvio solo su un database vuoto. Le connessioni
 * di esempio NON risultano collegate: servono solo come origine dei dati.
 */
export async function seedDemoData(db: PrismaClient, orgId: string) {
  const org = { id: orgId };

  const [marco, laura, finance] = await Promise.all([
    db.user.upsert({
      where: { organizationId_email: { organizationId: org.id, email: "marco.rossi@demo.eu" } },
      update: {},
      create: { organizationId: org.id, email: "marco.rossi@demo.eu", name: "Marco Rossi", department: "Engineering" },
    }),
    db.user.upsert({
      where: { organizationId_email: { organizationId: org.id, email: "laura.bianchi@demo.eu" } },
      update: {},
      create: { organizationId: org.id, email: "laura.bianchi@demo.eu", name: "Laura Bianchi", department: "Sales" },
    }),
    db.user.upsert({
      where: { organizationId_email: { organizationId: org.id, email: "finance.team@demo.eu" } },
      update: {},
      create: { organizationId: org.id, email: "finance.team@demo.eu", name: "Finance Team", department: "Finance" },
    }),
  ]);

  const ms365Connector = await db.connector.upsert({
    where: { organizationId_provider: { organizationId: org.id, provider: "MICROSOFT_365" } },
    update: {},
    create: { organizationId: org.id, provider: "MICROSOFT_365", status: "DISCONNECTED", scopes: ["Application.Read.All", "AuditLog.Read.All"], lastSyncedAt: new Date() },
  });
  const githubConnectorRow = await db.connector.upsert({
    where: { organizationId_provider: { organizationId: org.id, provider: "GITHUB" } },
    update: {},
    create: { organizationId: org.id, provider: "GITHUB", status: "DISCONNECTED", scopes: ["members:read", "administration:read"], lastSyncedAt: new Date() },
  });

  const dataAssets = await Promise.all(
    [
      { name: "Source code", sensitivity: "SOURCE_CODE" as const },
      { name: "Customer PII", sensitivity: "PII" as const },
      { name: "Financial records", sensitivity: "FINANCIAL" as const },
    ].map((d) =>
      db.dataAsset.upsert({
        where: { organizationId_name: { organizationId: org.id, name: d.name } },
        update: {},
        create: { organizationId: org.id, ...d },
      })
    )
  );
  const dataByName = Object.fromEntries(dataAssets.map((d) => [d.name, d]));

  // --- Asset 1: Claude Code, usato da Marco, tocca repo di produzione ---
  const claudeCode = await db.aiAsset.upsert({
    where: {
      organizationId_connectorId_externalId: {
        organizationId: org.id,
        connectorId: githubConnectorRow.id,
        externalId: "claude-code-marco",
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      connectorId: githubConnectorRow.id,
      externalId: "claude-code-marco",
      type: "AI_DEV_TOOL",
      name: "Claude Code",
      vendor: "Anthropic",
      model: "Claude Sonnet 4.6",
      department: "Engineering",
      status: "UNKNOWN",
      firstSeenAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4),
      lastSeenAt: new Date(Date.now() - 1000 * 60 * 5),
      connectedSystems: {
        create: [
          { system: "GitHub", detail: "repo:production-api (production)" },
          { system: "AWS", detail: "account:prod-eu" },
        ],
      },
      dataAccess: { create: [{ dataAssetId: dataByName["Source code"].id }] },
      usages: { create: [{ userId: marco.id, lastSeenAt: new Date() }] },
      activities: {
        create: [
          {
            source: "GITHUB",
            eventType: "pull_request.create",
            actorRef: "marco.rossi",
            occurredAt: new Date(Date.now() - 1000 * 60 * 5),
            payload: { repo: "production-api", pr: 482 },
          },
        ],
      },
    },
    include: { connectedSystems: true, dataAccess: { include: { dataAsset: true } }, activities: true },
  });

  // --- Asset 2: GitHub Copilot, uso diffuso, seat attivi, meno rischio (owner assegnato + approvato) ---
  const copilot = await db.aiAsset.upsert({
    where: {
      organizationId_connectorId_externalId: {
        organizationId: org.id,
        connectorId: githubConnectorRow.id,
        externalId: `github-copilot:${orgId}`,
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      connectorId: githubConnectorRow.id,
      externalId: `github-copilot:${orgId}`,
      type: "AI_DEV_TOOL",
      name: "GitHub Copilot",
      vendor: "GitHub / Microsoft",
      department: "Engineering",
      ownerId: marco.id,
      status: "APPROVED",
      firstSeenAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90),
      lastSeenAt: new Date(Date.now() - 1000 * 60 * 30),
      connectedSystems: { create: [{ system: "GitHub", detail: `org:${orgId}` }] },
      usages: { create: [{ userId: marco.id, lastSeenAt: new Date() }] },
    },
    include: { connectedSystems: true, dataAccess: { include: { dataAsset: true } }, activities: true },
  });

  // --- Asset 3: Copilot Studio Agent (finance), scoperto via MS365, nessun owner ---
  const financeAgent = await db.aiAsset.upsert({
    where: {
      organizationId_connectorId_externalId: {
        organizationId: org.id,
        connectorId: ms365Connector.id,
        externalId: "copilot-studio-finance-agent",
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      connectorId: ms365Connector.id,
      externalId: "copilot-studio-finance-agent",
      type: "AI_AGENT",
      name: "Finance Assistant Agent",
      vendor: "Microsoft",
      model: "Copilot Studio",
      department: "Finance",
      status: "UNAPPROVED",
      firstSeenAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12),
      lastSeenAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
      connectedSystems: { create: [{ system: "Microsoft 365", detail: "SharePoint / Outlook" }] },
      dataAccess: { create: [{ dataAssetId: dataByName["Financial records"].id }] },
      usages: { create: [{ userId: finance.id, lastSeenAt: new Date() }] },
      activities: {
        create: [
          {
            source: "MICROSOFT_365",
            eventType: "agent.invoke",
            actorRef: "finance.team",
            occurredAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
            payload: { action: "draft_email" },
          },
        ],
      },
    },
    include: { connectedSystems: true, dataAccess: { include: { dataAsset: true } }, activities: true },
  });

  // --- Asset 4: app AI di terze parti scoperta via OAuth grant su Entra, sconosciuta a IT ---
  const shadowSalesTool = await db.aiAsset.upsert({
    where: {
      organizationId_connectorId_externalId: {
        organizationId: org.id,
        connectorId: ms365Connector.id,
        externalId: "unknown-ai-sales-copilot",
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      connectorId: ms365Connector.id,
      externalId: "unknown-ai-sales-copilot",
      type: "AI_APPLICATION",
      name: "SalesCopilot AI (third-party OAuth app)",
      vendor: "Unknown vendor",
      department: "Sales",
      status: "UNKNOWN",
      firstSeenAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
      lastSeenAt: new Date(Date.now() - 1000 * 60 * 20),
      connectedSystems: { create: [{ system: "Microsoft 365", detail: "OAuth grant su Outlook + Contacts" }] },
      dataAccess: { create: [{ dataAssetId: dataByName["Customer PII"].id }] },
      usages: { create: [{ userId: laura.id, lastSeenAt: new Date() }] },
    },
    include: { connectedSystems: true, dataAccess: { include: { dataAsset: true } }, activities: true },
  });

  // Ricalcola risk assessment per ogni asset col motore deterministico
  const riskByAssetId = new Map<string, ReturnType<typeof assessAssetRisk>>();
  for (const asset of [claudeCode, copilot, financeAgent, shadowSalesTool]) {
    const risk = assessAssetRisk(asset as any);
    riskByAssetId.set(asset.id, risk);
    await db.riskAssessment.create({
      data: {
        aiAssetId: asset.id,
        level: risk.level,
        score: risk.score,
        reasons: risk.reasons,
        mitigations: risk.mitigations,
      },
    });
  }

  // Stessa forma di payload usata da src/lib/evidence.ts a runtime (dopo ogni
  // sync) — qui replicata invece di importarla, per non dipendere dall'alias
  // "@/" che tsx non risolve in questo script standalone.
  const [totalAssets, byType, byStatus, highRisk] = await Promise.all([
    db.aiAsset.count({ where: { organizationId: org.id, deletedAt: null } }),
    db.aiAsset.groupBy({ by: ["type"], where: { organizationId: org.id, deletedAt: null }, _count: { _all: true } }),
    db.aiAsset.groupBy({ by: ["status"], where: { organizationId: org.id, deletedAt: null }, _count: { _all: true } }),
    db.riskAssessment.groupBy({
      by: ["aiAssetId"],
      where: { aiAsset: { organizationId: org.id }, level: { in: ["HIGH", "CRITICAL"] } },
      _max: { createdAt: true },
    }),
  ]);
  await db.evidence.create({
    data: {
      organizationId: org.id,
      type: "inventory_snapshot",
      summary: `${totalAssets} AI assets on record.`,
      payload: {
        total: totalAssets,
        byType: Object.fromEntries(byType.map((t) => [t.type, t._count._all])),
        byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
        highRiskCount: highRisk.length,
      },
    },
  });

  // Un paio di policy attive dalla libreria, per non mostrare la pagina
  // Policies vuota alla prima visita.
  // NOTA: Policy non ha un vincolo unique su (organizationId, name), quindi
  // Prisma's skipDuplicates (che si traduce in ON CONFLICT DO NOTHING) non ha
  // nulla su cui fare conflitto ed e' un no-op silenzioso — createMany
  // creerebbe due righe duplicate ad ogni deploy. Check-then-create invece.
  const seedPolicies = [
    {
      name: "No unapproved agent in production",
      description:
        "AI agents cannot remain in Unapproved or Unreviewed status while connected to a production system.",
      category: "environment",
    },
    {
      name: "No PII to unmanaged AI",
      description:
        "AI applications without an enterprise/managed connector cannot be granted access to data classified as PII.",
      category: "data_access",
    },
  ];
  for (const p of seedPolicies) {
    const exists = await db.policy.findFirst({ where: { organizationId: org.id, name: p.name } });
    if (!exists) {
      await db.policy.create({ data: { organizationId: org.id, ...p } });
    }
  }

  // Classificazione EU AI Act di esempio (tag leggero, non un framework
  // completo — vedi commento nello schema).
  await db.aiAsset.update({ where: { id: financeAgent.id }, data: { euAiActTier: "HIGH_RISK" } });
  await db.aiAsset.update({ where: { id: claudeCode.id }, data: { euAiActTier: "MINIMAL_RISK" } });

  // Costo demo per mostrare la funzionalità — solo su Claude Code, inserito
  // "a mano" come farebbe un utente reale (idempotente via upsert).
  await db.aiSystemCost.upsert({
    where: { aiAssetId: claudeCode.id },
    update: {},
    create: {
      aiAssetId: claudeCode.id,
      monthlyCostEstimate: 1840,
      confidence: "MEDIUM",
      basis: "manual",
      notes: "Rough estimate from the Anthropic console usage page, not exact billing data.",
    },
  });

  // Esempio dimostrativo di change detection: un cambio di modello già
  // avvenuto, per mostrare la funzionalità anche nei dati demo. Idempotente
  // (creato una sola volta, non ad ogni deploy).
  const existingChange = await db.assetChange.findFirst({
    where: { aiAssetId: claudeCode.id, field: "model" },
  });
  if (!existingChange) {
    await db.assetChange.create({
      data: {
        aiAssetId: claudeCode.id,
        field: "model",
        oldValue: "Claude Sonnet 4",
        newValue: "Claude Sonnet 4.6",
        detectedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
      },
    });
  }

  // Assurance: calcolata qui (dopo policy ed EU AI Act) così riflette lo
  // stato finale dei dati demo, non uno stato intermedio del seed.
  const orgHasActivePolicy = (await db.policy.count({ where: { organizationId: org.id, enabled: true } })) > 0;
  for (const assetId of [claudeCode.id, copilot.id, financeAgent.id, shadowSalesTool.id]) {
    const full = await db.aiAsset.findUniqueOrThrow({
      where: { id: assetId },
      include: {
        connectedSystems: true,
        dataAccess: { include: { dataAsset: true } },
        activities: { orderBy: { occurredAt: "desc" }, take: 50 },
      },
    });
    const risk = riskByAssetId.get(assetId) ?? assessAssetRisk(full as any);
    const assurance = runAssuranceChecks(full as any, risk, orgHasActivePolicy);
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

  // One-time cleanup for duplicate policies created before addPolicyFromLibraryAction
  // and createPolicyAction were made idempotent by name (see src/lib/actions.ts).
  // Safe to run on every deploy: once there are no duplicates left, this is a no-op.
  const allPolicies = await db.policy.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "asc" },
  });
  const seenNames = new Set<string>();
  const duplicateIds: string[] = [];
  for (const p of allPolicies) {
    if (seenNames.has(p.name)) {
      duplicateIds.push(p.id);
    } else {
      seenNames.add(p.name);
    }
  }
  if (duplicateIds.length > 0) {
    await db.policy.deleteMany({ where: { id: { in: duplicateIds } } });
    console.log(`Removed ${duplicateIds.length} duplicate polic${duplicateIds.length === 1 ? "y" : "ies"}.`);
  }

  // One-time cleanup for the noisy evidence snapshots created before
  // recordInventorySnapshot started skipping no-op runs (see src/lib/evidence.ts):
  // collapse consecutive identical snapshots down to the earliest of each run.
  const allSnapshots = await db.evidence.findMany({
    where: { organizationId: org.id, type: "inventory_snapshot" },
    orderBy: { createdAt: "asc" },
  });
  let lastKeptPayload: string | null = null;
  const staleSnapshotIds: string[] = [];
  for (const snap of allSnapshots) {
    const key = JSON.stringify(snap.payload);
    if (key === lastKeptPayload) {
      staleSnapshotIds.push(snap.id);
    } else {
      lastKeptPayload = key;
    }
  }
  if (staleSnapshotIds.length > 0) {
    await db.evidence.deleteMany({ where: { id: { in: staleSnapshotIds } } });
    console.log(`Removed ${staleSnapshotIds.length} no-op evidence snapshot(s).`);
  }

  

}

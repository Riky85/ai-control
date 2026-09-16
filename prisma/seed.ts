import { PrismaClient } from "@prisma/client";
import { assessAssetRisk } from "../src/lib/risk-engine";

const db = new PrismaClient();

async function main() {
  const org = await db.organization.upsert({
    where: { id: "demo-org" },
    update: {},
    create: { id: "demo-org", name: "Demo Manufacturing SpA", country: "IT" },
  });

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
    create: { organizationId: org.id, provider: "MICROSOFT_365", status: "CONNECTED", scopes: ["Application.Read.All", "AuditLog.Read.All"], lastSyncedAt: new Date() },
  });
  const githubConnectorRow = await db.connector.upsert({
    where: { organizationId_provider: { organizationId: org.id, provider: "GITHUB" } },
    update: {},
    create: { organizationId: org.id, provider: "GITHUB", status: "CONNECTED", scopes: ["members:read", "administration:read"], lastSyncedAt: new Date() },
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
        externalId: "github-copilot:demo-org",
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      connectorId: githubConnectorRow.id,
      externalId: "github-copilot:demo-org",
      type: "AI_DEV_TOOL",
      name: "GitHub Copilot",
      vendor: "GitHub / Microsoft",
      department: "Engineering",
      ownerId: marco.id,
      status: "APPROVED",
      firstSeenAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90),
      lastSeenAt: new Date(Date.now() - 1000 * 60 * 30),
      connectedSystems: { create: [{ system: "GitHub", detail: "org:demo-org" }] },
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
  for (const asset of [claudeCode, copilot, financeAgent, shadowSalesTool]) {
    const risk = assessAssetRisk(asset as any);
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

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

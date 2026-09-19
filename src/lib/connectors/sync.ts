import { db } from "@/lib/db";
import { persistSyncResult } from "./upsert";
import { microsoft365Connector } from "./microsoft365";
import { githubConnector } from "./github";
import { anthropicConnector } from "./anthropic";
import { openaiConnector } from "./openai";
import { recordInventorySnapshot } from "@/lib/evidence";
import type { Connector } from "./types";
import type { ConnectorProvider } from "@prisma/client";

const REGISTRY: Record<string, Connector> = {
  MICROSOFT_365: microsoft365Connector,
  GITHUB: githubConnector,
  ANTHROPIC: anthropicConnector,
  OPENAI: openaiConnector,
};

export async function runConnectorSync(organizationId: string, provider: ConnectorProvider) {
  const connectorImpl = REGISTRY[provider];
  if (!connectorImpl) {
    throw new Error(`Connector ${provider} is not implemented yet in this scaffold.`);
  }

  const connectorRow = await db.connector.upsert({
    where: { organizationId_provider: { organizationId, provider } },
    update: { status: "SYNCING" },
    create: { organizationId, provider, status: "SYNCING", scopes: [] },
  });

  try {
    const result = await connectorImpl.sync(connectorRow);
    const summary = await persistSyncResult(organizationId, connectorRow.id, result);
    await recordInventorySnapshot(organizationId);
    return { ok: true as const, ...summary };
  } catch (err) {
    await db.connector.update({
      where: { id: connectorRow.id },
      data: { status: "ERROR", lastSyncError: (err as Error).message },
    });
    return { ok: false as const, error: (err as Error).message };
  }
}

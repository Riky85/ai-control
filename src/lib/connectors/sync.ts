import { db } from "@/lib/db";
import { persistSyncResult } from "./upsert";
import { microsoft365Connector } from "./microsoft365";
import { googleWorkspaceConnector } from "./google-workspace";
import { githubConnector } from "./github";
import { anthropicConnector } from "./anthropic";
import { openaiConnector } from "./openai";
import { recordInventorySnapshot } from "@/lib/evidence";
import { apiKeyConnector, API_KEY_PROVIDERS } from "./api-key-providers";
import { decryptJson } from "@/lib/crypto";
import type { Connector } from "./types";
import type { ConnectorProvider } from "@prisma/client";

const REGISTRY: Record<string, Connector> = {
  MICROSOFT_365: microsoft365Connector,
  GOOGLE_WORKSPACE: googleWorkspaceConnector,
  GITHUB: githubConnector,
  ANTHROPIC: anthropicConnector,
  OPENAI: openaiConnector,
};

export async function runConnectorSync(organizationId: string, provider: ConnectorProvider) {
  // Anthropic/OpenAI: connettore completo (utenti) solo con chiave Admin;
  // con una chiave normale, e per tutti gli altri provider di modelli,
  // il connettore generico a chiave API.
  const existing = await db.connector.findUnique({ where: { organizationId_provider: { organizationId, provider } } });
  const mode = decryptJson<{ mode?: string }>(existing?.credentialsEncrypted)?.mode;
  const connectorImpl =
    (provider === "ANTHROPIC" || provider === "OPENAI") && mode === "admin"
      ? REGISTRY[provider]
      : API_KEY_PROVIDERS[provider] && mode
        ? apiKeyConnector(provider)
        : REGISTRY[provider];
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

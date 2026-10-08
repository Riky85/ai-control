import { db } from "@/lib/db";
import { persistSyncResult } from "./upsert";
import { microsoft365Connector } from "./microsoft365";
import { googleWorkspaceConnector } from "./google-workspace";
import { githubConnector } from "./github";
import { anthropicConnector } from "./anthropic";
import { openaiConnector } from "./openai";
import { oktaConnector } from "./okta";
import { azureOpenAiConnector } from "./azure-openai";
import { awsBedrockConnector } from "./aws-bedrock";
import { googleVertexConnector } from "./google-vertex";
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
  OKTA: oktaConnector,
  AZURE_OPENAI: azureOpenAiConnector,
  AWS_BEDROCK: awsBedrockConnector,
  GOOGLE_VERTEX: googleVertexConnector,
};

export async function runConnectorSync(organizationId: string, provider: ConnectorProvider) {
  // Log di rete via API (Cloudflare Gateway, Cisco Umbrella): passano dalla pipeline di angar Edge.
  if (provider === "CLOUDFLARE_GATEWAY" || provider === "CISCO_UMBRELLA") {
    const r = await (await import("./network-logs")).syncNetworkLogs(organizationId, provider);
    return r.ok ? { ok: true as const, assetsTouched: 0, warnings: r.warnings, assetIds: [] as string[] } : { ok: false as const, error: r.error ?? "Sync failed." };
  }
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
    // Microsoft 365 / Google Workspace: storico email dei servizi AI in background (24 mesi la prima volta).
    if (provider === "MICROSOFT_365" || provider === "GOOGLE_WORKSPACE") {
      void import("./email-history").then((m) => m.startEmailHistory(organizationId, provider)).catch(() => undefined);
      // Consensi OAuth delle app di terze parti (/estate/access), in background; no-op senza il permesso.
      void import("@/lib/access").then((m) => m.refreshOAuthGrants(organizationId, provider)).catch(() => undefined);
    }
    return { ok: true as const, ...summary };
  } catch (err) {
    await db.connector.update({
      where: { id: connectorRow.id },
      data: { status: "ERROR", lastSyncError: (err as Error).message },
    });
    return { ok: false as const, error: (err as Error).message };
  }
}

import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import type { Connector, ConnectorProvider } from "@prisma/client";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

const CONNECTOR_INFO: Record<string, { label: string; implemented: boolean; note: string }> = {
  MICROSOFT_365: {
    label: "Microsoft 365 / Entra ID",
    implemented: true,
    note: "Richiede MS365_TENANT_ID, MS365_CLIENT_ID, MS365_CLIENT_SECRET (app registration con admin consent).",
  },
  GITHUB: {
    label: "GitHub",
    implemented: true,
    note: "Richiede GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID, GITHUB_ORG.",
  },
  ANTHROPIC: {
    label: "Anthropic (Claude)",
    implemented: false,
    note: "Non ancora implementato — richiede Claude Enterprise del cliente pilota (PRD §5.3).",
  },
  OPENAI: {
    label: "OpenAI (ChatGPT)",
    implemented: false,
    note: "Non ancora implementato — richiede ChatGPT Enterprise/Edu del cliente pilota (PRD §5.4).",
  },
  GOOGLE_WORKSPACE: {
    label: "Google Workspace",
    implemented: false,
    note: "Predisposto nello schema, non nel piano MVP1 (PRD §5.5).",
  },
};

export default async function ConnectorsPage() {
  const connectors = await db.connector.findMany({ where: { organizationId: ORG_ID } });
  const byProvider = new Map<ConnectorProvider, Connector>(connectors.map((c) => [c.provider, c]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Connectors</h1>
        <p className="text-sm text-ink-400 mt-1.5">
          Fonti collegate per la discovery. Sync manuale via POST /api/sync/&#123;provider&#125;
          finché non c'è uno scheduler.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {Object.entries(CONNECTOR_INFO).map(([provider, info]) => {
          const row = byProvider.get(provider as ConnectorProvider);
          return (
            <div key={provider} className="rounded-md border border-line bg-panel p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">{info.label}</div>
                <div className="flex items-center gap-2">
                  {!info.implemented && <Badge>DISCONNECTED</Badge>}
                  {row && <Badge>{row.status}</Badge>}
                </div>
              </div>
              <p className="text-xs text-ink-400 mt-1">{info.note}</p>
              {row?.lastSyncedAt && (
                <p className="text-xs text-ink-400 mt-1">
                  Ultimo sync: {new Date(row.lastSyncedAt).toLocaleString()}
                </p>
              )}
              {row?.lastSyncError && (
                <p className="text-xs text-alarm mt-1">Errore: {row.lastSyncError}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

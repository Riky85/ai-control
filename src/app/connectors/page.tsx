import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import { syncConnectorAction } from "@/lib/actions";
import type { Connector, ConnectorProvider } from "@prisma/client";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

const CONNECTOR_INFO: Record<string, { label: string; implemented: boolean; note: string }> = {
  MICROSOFT_365: {
    label: "Microsoft 365 / Entra ID",
    implemented: true,
    note: "Requires MS365_TENANT_ID, MS365_CLIENT_ID, MS365_CLIENT_SECRET (app registration with admin consent).",
  },
  GITHUB: {
    label: "GitHub",
    implemented: true,
    note: "Requires GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID, GITHUB_ORG.",
  },
  ANTHROPIC: {
    label: "Anthropic (Claude)",
    implemented: true,
    note: "Requires ANTHROPIC_ADMIN_API_KEY. Sees org members only, never conversation content — see PRD §5.3.",
  },
  OPENAI: {
    label: "OpenAI (ChatGPT)",
    implemented: true,
    note: "Requires OPENAI_ADMIN_API_KEY. Usage metrics (Workspace Analytics) not yet imported — see PRD §5.4.",
  },
  GOOGLE_WORKSPACE: {
    label: "Google Workspace",
    implemented: false,
    note: "Reserved in the schema, not planned for MVP1 (PRD §5.5).",
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
          Sources feeding the inventory. Sync runs on demand until a scheduler is in place.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {Object.entries(CONNECTOR_INFO).map(([provider, info]) => {
          const row = byProvider.get(provider as ConnectorProvider);
          return (
            <div key={provider} className="rounded-md border border-line bg-panel p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm text-ink-100">{info.label}</div>
                <div className="flex items-center gap-3">
                  {row && <Badge>{row.status}</Badge>}
                  {!row && <Badge>DISCONNECTED</Badge>}
                  {info.implemented && (
                    <form action={syncConnectorAction}>
                      <input type="hidden" name="provider" value={provider} />
                      <button
                        type="submit"
                        className="text-xs px-2.5 py-1 rounded border border-line text-ink-100 hover:border-accent hover:text-accent transition-colors"
                      >
                        Sync now
                      </button>
                    </form>
                  )}
                </div>
              </div>
              <p className="text-xs text-ink-400 mt-1.5">{info.note}</p>
              {row?.lastSyncedAt && (
                <p className="text-xs text-ink-400 mt-1">
                  Last synced {new Date(row.lastSyncedAt).toLocaleString()}
                </p>
              )}
              {row?.lastSyncError && (
                <p className="text-xs text-alarm mt-1">{row.lastSyncError}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

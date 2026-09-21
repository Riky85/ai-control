import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import { VendorBadge } from "@/components/VendorIcon";
import { syncConnectorAction } from "@/lib/actions";
import type { Connector, ConnectorProvider } from "@prisma/client";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

interface ConnectorInfo {
  label: string;
  implemented: boolean;
  oneClick: boolean;
  note: string;
  envVars: string[];
  steps: string[];
}

const CONNECTOR_INFO: Record<string, ConnectorInfo> = {
  GITHUB: {
    label: "GitHub",
    implemented: true,
    oneClick: true,
    note: "Pick your org, done.",
    envVars: [],
    steps: [],
  },
  MICROSOFT_365: {
    label: "Microsoft 365",
    implemented: true,
    oneClick: false,
    note: "Admin setup required.",
    envVars: ["MS365_TENANT_ID", "MS365_CLIENT_ID", "MS365_CLIENT_SECRET"],
    steps: [
      "Entra ID → App registrations → New registration → copy Client ID and Tenant ID.",
      "API permissions → Microsoft Graph → Application: Application.Read.All, AuditLog.Read.All, Directory.Read.All → Grant admin consent.",
      "Certificates & secrets → New client secret → copy the value.",
      "Paste all 3 into Railway, then Sync now.",
    ],
  },
  ANTHROPIC: {
    label: "Anthropic",
    implemented: true,
    oneClick: false,
    note: "Admin API key required.",
    envVars: ["ANTHROPIC_ADMIN_API_KEY"],
    steps: ["console.anthropic.com → Settings → Admin API keys → generate one.", "Paste it into Railway, then Sync now."],
  },
  OPENAI: {
    label: "OpenAI",
    implemented: true,
    oneClick: false,
    note: "Admin API key required.",
    envVars: ["OPENAI_ADMIN_API_KEY"],
    steps: ["platform.openai.com → Settings → Organization → Admin keys → generate one.", "Paste it into Railway, then Sync now."],
  },
  GOOGLE_WORKSPACE: {
    label: "Google Workspace",
    implemented: false,
    oneClick: false,
    note: "Not built yet.",
    envVars: [],
    steps: [],
  },
};

export default async function ConnectorsPage({ searchParams }: { searchParams: { connected?: string } }) {
  const connectors = await db.connector.findMany({ where: { organizationId: ORG_ID } });
  const byProvider = new Map<ConnectorProvider, Connector>(connectors.map((c) => [c.provider, c]));
  const githubAppReady = Boolean(process.env.GITHUB_APP_SLUG);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Connections</h1>
        <p className="text-sm text-ink-400 mt-1.5">Each one is a separate company — no single login covers all of them.</p>
      </div>

      {searchParams.connected === "github" && (
        <div className="rounded-xl border border-steady/40 bg-steady/5 px-4 py-3 text-sm text-steady">
          GitHub connected. Press Sync now below to pull in your data.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {Object.entries(CONNECTOR_INFO).map(([provider, info]) => {
          const row = byProvider.get(provider as ConnectorProvider);
          const warnings = (row?.lastSyncWarnings as string[] | null) ?? [];
          const connected = row?.status === "CONNECTED";

          return (
            <div key={provider} className="rounded-xl border border-line bg-panel p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <VendorBadge vendor={provider} size={34} />
                <div className="min-w-0">
                  <div className="font-medium text-sm text-ink-100 truncate">{info.label}</div>
                  {row ? <Badge>{row.status}</Badge> : <Badge>DISCONNECTED</Badge>}
                </div>
              </div>

              <p className="text-xs text-ink-400">{info.note}</p>

              {info.implemented && connected && (
                <form action={syncConnectorAction}>
                  <input type="hidden" name="provider" value={provider} />
                  <button type="submit" className="text-xs px-3 py-1.5 rounded-md border border-line text-ink-100 hover:border-ink-100 transition-colors w-full">
                    Sync now
                  </button>
                </form>
              )}
              {info.implemented && info.oneClick && !connected && githubAppReady && (
                <a href="/api/connectors/github/install" className="text-xs font-medium text-center px-3 py-1.5 rounded-md bg-accent text-white hover:bg-accent-dark transition-colors">
                  Connect
                </a>
              )}
              {info.implemented && info.oneClick && !githubAppReady && (
                <p className="text-xs text-signal">Not set up on this deployment yet.</p>
              )}
              {info.implemented && !info.oneClick && !connected && info.steps.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer text-xs font-medium text-center px-3 py-1.5 rounded-md border border-line text-ink-100 hover:border-ink-100 transition-colors list-none">
                    Connect
                  </summary>
                  <div className="mt-3 pt-3 border-t border-line flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {info.envVars.map((v) => (
                        <code key={v} className="text-[11px] bg-ink border border-line rounded px-1.5 py-0.5 text-ink-100">{v}</code>
                      ))}
                    </div>
                    <ol className="text-xs text-ink-100 flex flex-col gap-1 list-decimal list-inside">
                      {info.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  </div>
                </details>
              )}

              {(row?.lastSyncedAt || row?.lastSyncError || warnings.length > 0) && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-ink-400 hover:text-ink-100 list-none">Details</summary>
                  <div className="mt-1.5 flex flex-col gap-1">
                    {row?.lastSyncedAt && <p className="text-ink-400">Last synced {new Date(row.lastSyncedAt).toLocaleString()}</p>}
                    {row?.lastSyncError && <p className="text-alarm">{row.lastSyncError}</p>}
                    {warnings.map((w, i) => (
                      <p key={i} className="text-signal">· {w}</p>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import { syncConnectorAction } from "@/lib/actions";
import type { Connector, ConnectorProvider } from "@prisma/client";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

interface ConnectorInfo {
  label: string;
  category: "Identity" | "Development" | "AI";
  implemented: boolean;
  requiresOrg: boolean; // needs an Enterprise/Team/Org plan, not a personal account
  envVars: string[];
  testOnYourself: string; // honest about what it actually takes to try with your own account
  quickStart: string; // one-line summary of the outcome, shown before the detailed steps
  steps: string[];
}

const CONNECTOR_INFO: Record<string, ConnectorInfo> = {
  GITHUB: {
    label: "GitHub",
    category: "Development",
    implemented: true,
    requiresOrg: false,
    quickStart: "Create a free GitHub org, install a GitHub App with 2 read-only permissions, paste 4 values into Railway.",
    envVars: ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_INSTALLATION_ID", "GITHUB_ORG"],
    testOnYourself:
      "The most realistic one to try on yourself. Needs a GitHub organization (even a free one — anyone can create one in a minute). Copilot and audit log data require a paid org plan, but repository scanning works even on a free org.",
    steps: [
      "If you don't already have one: github.com → the + icon top right → \"New organization\" → pick the Free plan.",
      "Go to github.com/settings/apps/new (a personal GitHub App, installable on your org).",
      "GitHub App name: anything (e.g. \"AI Control Sync\"). Homepage URL: your app's URL on Railway.",
      "Webhook section: uncheck \"Active\" (webhooks aren't handled yet).",
      "Permissions → Repository permissions: Metadata = Read-only.",
      "Permissions → Organization permissions: Members = Read-only, Administration = Read-only.",
      "Create the app, then click \"Generate a private key\" — download the .pem file: that's your GITHUB_APP_PRIVATE_KEY.",
      "Go to github.com/settings/apps/<app-name>/installations → Install → select your organization.",
      "From the URL after installing (or the app's \"Advanced\" page) copy the numeric Installation ID.",
      "On Railway → ai-control project → ai-control service → Variables: set all 4 values (App ID and Installation ID are on the app's page; GITHUB_ORG is your org's slug).",
      "Railway redeploys the service on its own after you save the variables. Come back here and press \"Sync now\".",
    ],
  },
  MICROSOFT_365: {
    label: "Microsoft 365 / Entra ID",
    category: "Identity",
    implemented: true,
    requiresOrg: true,
    quickStart: "Register an app in Microsoft Entra, grant it 3 read-only Graph permissions, paste 3 values into Railway.",
    envVars: ["MS365_TENANT_ID", "MS365_CLIENT_ID", "MS365_CLIENT_SECRET"],
    testOnYourself:
      "Needs a Microsoft Entra tenant with admin rights to grant admin consent. A personal Microsoft account (outlook.com) isn't enough — you need an organization (a free Microsoft 365 developer tenant works too).",
    steps: [
      "portal.azure.com → Microsoft Entra ID → App registrations → New registration.",
      "After creating it, copy the Application (client) ID and Directory (tenant) ID from the Overview page.",
      "API permissions → Add a permission → Microsoft Graph → Application permissions: Application.Read.All, AuditLog.Read.All, Directory.Read.All.",
      "On the same page, click \"Grant admin consent\" (requires a tenant admin role).",
      "Certificates & secrets → New client secret → copy the Value right away (it won't be shown again).",
      "On Railway, set MS365_TENANT_ID, MS365_CLIENT_ID, MS365_CLIENT_SECRET with these three values.",
      "Press \"Sync now\" once Railway has redeployed the service.",
    ],
  },
  ANTHROPIC: {
    label: "Anthropic (Claude)",
    category: "AI",
    implemented: true,
    requiresOrg: true,
    quickStart: "Generate an Admin API key from your Claude Enterprise/Team console and paste it into Railway.",
    envVars: ["ANTHROPIC_ADMIN_API_KEY"],
    testOnYourself:
      "Not testable on a personal Claude.ai or Pro account: needs a Claude Enterprise/Team organization with the Admin API enabled.",
    steps: [
      "console.anthropic.com → Settings → Admin API keys (only visible on Enterprise/Team organizations with this feature enabled).",
      "Generate an Admin API key (prefix sk-ant-admin...).",
      "On Railway, set ANTHROPIC_ADMIN_API_KEY with this value.",
    ],
  },
  OPENAI: {
    label: "OpenAI (ChatGPT)",
    category: "AI",
    implemented: true,
    requiresOrg: true,
    quickStart: "Generate an Admin API key from your OpenAI organization settings and paste it into Railway.",
    envVars: ["OPENAI_ADMIN_API_KEY"],
    testOnYourself:
      "Not testable on a personal ChatGPT or Plus account: needs a ChatGPT Enterprise or Edu organization.",
    steps: [
      "platform.openai.com → Settings → Organization → Admin keys.",
      "Generate an Admin API key (with read permission on users and audit logs).",
      "On Railway, set OPENAI_ADMIN_API_KEY with this value.",
    ],
  },
  GOOGLE_WORKSPACE: {
    label: "Google Workspace",
    category: "Identity",
    implemented: false,
    requiresOrg: true,
    quickStart: "",
    envVars: [],
    testOnYourself: "Reserved in the schema, not built yet (PRD §5.5).",
    steps: [],
  },
};

export default async function ConnectorsPage() {
  const connectors = await db.connector.findMany({ where: { organizationId: ORG_ID } });
  const byProvider = new Map<ConnectorProvider, Connector>(connectors.map((c) => [c.provider, c]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Connections</h1>
        <p className="text-sm text-ink-400 mt-1.5 max-w-lg">
          Sources feeding the inventory. Press Connect on any source to see exactly what to set up.
        </p>
      </div>

      {(["Identity", "Development", "AI"] as const).map((category) => (
        <div key={category} className="flex flex-col gap-3">
          <h2 className="text-xs font-medium text-ink-400">{category}</h2>
          {Object.entries(CONNECTOR_INFO)
            .filter(([, info]) => info.category === category)
            .map(([provider, info]) => {
              const row = byProvider.get(provider as ConnectorProvider);
              const warnings = (row?.lastSyncWarnings as string[] | null) ?? [];
              const connected = row?.status === "CONNECTED";
              return (
                <div key={provider} className="rounded-lg border border-line bg-panel shadow-card p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-sm text-ink-100">{info.label}</span>
                      {row ? <Badge>{row.status}</Badge> : <Badge>DISCONNECTED</Badge>}
                    </div>
                    {info.implemented && connected && (
                      <form action={syncConnectorAction}>
                        <input type="hidden" name="provider" value={provider} />
                        <button
                          type="submit"
                          className="text-xs px-2.5 py-1 rounded-md border border-line text-ink-100 hover:border-ink-100 transition-colors"
                        >
                          Sync now
                        </button>
                      </form>
                    )}
                  </div>

                  <div className="mt-2 flex flex-col gap-2">
                    {row?.lastSyncedAt && (
                      <p className="text-xs text-ink-400">
                        Last synced {new Date(row.lastSyncedAt).toLocaleString()}
                      </p>
                    )}
                    {row?.lastSyncError && <p className="text-xs text-alarm">{row.lastSyncError}</p>}
                    {warnings.length > 0 && (
                      <ul className="text-xs text-signal flex flex-col gap-1">
                        {warnings.map((w, i) => (
                          <li key={i}>· {w}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {info.implemented && !connected && (
                    <p className="text-xs text-ink-400 mt-3">{info.quickStart}</p>
                  )}

                  <details className="mt-3 pt-3 border-t border-line group">
                    <summary
                      className={
                        info.implemented && !connected
                          ? "cursor-pointer list-none inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-accent text-white hover:bg-accent-dark transition-colors"
                          : "cursor-pointer text-xs text-ink-400 hover:text-ink-100 list-none flex items-center gap-1.5"
                      }
                    >
                      {!(info.implemented && !connected) && (
                        <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
                      )}
                      {info.implemented
                        ? connected
                          ? "Connection details"
                          : "Connect"
                        : "Details"}
                    </summary>
                    <div className="mt-3 flex flex-col gap-3">
                      <p className="text-xs text-ink-400">{info.testOnYourself}</p>

                      {info.envVars.length > 0 && (
                        <div>
                          <div className="text-xs text-ink-400 mb-1">Variables to set on Railway</div>
                          <div className="flex flex-wrap gap-1.5">
                            {info.envVars.map((v) => (
                              <code key={v} className="text-[11px] bg-ink border border-line rounded px-1.5 py-0.5 text-ink-100">
                                {v}
                              </code>
                            ))}
                          </div>
                        </div>
                      )}

                      {info.steps.length > 0 && (
                        <ol className="text-xs text-ink-100 flex flex-col gap-1.5 list-decimal list-inside">
                          {info.steps.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </details>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}

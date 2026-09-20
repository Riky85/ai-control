import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import VendorIcon, { VendorBadge } from "@/components/VendorIcon";
import { syncConnectorAction } from "@/lib/actions";
import type { Connector, ConnectorProvider } from "@prisma/client";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

interface ConnectorInfo {
  label: string;
  implemented: boolean;
  oneClick: boolean; // true = un vero flusso "Connect", nessuna configurazione manuale lato cliente
  note: string; // una riga, non un paragrafo
  envVars: string[];
  steps: string[];
}

const CONNECTOR_INFO: Record<string, ConnectorInfo> = {
  GITHUB: {
    label: "GitHub",
    implemented: true,
    oneClick: true,
    note: "Click Connect, pick your GitHub org, done. No passwords, no keys to copy.",
    envVars: [],
    steps: [],
  },
  MICROSOFT_365: {
    label: "Microsoft 365 / Entra ID",
    implemented: true,
    oneClick: false,
    note: "Needs a one-time admin setup in Microsoft Entra — not a login.",
    envVars: ["MS365_TENANT_ID", "MS365_CLIENT_ID", "MS365_CLIENT_SECRET"],
    steps: [
      "Entra ID → App registrations → New registration → copy Client ID and Tenant ID.",
      "API permissions → Microsoft Graph → Application: Application.Read.All, AuditLog.Read.All, Directory.Read.All → Grant admin consent.",
      "Certificates & secrets → New client secret → copy the value.",
      "Paste all 3 into Railway, then Sync now.",
    ],
  },
  ANTHROPIC: {
    label: "Anthropic (Claude)",
    implemented: true,
    oneClick: false,
    note: "Needs a Claude Enterprise/Team Admin API key — not a personal login.",
    envVars: ["ANTHROPIC_ADMIN_API_KEY"],
    steps: ["console.anthropic.com → Settings → Admin API keys → generate one.", "Paste it into Railway, then Sync now."],
  },
  OPENAI: {
    label: "OpenAI (ChatGPT)",
    implemented: true,
    oneClick: false,
    note: "Needs a ChatGPT Enterprise/Edu Admin API key — not a personal login.",
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

      <div className="flex flex-col gap-3">
        {Object.entries(CONNECTOR_INFO).map(([provider, info]) => {
          const row = byProvider.get(provider as ConnectorProvider);
          const warnings = (row?.lastSyncWarnings as string[] | null) ?? [];
          const connected = row?.status === "CONNECTED";

          return (
            <div key={provider} className="rounded-xl border border-line bg-panel shadow-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <VendorBadge vendor={provider} size={38} />
                  <span className="font-medium text-sm text-ink-100">{info.label}</span>
                  {row ? <Badge>{row.status}</Badge> : <Badge>DISCONNECTED</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  {info.implemented && connected && (
                    <form action={syncConnectorAction}>
                      <input type="hidden" name="provider" value={provider} />
                      <button type="submit" className="text-xs px-2.5 py-1 rounded-md border border-line text-ink-100 hover:border-ink-100 transition-colors">
                        Sync now
                      </button>
                    </form>
                  )}
                  {info.implemented && info.oneClick && !connected && githubAppReady && (
                    <a href="/api/connectors/github/install" className="text-xs font-medium px-3 py-1.5 rounded-md bg-accent text-white hover:bg-accent-dark transition-colors">
                      Connect
                    </a>
                  )}
                </div>
              </div>

              <p className="text-xs text-ink-400 mt-2">{info.note}</p>

              {row?.lastSyncedAt && <p className="text-xs text-ink-400 mt-1">Last synced {new Date(row.lastSyncedAt).toLocaleString()}</p>}
              {row?.lastSyncError && <p className="text-xs text-alarm mt-1">{row.lastSyncError}</p>}
              {warnings.length > 0 && (
                <ul className="text-xs text-signal flex flex-col gap-1 mt-1">
                  {warnings.map((w, i) => (
                    <li key={i}>· {w}</li>
                  ))}
                </ul>
              )}

              {info.implemented && info.oneClick && !githubAppReady && (
                <p className="text-xs text-signal mt-2">
                  Not set up on this deployment yet — needs a one-time platform-level GitHub App (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY / GITHUB_APP_SLUG), done once by whoever runs Angar, not by each customer.
                </p>
              )}

              {info.implemented && !info.oneClick && !connected && info.steps.length > 0 && (
                <details className="mt-3 pt-3 border-t border-line group">
                  <summary className="cursor-pointer text-xs text-ink-100 font-medium list-none flex items-center gap-1.5">
                    <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
                    Setup steps
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

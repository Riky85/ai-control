import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import { syncConnectorAction } from "@/lib/actions";
import type { Connector, ConnectorProvider } from "@prisma/client";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

interface ConnectorInfo {
  label: string;
  implemented: boolean;
  requiresOrg: boolean; // richiede un piano Enterprise/Team/Org, non un account personale
  envVars: string[];
  testOnYourself: string; // onestà su cosa serve davvero per provarlo con il proprio account
  steps: string[];
}

const CONNECTOR_INFO: Record<string, ConnectorInfo> = {
  GITHUB: {
    label: "GitHub",
    implemented: true,
    requiresOrg: false,
    envVars: ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_INSTALLATION_ID", "GITHUB_ORG"],
    testOnYourself:
      "Il più realistico da provare su di te. Serve un'organizzazione GitHub (anche gratuita — chiunque può crearne una in 1 minuto). Copilot e audit log richiedono un piano a pagamento sull'org, ma la scansione dei repository funziona anche su un'org free.",
    steps: [
      "Se non ne hai già una: github.com → icona + in alto a destra → \"New organization\" → scegli il piano Free.",
      "Vai su github.com/settings/apps/new (GitHub App a livello personale, installabile sulla tua org).",
      "GitHub App name: un nome qualsiasi (es. \"AI Control Sync\"). Homepage URL: l'URL della tua app su Railway.",
      "Sezione Webhook: disattiva \"Active\" (non gestiamo ancora i webhook).",
      "Permissions → Repository permissions: Metadata = Read-only.",
      "Permissions → Organization permissions: Members = Read-only, Administration = Read-only.",
      "Crea l'app, poi clicca \"Generate a private key\" — scarica il file .pem: è il valore di GITHUB_APP_PRIVATE_KEY.",
      "Vai su github.com/settings/apps/<nome-app>/installations → Install → seleziona la tua organizzazione.",
      "Dall'URL dopo l'installazione (o dalla pagina \"Advanced\" dell'app) copia l'Installation ID numerico.",
      "Su Railway → progetto ai-control → servizio ai-control → Variables: imposta i 4 valori (App ID e Installation ID li trovi nella pagina dell'app; GITHUB_ORG è lo slug della tua org).",
      "Railway riavvia da solo il servizio dopo aver salvato le variabili. Torna qui e premi \"Sync now\".",
    ],
  },
  MICROSOFT_365: {
    label: "Microsoft 365 / Entra ID",
    implemented: true,
    requiresOrg: true,
    envVars: ["MS365_TENANT_ID", "MS365_CLIENT_ID", "MS365_CLIENT_SECRET"],
    testOnYourself:
      "Serve un tenant Microsoft Entra con permessi da amministratore per dare admin consent. Un account Microsoft personale (outlook.com) non basta — serve un'organizzazione (anche un tenant developer gratuito di Microsoft 365).",
    steps: [
      "portal.azure.com → Microsoft Entra ID → App registrations → New registration.",
      "Dopo la creazione, copia Application (client) ID e Directory (tenant) ID dalla pagina Overview.",
      "API permissions → Add a permission → Microsoft Graph → Application permissions: Application.Read.All, AuditLog.Read.All, Directory.Read.All.",
      "Sulla stessa pagina, clicca \"Grant admin consent\" (richiede un ruolo da amministratore del tenant).",
      "Certificates & secrets → New client secret → copia il Value subito (non sarà più visibile dopo).",
      "Su Railway, imposta MS365_TENANT_ID, MS365_CLIENT_ID, MS365_CLIENT_SECRET con questi tre valori.",
      "Premi \"Sync now\" dopo che Railway ha riavviato il servizio.",
    ],
  },
  ANTHROPIC: {
    label: "Anthropic (Claude)",
    implemented: true,
    requiresOrg: true,
    envVars: ["ANTHROPIC_ADMIN_API_KEY"],
    testOnYourself:
      "Non testabile su un account Claude.ai personale o Pro: serve un'organizzazione Claude Enterprise/Team con l'Admin API abilitata.",
    steps: [
      "console.anthropic.com → Settings → Admin API keys (visibile solo su organizzazioni Enterprise/Team con questa funzione abilitata).",
      "Genera una Admin API key (prefisso sk-ant-admin...).",
      "Su Railway, imposta ANTHROPIC_ADMIN_API_KEY con questo valore.",
    ],
  },
  OPENAI: {
    label: "OpenAI (ChatGPT)",
    implemented: true,
    requiresOrg: true,
    envVars: ["OPENAI_ADMIN_API_KEY"],
    testOnYourself:
      "Non testabile su un account ChatGPT personale o Plus: serve un'organizzazione ChatGPT Enterprise o Edu.",
    steps: [
      "platform.openai.com → Settings → Organization → Admin keys.",
      "Genera una Admin API key (permesso di lettura su utenti e audit log).",
      "Su Railway, imposta OPENAI_ADMIN_API_KEY con questo valore.",
    ],
  },
  GOOGLE_WORKSPACE: {
    label: "Google Workspace",
    implemented: false,
    requiresOrg: true,
    envVars: [],
    testOnYourself: "Riservato nello schema, non ancora costruito (PRD §5.5).",
    steps: [],
  },
};

export default async function ConnectorsPage() {
  const connectors = await db.connector.findMany({ where: { organizationId: ORG_ID } });
  const byProvider = new Map<ConnectorProvider, Connector>(connectors.map((c) => [c.provider, c]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Connectors</h1>
        <p className="text-sm text-ink-400 mt-1.5 max-w-lg">
          Sources feeding the inventory. Each one needs real credentials to do
          anything — set them as variables on the Railway service, then sync.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {Object.entries(CONNECTOR_INFO).map(([provider, info]) => {
          const row = byProvider.get(provider as ConnectorProvider);
          const warnings = (row?.lastSyncWarnings as string[] | null) ?? [];
          return (
            <div key={provider} className="rounded-lg border border-line bg-panel p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm text-ink-100">{info.label}</span>
                  {row ? <Badge>{row.status}</Badge> : <Badge>DISCONNECTED</Badge>}
                </div>
                {info.implemented && (
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

              <details className="mt-3 pt-3 border-t border-line group">
                <summary className="cursor-pointer text-xs text-ink-400 hover:text-ink-100 list-none flex items-center gap-1.5">
                  <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
                  {info.steps.length > 0 ? "How to connect this yourself" : "Details"}
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
    </div>
  );
}

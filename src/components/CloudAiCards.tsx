import type { Connector, ConnectorProvider } from "@prisma/client";
import { VendorBadge } from "@/components/VendorIcon";
import { syncConnectorAction, disconnectConnectorAction } from "@/lib/actions";
import { connectCloudAiAction } from "@/lib/connectors/cloud-ai-actions";
import { fmtDateTime } from "@/lib/format";

// Piattaforme cloud AI (Azure OpenAI, Bedrock, Vertex): una riga ciascuna come Okta/GitHub;
// il modulo con le credenziali si apre solo quando serve. Le credenziali non tornano mai nella pagina.

interface Field {
  name: string;
  placeholder: string;
  secret?: boolean;
  textarea?: boolean;
  optional?: boolean;
}

export const CLOUD_AI: { provider: ConnectorProvider; label: string; vendor: string; badgeName?: string; text: string; fields: Field[]; hint: string; docsUrl: string }[] = [
  {
    provider: "AZURE_OPENAI",
    label: "Azure OpenAI / AI Foundry",
    vendor: "Azure",
    text: "Daily cost of OpenAI and Foundry models from Azure Cost Management. Read-only.",
    fields: [
      { name: "tenantId", placeholder: "Tenant ID" },
      { name: "clientId", placeholder: "Client ID (application ID)" },
      { name: "clientSecret", placeholder: "Client secret value", secret: true },
      { name: "subscriptionId", placeholder: "Subscription ID" },
    ],
    hint: 'Register an app in Microsoft Entra ID and give it the "Cost Management Reader" role on the subscription. "Monitoring Reader" adds token counts (optional).',
    docsUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
  },
  {
    provider: "AWS_BEDROCK",
    label: "AWS Bedrock",
    vendor: "AWS",
    badgeName: "Bedrock",
    text: "Daily cost of every Bedrock model, Claude and Llama included, from Cost Explorer. Read-only.",
    fields: [
      { name: "accessKeyId", placeholder: "Access key ID (AKIA…)" },
      { name: "secretAccessKey", placeholder: "Secret access key", secret: true },
    ],
    hint: "Create an IAM user whose only permission is ce:GetCostAndUsage. Cost Explorer charges $0.01 for each call; a daily sync makes about two.",
    docsUrl: "https://console.aws.amazon.com/iam/home#/users",
  },
  {
    provider: "GOOGLE_VERTEX",
    label: "Google Vertex AI / Gemini API",
    vendor: "Google",
    text: "Daily cost of Vertex AI and the Gemini API from your BigQuery billing export. Read-only.",
    fields: [
      { name: "table", placeholder: "project.dataset.gcp_billing_export_v1_…" },
      { name: "location", placeholder: "Dataset location, e.g. EU (optional)", optional: true },
      { name: "serviceAccount", placeholder: "Paste the service account key (JSON)", secret: true, textarea: true },
    ],
    hint: 'Turn on Billing export to BigQuery, then give a service account "BigQuery Data Viewer" on the export dataset and "BigQuery Job User" on its project.',
    docsUrl: "https://console.cloud.google.com/billing/export",
  },
];

export const cloudAiConnected = (row?: Connector) => row?.status !== "DISCONNECTED" && Boolean(row?.credentialsEncrypted);

export default function CloudAiCards({ rows, errorFor, error }: { rows: Map<ConnectorProvider, Connector>; errorFor?: string; error?: string }) {
  return (
    <section id="cloud-ai" className="scroll-mt-6">
      <div className="rounded-xl border border-line bg-panel overflow-hidden animate-rise divide-y divide-line">
        <h2 className="px-4 py-3 text-sm font-bold text-ink-100">Cloud AI platforms</h2>
        {CLOUD_AI.map((p) => {
          const row = rows.get(p.provider);
          const connected = cloudAiConnected(row);
          const err = errorFor === p.provider ? error : undefined;
          return (
            <div key={p.provider} id={p.provider} className="scroll-mt-6">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <VendorBadge vendor={p.vendor} name={p.badgeName} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-100">{p.label}</span>
                    {connected && <span className="text-xs text-steady">✓ Connected</span>}
                  </div>
                  <div className="text-xs text-ink-400 truncate">
                    {connected ? (row?.lastSyncedAt ? `Synced ${fmtDateTime(row.lastSyncedAt)} · updates daily` : "First sync pending") : p.text}
                  </div>
                </div>
                {connected && (
                  <div className="flex items-center gap-2">
                    <form action={syncConnectorAction}>
                      <input type="hidden" name="provider" value={p.provider} />
                      <button className="btn btn-secondary btn-sm">Sync now</button>
                    </form>
                    <form action={disconnectConnectorAction}>
                      <input type="hidden" name="provider" value={p.provider} />
                      <button className="btn btn-ghost btn-sm">Disconnect</button>
                    </form>
                  </div>
                )}
              </div>
              {connected && row?.lastSyncError && <p className="px-4 pb-3 text-xs text-alarm">{row.lastSyncError}</p>}
              {!connected && (
                <details className="group" open={Boolean(err)}>
                  <summary className="cursor-pointer list-none px-4 pb-2.5 text-xs text-ink-400 hover:text-ink-100 select-none">
                    Connect <span className="inline-block transition-transform group-open:rotate-90">›</span>
                  </summary>
                  <form action={connectCloudAiAction} className="px-4 pb-4 flex flex-col gap-2">
                    <input type="hidden" name="provider" value={p.provider} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {p.fields.map((f) =>
                        f.textarea ? (
                          <textarea key={f.name} name={f.name} required={!f.optional} autoComplete="off" spellCheck={false} rows={4} placeholder={f.placeholder} className="field w-full sm:col-span-2 font-mono text-xs" />
                        ) : (
                          <input key={f.name} name={f.name} type={f.secret ? "password" : "text"} required={!f.optional} autoComplete="off" spellCheck={false} placeholder={f.placeholder} className="field w-full" />
                        )
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-ink-400 min-w-0 flex-1">
                        {p.hint}{" "}
                        <a href={p.docsUrl} target="_blank" rel="noreferrer" className="underline hover:text-ink-100">Open console →</a>
                      </p>
                      <button className="btn btn-secondary btn-sm">Test & connect</button>
                    </div>
                    {err && <p className="text-xs text-alarm">{err}</p>}
                  </form>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

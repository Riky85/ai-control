import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import { VendorBadge } from "@/components/VendorIcon";
import Badge from "@/components/Badge";
import { Notice, PageHeader } from "@/components/ui";
import { syncConnectorAction, connectWithApiKeyAction, disconnectConnectorAction, addManualAssetAction, importCsvAction, connectGithubTokenAction } from "@/lib/actions";
import { fmtDateTime } from "@/lib/format";
import { decryptJson } from "@/lib/crypto";
import CsvDropzone from "@/components/CsvDropzone";
import type { Connector, ConnectorProvider } from "@prisma/client";

export const dynamic = "force-dynamic";

const AI_PROVIDERS: { provider: ConnectorProvider; label: string; keyUrl: string; hint: string }[] = [
  { provider: "ANTHROPIC", label: "Anthropic (Claude)", keyUrl: "https://console.anthropic.com/settings/keys", hint: "sk-ant-…" },
  { provider: "OPENAI", label: "OpenAI (ChatGPT)", keyUrl: "https://platform.openai.com/api-keys", hint: "sk-…" },
  { provider: "GOOGLE_GEMINI", label: "Google Gemini", keyUrl: "https://aistudio.google.com/app/apikey", hint: "AIza…" },
  { provider: "MISTRAL", label: "Mistral AI", keyUrl: "https://console.mistral.ai/api-keys", hint: "API key" },
  { provider: "XAI", label: "xAI (Grok)", keyUrl: "https://console.x.ai", hint: "xai-…" },
  { provider: "DEEPSEEK", label: "DeepSeek", keyUrl: "https://platform.deepseek.com/api_keys", hint: "sk-…" },
  { provider: "GROQ", label: "Groq", keyUrl: "https://console.groq.com/keys", hint: "gsk_…" },
  { provider: "COHERE", label: "Cohere", keyUrl: "https://dashboard.cohere.com/api-keys", hint: "API key" },
  { provider: "TOGETHER", label: "Together AI", keyUrl: "https://api.together.ai/settings/api-keys", hint: "API key" },
  { provider: "OPENROUTER", label: "OpenRouter", keyUrl: "https://openrouter.ai/settings/keys", hint: "sk-or-…" },
  { provider: "HUGGINGFACE", label: "Hugging Face", keyUrl: "https://huggingface.co/settings/tokens", hint: "hf_…" },
];

const COMING_SOON: { group: string; items: { label: string; vendor: string }[] }[] = [
  {
    group: "Workplace",
    items: [
      { label: "Slack", vendor: "Slack" },
      { label: "Salesforce", vendor: "Salesforce" },
      { label: "Notion", vendor: "Notion" },
      { label: "Okta", vendor: "Okta" },
    ],
  },
  {
    group: "Cloud AI",
    items: [
      { label: "AWS Bedrock", vendor: "Bedrock" },
      { label: "Azure OpenAI", vendor: "Azure" },
      { label: "Google Vertex AI", vendor: "Google" },
    ],
  },
];

const card = "rounded-xl border border-line bg-panel p-4 flex flex-col gap-3";
const btnPrimary = "btn btn-primary";
const btnSecondary = "btn btn-secondary";
const input = "field w-full";

export default async function ConnectorsPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string; provider?: string; imported?: string };
}) {
  const rows = await db.connector.findMany({ where: { organizationId: currentOrgId() } });
  const byProvider = new Map<ConnectorProvider, Connector>(rows.map((c) => [c.provider, c]));
  const githubReady = Boolean(process.env.GITHUB_APP_SLUG);
  const github = byProvider.get("GITHUB");
  // "Collegato" solo se ci sono credenziali vere (i dati demo non contano).
  const githubConnected = github?.status === "CONNECTED" && Boolean(github.credentialsEncrypted);
  const githubOrg = decryptJson<{ org?: string }>(github?.credentialsEncrypted)?.org;
  // Stessa definizione delle card sotto: provider AI + GitHub.
  const providerConnected = (row?: Connector) => row?.status === "CONNECTED" || (Boolean(row?.credentialsEncrypted) && row?.status !== "DISCONNECTED");
  const connectedCount = AI_PROVIDERS.filter((p) => providerConnected(byProvider.get(p.provider))).length + (githubConnected ? 1 : 0);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        crumbs={[{ label: "Connect", href: "/connect" }]}
        title="Provider keys & imports"
        subtitle="Paste a provider key for exact API costs, or import a list of AI tools."
        action={<span className="text-sm text-ink-400">{connectedCount} connected</span>}
      />

      {searchParams.connected && (
        <Notice>
          <b>Connected.</b> First sync done — your systems are now in <a href="/" className="underline">Your AI</a>.
        </Notice>
      )}
      {searchParams.imported && (
        <Notice>
          <b>{searchParams.imported} AI system{searchParams.imported === "1" ? "" : "s"} imported.</b> See them in <a href="/" className="underline">Your AI</a>.
        </Notice>
      )}
      {/* Errore di una connessione: resta accanto a quella connessione, non nel toast globale. */}
      {searchParams.error && searchParams.provider && <span data-keeps-url-error hidden />}

      <Section title="AI providers" subtitle="A normal API key is enough. Admin keys (Anthropic, OpenAI) also bring in users and exact costs.">
        {AI_PROVIDERS.map((p) => {
          const row = byProvider.get(p.provider);
          const connected = providerConnected(row);
          const mode = decryptJson<{ mode?: string }>(row?.credentialsEncrypted)?.mode;
          const error = searchParams.provider === p.provider ? searchParams.error : undefined;
          return (
            <div key={p.provider} id={p.provider} className={card}>
              <div className="flex items-center gap-3">
                <VendorBadge vendor={p.provider} name={p.label} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-100 truncate">{p.label}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge>{connected ? "CONNECTED" : "DISCONNECTED"}</Badge>
                    {connected && row?.status === "ERROR" && <Badge>SYNC_FAILED</Badge>}
                    {connected && mode === "admin" && <Badge>ADMIN_KEY</Badge>}
                  </div>
                </div>
              </div>
              {connected ? (
                <div className="flex gap-2 mt-auto">
                  <form action={syncConnectorAction} className="flex-1">
                    <input type="hidden" name="provider" value={p.provider} />
                    <button className={`${btnSecondary} w-full`}>Sync now</button>
                  </form>
                  <form action={disconnectConnectorAction}>
                    <input type="hidden" name="provider" value={p.provider} />
                    <button className="btn btn-danger">Disconnect</button>
                  </form>
                </div>
              ) : (
                <details className="group mt-auto" open={Boolean(error)}>
                  <summary className={`${btnSecondary} w-full list-none cursor-pointer group-open:hidden`}>Connect</summary>
                  <form action={connectWithApiKeyAction} className="flex flex-col gap-2">
                    <input type="hidden" name="provider" value={p.provider} />
                    <input name="apiKey" type="password" autoComplete="off" required placeholder={`Paste API key (${p.hint})`} className={input} />
                    <button className={btnPrimary}>Connect</button>
                    <a href={p.keyUrl} target="_blank" rel="noreferrer" className="text-xs text-ink-400 hover:text-ink-100 underline">
                      Get a key from {p.label.split(" ")[0]} →
                    </a>
                    {error && <p className="text-xs text-alarm">{error}</p>}
                  </form>
                </details>
              )}
            </div>
          );
        })}
      </Section>

      {/* Codice: una riga sola, il modulo si apre solo quando serve. */}
      <section id="GITHUB" className="scroll-mt-6">
        <div className="rounded-xl border border-line bg-panel overflow-hidden animate-rise">
          <h2 className="bg-ink border-b border-line px-4 py-3 text-sm font-semibold text-ink-100 bar-head">Code</h2>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <VendorBadge vendor="GitHub" size={32} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink-100">GitHub</span>
                {githubConnected && <span className="text-xs text-steady">✓ Connected</span>}
              </div>
              <div className="text-xs text-ink-400 truncate">
                {githubConnected
                  ? `${githubOrg ?? "Personal repositories"}${github?.lastSyncedAt ? ` · scanned ${fmtDateTime(github.lastSyncedAt)}` : ""}`
                  : "Finds the AI libraries in your repositories. Read-only."}
              </div>
            </div>
            {githubConnected ? (
              <div className="flex items-center gap-2">
                <form action={syncConnectorAction}>
                  <input type="hidden" name="provider" value="GITHUB" />
                  <button className="btn btn-secondary btn-sm">Scan again</button>
                </form>
                <form action={disconnectConnectorAction}>
                  <input type="hidden" name="provider" value="GITHUB" />
                  <button className="btn btn-ghost btn-sm">Disconnect</button>
                </form>
              </div>
            ) : githubReady ? (
              <a href="/api/connectors/github/install" className="btn btn-secondary btn-sm">Connect</a>
            ) : null}
          </div>
          {githubConnected && github?.lastSyncError && <p className="px-4 pb-3 text-xs text-alarm">{github.lastSyncError}</p>}
          {!githubConnected && (
            <details className="group border-t border-line" open={searchParams.provider === "GITHUB"}>
              <summary className="cursor-pointer list-none px-4 py-2.5 text-xs text-ink-400 hover:text-ink-100 select-none">
                {githubReady ? "Or use a token" : "Connect with a token"} <span className="inline-block transition-transform group-open:rotate-90">›</span>
              </summary>
              <form action={connectGithubTokenAction} className="px-4 pb-4 flex flex-col gap-2">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px_auto] gap-2">
                  <input name="token" type="password" required autoComplete="off" placeholder="github_pat_…" className={input} />
                  <input name="org" placeholder="Organization (optional)" className={input} />
                  <button className="btn btn-primary btn-sm">Connect</button>
                </div>
                <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer" className="text-xs text-ink-400 hover:text-ink-100 underline self-start">
                  Create a token — All repositories, Contents: Read-only
                </a>
                {searchParams.error && searchParams.provider === "GITHUB" && <p className="text-xs text-alarm">{searchParams.error}</p>}
              </form>
            </details>
          )}
        </div>
      </section>

      <Section title="Import" subtitle="Works for any AI — including tools without an API. One row for each AI system.">
        <div id="import" className={`${card} col-span-2`}>
          <div className="text-sm font-medium text-ink-100">Upload a spreadsheet (CSV)</div>
          <p className="text-xs text-ink-400">
            Columns: <code>name</code> (required), <code>vendor</code>, <code>type</code>, <code>model</code>, <code>owner_email</code>, <code>department</code>, <code>monthly_cost</code>. Export it from Excel or Google Sheets as CSV.
          </p>
          <form action={importCsvAction} className="flex flex-col gap-3 mt-auto">
            <CsvDropzone />
            <div className="flex items-center justify-between">
              <a href="/api/csv-template" className="inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-100 transition-colors">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v7M4 6.5L7 9.5l3-3M2.5 11.5h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Download template
              </a>
              <button className={btnPrimary}>Import CSV</button>
            </div>
          </form>
        </div>
        <div id="manual" className={card}>
          <div className="text-sm font-medium text-ink-100">Add one manually</div>
          <form action={addManualAssetAction} className="flex flex-col gap-2">
            <input name="name" required placeholder="Name, e.g. Support chatbot" className={input} />
            <div className="grid grid-cols-2 gap-2">
              <input name="vendor" placeholder="Vendor" className={input} />
            </div>
            <button className={`${btnSecondary} w-full`}>+ Add AI system</button>
          </form>
        </div>
      </Section>

      {COMING_SOON.map((g) => (
        <Section key={g.group} title={g.group} subtitle="Coming soon — needs an admin sign-in flow we haven't built yet. Use Import meanwhile.">
          {g.items.map((i) => (
            <div key={i.label} className="rounded-xl border border-dashed border-line p-4 flex items-center gap-3">
              <VendorBadge vendor={i.vendor} name={i.label} size={32} />
              <span className="text-sm text-ink-400 flex-1">{i.label}</span>
              <span className="text-[11px] text-ink-400 border border-line rounded-full px-2 py-0.5">Soon</span>
            </div>
          ))}
        </Section>
      ))}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-ink-100">{title}</h2>
      <p className="text-sm text-ink-400 mb-3">{subtitle}</p>
      <div className="grid grid-cols-3 gap-4">{children}</div>
    </section>
  );
}

import { db } from "@/lib/db";
import { VendorBadge } from "@/components/VendorIcon";
import { PageHeader } from "@/components/ui";
import { syncConnectorAction, connectWithApiKeyAction, disconnectConnectorAction, addManualAssetAction, importCsvAction } from "@/lib/actions";
import { decryptJson } from "@/lib/crypto";
import CsvDropzone from "@/components/CsvDropzone";
import type { Connector, ConnectorProvider } from "@prisma/client";

export const dynamic = "force-dynamic";
const ORG_ID = "demo-org";

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
      { label: "Microsoft 365 / Copilot", vendor: "Microsoft" },
      { label: "Google Workspace", vendor: "Google" },
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
const input = "w-full border border-line rounded-lg px-3 py-2 text-sm text-ink-100 bg-panel placeholder:text-ink-400 focus:outline-none focus:border-accent";

export default async function ConnectorsPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string; provider?: string; imported?: string };
}) {
  const rows = await db.connector.findMany({ where: { organizationId: ORG_ID } });
  const byProvider = new Map<ConnectorProvider, Connector>(rows.map((c) => [c.provider, c]));
  const githubReady = Boolean(process.env.GITHUB_APP_SLUG);
  const github = byProvider.get("GITHUB");
  const connectedCount = rows.filter((r) => r.status === "CONNECTED" && r.credentialsEncrypted).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Connections"
        subtitle="Connect where your AI lives. Paste a key, sign in, or import a list — Angar builds your AI Passports from it."
        action={<span className="text-sm text-ink-400">{connectedCount} connected</span>}
      />

      {searchParams.connected && (
        <div className="rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-100">
          <b>Connected.</b> First sync done — your systems are now in <a href="/assets" className="underline">AI Passports</a>.
        </div>
      )}
      {searchParams.imported && (
        <div className="rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-100">
          <b>{searchParams.imported} AI systems imported.</b> See them in <a href="/assets" className="underline">AI Passports</a>.
        </div>
      )}
      {searchParams.error && !searchParams.provider && <div className="rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm">{searchParams.error}</div>}

      <Section title="AI providers" subtitle="A normal API key is enough. Admin keys (Anthropic, OpenAI) also bring in users.">
        {AI_PROVIDERS.map((p) => {
          const row = byProvider.get(p.provider);
          const connected = row?.status === "CONNECTED" && Boolean(row.credentialsEncrypted);
          const mode = decryptJson<{ mode?: string }>(row?.credentialsEncrypted)?.mode;
          const error = searchParams.provider === p.provider ? searchParams.error : undefined;
          return (
            <div key={p.provider} id={p.provider} className={card}>
              <div className="flex items-center gap-3">
                <VendorBadge vendor={p.provider} name={p.label} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-100 truncate">{p.label}</div>
                  <div className="text-xs text-ink-400">
                    {connected ? (
                      <span className="text-ink-100"><span className="text-steady">●</span> Connected{mode === "admin" ? " · admin" : ""}</span>
                    ) : row?.status === "ERROR" ? (
                      <span className="text-alarm">● Needs attention</span>
                    ) : (
                      "Not connected"
                    )}
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
                    <button className="text-sm px-3 py-2 rounded-lg text-ink-400 hover:text-alarm transition-colors">Disconnect</button>
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

      <Section title="Code" subtitle="Scans repositories for AI SDKs (OpenAI, Anthropic, LangChain…).">
        <div className={card}>
          <div className="flex items-center gap-3">
            <VendorBadge vendor="GitHub" size={36} />
            <div className="flex-1">
              <div className="text-sm font-medium text-ink-100">GitHub</div>
              <div className="text-xs text-ink-400">{github?.status === "CONNECTED" ? <span className="text-ink-100"><span className="text-steady">●</span> Connected</span> : "Not connected"}</div>
            </div>
          </div>
          {githubReady ? (
            <a href="/api/connectors/github/install" className={`${btnSecondary} mt-auto`}>
              Sign in with GitHub
            </a>
          ) : (
            <p className="text-xs text-ink-400 mt-auto">Sign-in needs a one-time platform setup (GitHub App). Until then, use Import below.</p>
          )}
        </div>
      </Section>

      <Section title="Import" subtitle="Works for any AI — including tools without an API. One row per AI system.">
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
              <input name="monthlyCost" type="number" step="0.01" placeholder="€ / month" className={input} />
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

import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import { VendorBadge } from "@/components/VendorIcon";
import { syncConnectorAction, connectWithApiKeyAction, disconnectConnectorAction } from "@/lib/actions";
import type { Connector, ConnectorProvider } from "@prisma/client";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

type Method = "apiKey" | "signIn" | "soon";

const PROVIDERS: { provider: ConnectorProvider; label: string; method: Method; what: string; keyUrl?: string; keyHint?: string }[] = [
  {
    provider: "ANTHROPIC",
    label: "Anthropic (Claude)",
    method: "apiKey",
    what: "Finds your Claude workspace and who uses it.",
    keyUrl: "https://console.anthropic.com/settings/admin-keys",
    keyHint: "sk-ant-admin…",
  },
  {
    provider: "OPENAI",
    label: "OpenAI (ChatGPT)",
    method: "apiKey",
    what: "Finds your ChatGPT / API organization and its members.",
    keyUrl: "https://platform.openai.com/settings/organization/admin-keys",
    keyHint: "sk-admin-…",
  },
  { provider: "GITHUB", label: "GitHub", method: "signIn", what: "Scans your repos for OpenAI, Anthropic, LangChain and other AI SDKs." },
  { provider: "MICROSOFT_365", label: "Microsoft 365", method: "soon", what: "Copilot and AI apps approved in Entra ID." },
  { provider: "GOOGLE_WORKSPACE", label: "Google Workspace", method: "soon", what: "Gemini and AI apps in your Google domain." },
];

export default async function ConnectorsPage({ searchParams }: { searchParams: { connected?: string; error?: string; provider?: string } }) {
  const rows = await db.connector.findMany({ where: { organizationId: ORG_ID } });
  const byProvider = new Map<ConnectorProvider, Connector>(rows.map((c) => [c.provider, c]));
  const githubReady = Boolean(process.env.GITHUB_APP_SLUG);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Connections</h1>
        <p className="text-sm text-ink-400 mt-1">Connect a provider once — Angar then discovers your AI systems automatically.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          ["1", "Pick a provider", "Start with the AI your company already pays for."],
          ["2", "Paste a key or sign in", "Read-only access. Keys are encrypted at rest."],
          ["3", "See your AI estate", "Systems, users and changes appear in AI Passports."],
        ].map(([n, t, d]) => (
          <div key={n} className="flex gap-3">
            <span className="h-6 w-6 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center shrink-0">{n}</span>
            <div>
              <div className="text-sm font-medium text-ink-100">{t}</div>
              <div className="text-xs text-ink-400">{d}</div>
            </div>
          </div>
        ))}
      </div>

      {searchParams.connected && (
        <div className="rounded-lg bg-steady/10 px-4 py-3 text-sm text-steady">Connected — first sync done. Your systems are in AI Passports.</div>
      )}
      {searchParams.error && <div className="rounded-lg bg-alarm/10 px-4 py-3 text-sm text-alarm">{searchParams.error}</div>}

      <div className="grid grid-cols-3 gap-4">
        {PROVIDERS.map((p) => {
          const row = byProvider.get(p.provider);
          const connected = row?.status === "CONNECTED" && (p.method !== "apiKey" || Boolean(row.credentialsEncrypted));
          return (
            <div key={p.provider} className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <VendorBadge vendor={p.provider} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm text-ink-100">{p.label}</div>
                  <div className="text-xs text-ink-400">{p.what}</div>
                </div>
              </div>

              {connected ? (
                <div className="flex flex-col gap-2 mt-auto">
                  <div className="flex items-center justify-between text-xs">
                    <Badge>CONNECTED</Badge>
                    {row?.lastSyncedAt && <span className="text-ink-400">Synced {new Date(row.lastSyncedAt).toLocaleDateString()}</span>}
                  </div>
                  <div className="flex gap-2">
                    <form action={syncConnectorAction} className="flex-1">
                      <input type="hidden" name="provider" value={p.provider} />
                      <button className="w-full text-xs font-medium px-3 py-2 rounded-md border border-line text-ink-100 hover:border-ink-100 transition-colors">Sync now</button>
                    </form>
                    <form action={disconnectConnectorAction}>
                      <input type="hidden" name="provider" value={p.provider} />
                      <button className="text-xs px-3 py-2 rounded-md text-ink-400 hover:text-alarm transition-colors">Disconnect</button>
                    </form>
                  </div>
                </div>
              ) : p.method === "apiKey" ? (
                <form action={connectWithApiKeyAction} className="flex flex-col gap-2 mt-auto">
                  <input type="hidden" name="provider" value={p.provider} />
                  <input
                    name="apiKey"
                    type="password"
                    autoComplete="off"
                    placeholder={`Admin API key (${p.keyHint})`}
                    className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink-100 placeholder:text-ink-400 bg-panel"
                  />
                  <button className="w-full text-xs font-medium px-3 py-2 rounded-md bg-accent text-white hover:bg-accent-dark transition-colors">Connect</button>
                  <a href={p.keyUrl} target="_blank" rel="noreferrer" className="text-xs text-ink-400 hover:text-ink-100 underline">
                    Where do I get an admin key?
                  </a>
                  {searchParams.error && searchParams.provider === p.provider && <p className="text-xs text-alarm">{searchParams.error}</p>}
                </form>
              ) : p.method === "signIn" && githubReady ? (
                <a href="/api/connectors/github/install" className="mt-auto text-center text-xs font-medium px-3 py-2 rounded-md bg-accent text-white hover:bg-accent-dark transition-colors">
                  Sign in with GitHub
                </a>
              ) : (
                <div className="mt-auto text-center text-xs text-ink-400 border border-dashed border-line rounded-md px-3 py-2">
                  {p.method === "signIn" ? "Available once GitHub sign-in is enabled" : "Coming soon"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

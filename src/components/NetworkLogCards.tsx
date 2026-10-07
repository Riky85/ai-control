import type { Connector, ConnectorProvider } from "@prisma/client";
import { VendorBadge } from "@/components/VendorIcon";
import CsvDropzone from "@/components/CsvDropzone";
import { syncConnectorAction, disconnectConnectorAction } from "@/lib/actions";
import { connectCloudflareGatewayAction, connectCiscoUmbrellaAction } from "@/lib/network-log-actions";
import { uploadNetworkLogAction } from "@/lib/discovery-actions";
import { fmtDateTime } from "@/lib/format";

// Log di rete che l'azienda ha già (senza il box angar Edge): Cloudflare Gateway e
// Cisco Umbrella via API, e il caricamento di file per Zscaler, Fortinet e i server DNS.
// Una riga ciascuna, come Okta e le piattaforme cloud AI; le credenziali non tornano mai nella pagina.

interface Field {
  name: string;
  placeholder: string;
  secret?: boolean;
}

const API_SOURCES: { provider: ConnectorProvider; label: string; vendor: string; text: string; fields: Field[]; hint: string; docsUrl: string; action: (fd: FormData) => Promise<void> }[] = [
  {
    provider: "CLOUDFLARE_GATEWAY",
    label: "Cloudflare Gateway",
    vendor: "Cloudflare",
    text: "AI in your DNS logs.",
    fields: [
      { name: "accountId", placeholder: "Account ID" },
      { name: "apiToken", placeholder: "API token", secret: true },
    ],
    hint: "Create an API token with Account Analytics: Read on this account.",
    docsUrl: "https://dash.cloudflare.com/profile/api-tokens",
    action: connectCloudflareGatewayAction,
  },
  {
    provider: "CISCO_UMBRELLA",
    label: "Cisco Umbrella",
    vendor: "Cisco",
    text: "AI in your DNS activity.",
    fields: [
      { name: "apiKey", placeholder: "API key" },
      { name: "apiSecret", placeholder: "API secret", secret: true },
    ],
    hint: "In Umbrella: Admin → API Keys → Add, with the Reports read-only scope.",
    docsUrl: "https://dashboard.umbrella.com",
    action: connectCiscoUmbrellaAction,
  },
];

const LOG_ACCEPT = ".csv,.log,.txt,.json,.jsonl,.ndjson,.tsv,.gz,.zip,text/plain,text/csv,application/json,application/zip";

const connectedOf = (row?: Connector) => row?.status !== "DISCONNECTED" && Boolean(row?.credentialsEncrypted);
const n = (x: number) => x.toLocaleString("en-GB");

/** Esito del caricamento (dai parametri dell'URL): righe lette, AI trovate, persone o dispositivi. */
function UploadResult({ netlog, fmt, warn }: { netlog?: string; fmt?: string; warn?: string }) {
  const m = netlog ? /^(\d+)\.(\d+)\.(-?\d+)$/.exec(netlog) : null;
  if (!m) return null;
  const [lines, services, people] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return (
    <div className="mx-4 mb-3 rounded-lg border border-line px-3 py-2 text-xs text-ink-400">
      <span className="text-steady">✓</span> <span className="text-ink-100">{n(lines)} lines read</span>
      {fmt ? ` (${fmt})` : ""} · <span className="text-ink-100">{services} AI service{services === 1 ? "" : "s"} found</span> ·{" "}
      {people < 0 ? "people hidden (company totals only)" : `${n(people)} ${people === 1 ? "person or device" : "people or devices"}`}
      {services > 0 && (
        <>
          {" "}· <a href="/edge/sensors?view=ai" className="underline hover:text-ink-100">See what was found</a>
        </>
      )}
      {warn && <span className="block mt-1">{warn}</span>}
    </div>
  );
}

export default function NetworkLogCards({ rows, errorFor, error, uploadError, result }: { rows: Map<ConnectorProvider, Connector>; errorFor?: string; error?: string; uploadError?: string; result?: { netlog?: string; fmt?: string; warn?: string } }) {
  return (
    <section id="network-logs" className="scroll-mt-6">
      <div className="rounded-xl border border-line bg-panel overflow-hidden animate-rise divide-y divide-line">
        <div className="px-4 py-3">
          <h2 className="text-sm font-bold text-ink-100" title="Only AI services, days and counts are kept.">Network logs</h2>
        </div>
        {API_SOURCES.map((p) => {
          const row = rows.get(p.provider);
          const connected = connectedOf(row);
          const err = errorFor === p.provider ? error : undefined;
          return (
            <div key={p.provider} id={p.provider} className="scroll-mt-6">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <VendorBadge vendor={p.vendor} name={p.label} size={32} />
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
              {connected && (row?.lastSyncError || err) && <p className="px-4 pb-3 text-xs text-alarm">{err ?? row?.lastSyncError}</p>}
              {!connected && (
                <details className="group" open={Boolean(err)}>
                  <summary className="cursor-pointer list-none px-4 pb-2.5 text-xs text-ink-400 hover:text-ink-100 select-none">
                    Connect <span className="inline-block transition-transform group-open:rotate-90">›</span>
                  </summary>
                  <form action={p.action} className="px-4 pb-4 flex flex-col gap-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {p.fields.map((f) => (
                        <input key={f.name} name={f.name} type={f.secret ? "password" : "text"} required autoComplete="off" spellCheck={false} placeholder={f.placeholder} className="field w-full" />
                      ))}
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
        <div id="log-upload" className="scroll-mt-6">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <VendorBadge vendor="Firewall" name="Firewall" size={32} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-ink-100">Firewall &amp; DNS logs</div>
              <div className="text-xs text-ink-400">Zscaler, Fortinet, others</div>
            </div>
          </div>
          <UploadResult {...(result ?? {})} />
          <details className="group" open={Boolean(uploadError) || Boolean(result?.netlog)}>
            <summary className="cursor-pointer list-none px-4 pb-2.5 text-xs text-ink-400 hover:text-ink-100 select-none">
              Upload logs <span className="inline-block transition-transform group-open:rotate-90">›</span>
            </summary>
            <form action={uploadNetworkLogAction} className="px-4 pb-4 flex flex-col gap-2">
              <input type="hidden" name="back" value="/connectors" />
              <CsvDropzone accept={LOG_ACCEPT} multiple label="Drop log files" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-ink-400 min-w-0 flex-1" title="Zscaler NSS web logs, FortiGate or FortiAnalyzer logs, BIND, Windows DNS debug, Pi-hole, pfSense or OPNsense, Umbrella and Cloudflare exports, or any CSV with a domain column.">
                  Up to 50 MB.
                </p>
                <button className="btn btn-secondary btn-sm">Find AI</button>
              </div>
              {uploadError && <p className="text-xs text-alarm">{uploadError}</p>}
            </form>
          </details>
        </div>
      </div>
    </section>
  );
}

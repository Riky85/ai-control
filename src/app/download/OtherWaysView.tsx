import Link from "next/link";
import { db } from "@/lib/db";
import { Table, td } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";
import Badge from "@/components/Badge";
import ScannerSetup from "@/components/ScannerSetup";
import CopyButton from "@/components/CopyButton";
import CsvDropzone from "@/components/CsvDropzone";
import { uploadNetworkLogAction, revokeDiscoveryTokenAction } from "@/lib/discovery-actions";
import { fmtDateTime } from "@/lib/format";

// Scheda "Other ways" dell'area Desktop app (prima /discover): estensione del browser,
// scansione una tantum, log di rete, angar Edge e ciò che è stato trovato in automatico.
// angar gira nel cloud e non vede dentro la rete del cliente: la scansione parte dal
// lato del cliente e invia solo ciò che riconosce come AI.
export default async function OtherWaysView({ orgId, base, token, joinUrl, canEdit, canAdmin }: { orgId: string; base: string; token: string; joinUrl: string; canEdit: boolean; canAdmin: boolean }) {
  const [org, connector] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId }, select: { name: true, discoveryTokenHint: true } }),
    db.connector.findUnique({ where: { organizationId_provider: { organizationId: orgId, provider: "NETWORK" } } }),
  ]);
  const found = connector
    ? await db.aiAsset.findMany({
        where: { organizationId: orgId, connectorId: connector.id, deletedAt: null },
        include: { connectedSystems: { where: { system: "Seen on" } } },
        orderBy: { lastSeenAt: "desc" },
        take: 200,
      })
    : [];
  const policy = JSON.stringify({ token, server: base });

  return (
    <div className="flex flex-col gap-4">
      <section id="browser-extension" className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
        <div className="-mx-5 -mt-5 bg-ink border-b border-line rounded-t-xl px-5 py-3 bar-head">
          <h2 className="text-sm font-bold text-ink-100">Browser extension</h2>
          <p className="text-xs text-ink-400 mt-0.5">For computers where you can&apos;t install apps (e.g. Chromebooks): a Chrome/Edge extension that reports the AI websites each person opens.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-3">
            <div className="text-sm font-bold text-ink-100">Try it on this computer</div>
            <ol className="text-sm text-ink-400 flex flex-col gap-2">
              <li><span className="text-ink-100">1.</span> Download it — it&apos;s already connected to {org?.name}.</li>
              <li><span className="text-ink-100">2.</span> Unzip the file, then open <span className="text-ink-100">chrome://extensions</span> (Edge: <span className="text-ink-100">edge://extensions</span>).</li>
              <li><span className="text-ink-100">3.</span> Turn on <span className="text-ink-100">Developer mode</span> (top right), click <span className="text-ink-100">Load unpacked</span> and pick the unzipped folder.</li>
            </ol>
            {canEdit && <a href="/api/extension/download" className="btn btn-primary self-start mt-auto">Download extension</a>}
          </div>
          <div className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-3">
            <div className="text-sm font-bold text-ink-100">Everyone in the company</div>
            <p className="text-sm text-ink-400">Send this link to your team. Each person installs the extension and opens the link: it connects by itself, they only type their work email.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-lg border border-line bg-ink px-3 py-2 text-xs text-ink-100">{joinUrl}</code>
              <CopyButton text={joinUrl} label="Copy link" />
            </div>
            <CopyButton
              text={`Hi! We use angar to see which AI tools we use and avoid paying for seats nobody needs. It takes a minute: install the angar extension (file attached, or from IT), then open ${joinUrl} and type your work email. Only the names of AI websites are shared — nothing else. Thanks!`}
              label="Copy invitation message"
              className="btn btn-secondary self-start mt-auto"
            />
          </div>
        </div>
        {canAdmin && (
          <details className="text-sm">
            <summary className="cursor-pointer list-none text-ink-400 hover:text-ink-100 select-none">For IT: install it on every computer automatically</summary>
            <div className="mt-3 flex flex-col gap-2 text-ink-400">
              <p>Force-install the extension with Google Admin or Intune/Group Policy (ExtensionInstallForcelist) and push this managed configuration — nobody has to do anything:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded-lg border border-line bg-ink px-3 py-2 text-xs text-ink-100">{policy}</code>
                <CopyButton text={policy} />
              </div>
            </div>
          </details>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <section className="lg:col-span-2 rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
          <div className="-mx-5 -mt-5 bg-ink border-b border-line rounded-t-xl px-5 py-3 bar-head">
            <h2 className="text-sm font-bold text-ink-100">One-off scan (command line)</h2>
            <p className="text-xs text-ink-400 mt-0.5">One command, about a minute. Finds AI websites used in the last 30 days, AI apps, coding assistants, API keys in use and local models.</p>
          </div>
          {canAdmin ? <ScannerSetup base={base} token={token} /> : <p className="text-sm text-ink-400">Ask an admin of this workspace to run the scan.</p>}
        </section>
        <aside className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-3">
          <h3 className="-mx-5 -mt-5 mb-1 bg-ink border-b border-line rounded-t-xl px-5 py-3 text-sm font-bold text-ink-100 bar-head">What leaves the computer</h3>
          <ul className="text-sm text-ink-400 flex flex-col gap-2">
            <li className="flex gap-2"><Tick />Only AI services angar recognises — e.g. &ldquo;claude.ai, 42 visits&rdquo;.</li>
            <li className="flex gap-2"><Tick />Never the rest of the browsing, page contents, prompts or key values.</li>
            <li className="flex gap-2"><Tick />It lists what it found and asks before sending. <span className="font-mono text-xs whitespace-nowrap">--dry-run</span> sends nothing.</li>
          </ul>
          {canAdmin && org?.discoveryTokenHint && (
            <form action={revokeDiscoveryTokenAction} className="pt-2 border-t border-line">
              <button className="btn btn-secondary btn-sm" title="Stops the scanner, the extension and every desktop app from sending data">Revoke token</button>
            </form>
          )}
        </aside>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch" id="network">
        <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
          <div className="-mx-5 -mt-5 bg-ink border-b border-line rounded-t-xl px-5 py-3 bar-head">
            <h2 className="text-sm font-bold text-ink-100">Upload a network log</h2>
            <p className="text-xs text-ink-400 mt-0.5">Covers everyone at once. Export DNS or web logs from your firewall, router or DNS server (Pi-hole, pfSense, FortiGate, Sophos, Windows DNS, Cisco Umbrella…) and drop the file here.</p>
          </div>
          {canEdit ? (
            <form action={uploadNetworkLogAction} className="flex flex-col gap-3 mt-auto">
              <CsvDropzone accept=".log,.txt,.csv,.json,.jsonl,.tsv,.gz,.zip,text/plain,text/csv,application/json,application/zip" multiple label="Choose log files or drag them here" />
              <button className="btn btn-secondary self-start">Find AI in this log</button>
            </form>
          ) : (
            <p className="text-sm text-ink-400 mt-auto">Viewers can&apos;t upload logs — ask an editor.</p>
          )}
        </section>
        <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
          <div className="-mx-5 -mt-5 bg-ink border-b border-line rounded-t-xl px-5 py-3 bar-head">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-ink-100">angar Edge</h2>
              <span className="text-[10px] text-ink-400 border border-line rounded-[2px] px-1.5 py-0.5 font-mono uppercase tracking-[0.05em]">Early access</span>
            </div>
            <p className="text-xs text-ink-400 mt-0.5">A small device you plug into your network. It watches traffic all the time and reports any new AI the moment someone starts using it — nothing to install on computers.</p>
          </div>
          <Link href="/edge" className="btn btn-secondary self-start mt-auto">Learn about Edge</Link>
        </section>
      </div>

      <Table title="Found automatically" note={connector?.lastSyncedAt ? `Last result ${fmtDateTime(connector.lastSyncedAt)}` : "Nothing yet — install the desktop app on a computer."} action={found.some((a) => a.status === "UNKNOWN" || a.status === "UNREVIEWED") ? <Link href="/review" className="btn btn-secondary btn-sm">Review what was found</Link> : undefined} columns={["AI system", "Seen on", "Last seen", "Status"]} empty={found.length === 0 && "No AI found automatically yet."}>
          {found.map((a) => {
            const devices = [...new Set(a.connectedSystems.map((c) => c.detail ?? ""))].filter(Boolean);
            return (
              <tr key={a.id}>
                <td className={td}>
                  <Link href={`/assets/${a.id}`} className="flex items-center gap-3">
                    <VendorBadge vendor={a.vendor ?? ""} name={a.name} size={28} />
                    <span>
                      <span className="block font-medium text-ink-100 hover:underline">{a.name}</span>
                      <span className="block text-xs text-ink-400">{a.vendor}</span>
                    </span>
                  </Link>
                </td>
                <td className={`${td} text-ink-400`}>{devices.length === 1 ? devices[0] : devices.length === 0 ? "—" : `${devices.length} devices`}</td>
                <td className={`${td} text-ink-400`}>{a.lastSeenAt ? fmtDateTime(a.lastSeenAt) : "—"}</td>
                <td className={td}>
                  <Badge>{a.status === "UNKNOWN" || a.status === "UNREVIEWED" ? "NEEDS_REVIEW" : a.status}</Badge>
                </td>
              </tr>
            );
          })}
        </Table>
    </div>
  );
}

function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0 text-steady">
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

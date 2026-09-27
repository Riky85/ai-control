import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { PageHeader, Table, td } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";
import Badge from "@/components/Badge";
import ScannerSetup from "@/components/ScannerSetup";
import CopyButton from "@/components/CopyButton";
import { ensureWorkspaceToken } from "@/lib/discovery/ingest";
import CsvDropzone from "@/components/CsvDropzone";
import { uploadNetworkLogAction, revokeDiscoveryTokenAction } from "@/lib/discovery-actions";
import { fmtDateTime } from "@/lib/format";
import { DESKTOP_OS_LABEL, osFromUserAgent, type DesktopOs } from "@/lib/desktop";
import DesktopDevices from "@/components/DesktopDevices";

export const dynamic = "force-dynamic";

// Scoperta automatica: non serve ricordare quali AI si usano. angar gira nel
// cloud e non vede dentro la rete del cliente, quindi la scansione parte dal
// lato del cliente (script, log di rete, angar Edge) e invia solo ciò che
// riconosce come AI.
export default async function DiscoverPage({ searchParams }: { searchParams: { error?: string } }) {
  const s = currentSession()!;
  const h = headers();
  const base = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const [org, member, connector] = await Promise.all([
    db.organization.findUnique({ where: { id: s.orgId } }),
    db.workspaceMember.findUnique({ where: { organizationId_email: { organizationId: s.orgId, email: s.email } } }),
    db.connector.findUnique({ where: { organizationId_provider: { organizationId: s.orgId, provider: "NETWORK" } } }),
  ]);
  const found = connector
    ? await db.aiAsset.findMany({
        where: { connectorId: connector.id, deletedAt: null },
        include: { connectedSystems: true, activities: { where: { eventType: "discovery.seen" }, orderBy: { occurredAt: "desc" }, take: 1 } },
        orderBy: { lastSeenAt: "desc" },
      })
    : [];
  const canCreate = member?.role === "OWNER" || member?.role === "ADMIN";
  const { token, joinCode } = await ensureWorkspaceToken(s.orgId);
  const joinUrl = `${base}/join/${joinCode}`;
  const policy = JSON.stringify({ token, server: base });
  const first = osFromUserAgent(h.get("user-agent"));
  const downloads = (["windows", "mac"] as DesktopOs[])
    .sort((a, b) => (a === first ? -1 : b === first ? 1 : 0))
    .map((os) => ({ os, label: DESKTOP_OS_LABEL[os], href: `/api/discovery/desktop/download/${joinCode}?os=${os}` }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: "Sources", href: "/sources" }]}
        title="Find AI automatically"
        subtitle="Install the angar app on each computer: it finds the AI people use — in every browser and on the desktop — and for how long."
      />
      {searchParams.error && <div className="rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm">{searchParams.error}</div>}

      <section id="desktop" className="rounded-xl border border-accent/50 bg-panel p-5 flex flex-col sm:flex-row sm:items-center gap-5 scroll-mt-6">
        <span id="extension" className="sr-only" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-ink-100">angar desktop app</h2>
            <span className="text-[11px] font-medium text-accent border border-accent/40 rounded-full px-2 py-0.5">Recommended</span>
          </div>
          <p className="text-sm text-ink-400 mt-1">
            One install per computer. Finds AI in every browser and desktop app, and how long it&apos;s used — you see it all in <a href="/usage" className="underline text-ink-100">Usage</a>. Only AI names and time leave the computer, never pages or prompts.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 shrink-0 sm:w-56">
          {downloads.map((d, i) => (
            <a key={d.os} href={d.href} className={`btn ${i === 0 ? "btn-primary" : "btn-secondary"}`}>Download for {d.label}</a>
          ))}
          <Link href="/download" className="text-xs text-center text-ink-400 hover:text-ink-100 underline">All platforms &amp; company link →</Link>
        </div>
      </section>

      <DesktopDevices organizationId={s.orgId} />

      <details className="group rounded-xl border border-line bg-panel">
        <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between select-none">
          <span>
            <span className="block text-sm font-semibold text-ink-100">Other ways</span>
            <span className="block text-sm text-ink-400">Browser extension, one-off scan, network log, angar Edge</span>
          </span>
          <span className="text-ink-400 transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="px-5 pb-5 flex flex-col gap-4">
      <section id="browser-extension" className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-ink-100">Browser extension</h2>
          </div>
          <p className="text-sm text-ink-400 mt-1">
            For computers where you can't install apps (e.g. Chromebooks): a Chrome/Edge extension that reports the AI websites each person opens.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-line p-5 flex flex-col gap-3">
            <div className="text-sm font-semibold text-ink-100">Try it on this computer</div>
            <ol className="text-sm text-ink-400 flex flex-col gap-2">
              <li><span className="text-ink-100">1.</span> Download it — it's already connected to {org?.name}.</li>
              <li><span className="text-ink-100">2.</span> Unzip the file, then open <span className="text-ink-100">chrome://extensions</span> (Edge: <span className="text-ink-100">edge://extensions</span>).</li>
              <li><span className="text-ink-100">3.</span> Turn on <span className="text-ink-100">Developer mode</span> (top right), click <span className="text-ink-100">Load unpacked</span> and pick the unzipped folder.</li>
            </ol>
            <a href="/api/extension/download" className="btn btn-primary self-start mt-auto">Download extension</a>
          </div>
          <div className="rounded-xl border border-line p-5 flex flex-col gap-3">
            <div className="text-sm font-semibold text-ink-100">Everyone in the company</div>
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
      </section>


      <div className="grid grid-cols-3 gap-4 items-start">
        <section className="col-span-2 rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-ink-100">One-off scan (command line)</h2>
              </div>
              <p className="text-sm text-ink-400 mt-0.5">
                One command, about a minute. Finds AI websites used in the last 30 days, AI apps, coding assistants, API keys in use and local models.
              </p>
            </div>
          </div>
          <ScannerSetup base={base} token={token} />
        </section>

        <aside className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink-100">What leaves the computer</h3>
          <ul className="text-sm text-ink-400 flex flex-col gap-2">
            <li className="flex gap-2"><Tick />Only AI services angar recognises — e.g. "claude.ai, 42 visits".</li>
            <li className="flex gap-2"><Tick />Never the rest of the browsing, page contents, prompts or key values.</li>
            <li className="flex gap-2"><Tick />It lists what it found and asks before sending. <span className="font-mono text-xs whitespace-nowrap">--dry-run</span> sends nothing.</li>
          </ul>
          {org?.discoveryTokenHint && (
            <form action={revokeDiscoveryTokenAction} className="pt-2 border-t border-line">
              <button className="btn btn-secondary btn-sm">Revoke token</button>
            </form>
          )}
        </aside>
      </div>

      <div className="grid grid-cols-2 gap-4 items-stretch" id="network">
        <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            
            <div>
              <h2 className="text-base font-semibold text-ink-100">Upload a network log</h2>
              <p className="text-sm text-ink-400 mt-0.5">
                Covers everyone at once. Export DNS or web logs from your firewall, router or DNS server (Pi-hole, pfSense, FortiGate, Sophos, Windows DNS, Cisco Umbrella…) and drop the file here.
              </p>
            </div>
          </div>
          <form action={uploadNetworkLogAction} className="flex flex-col gap-3 mt-auto">
            <CsvDropzone accept=".log,.txt,.csv,.json,.tsv,text/plain,text/csv,application/json" label="Choose a log file or drag it here" />
            <button className="btn btn-primary self-start">Find AI in this log</button>
          </form>
        </section>

        <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-ink-100">angar Edge</h2>
                <span className="text-[11px] font-medium text-ink-400 border border-line rounded-full px-2 py-0.5">Early access</span>
              </div>
              <p className="text-sm text-ink-400 mt-0.5">
                A small device you plug into your network. It watches traffic all the time and reports any new AI the moment someone starts using it — nothing to install on computers.
              </p>
            </div>
          </div>
          <Link href="/billing#edge" className="btn btn-secondary self-start mt-auto">Request a device</Link>
        </section>
      </div>

        </div>
      </details>

      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink-100">Found automatically</h2>
            <p className="text-sm text-ink-400">
              {connector?.lastSyncedAt ? `Last result ${fmtDateTime(connector.lastSyncedAt)}` : "Nothing yet — install the desktop app on a computer."}
            </p>
          </div>
          {found.some((a) => a.status === "UNKNOWN" || a.status === "UNREVIEWED") && (
            <Link href="/review" className="btn btn-primary">Review what was found</Link>
          )}
        </div>
        <Table columns={["AI system", "Seen on", "Last seen", "Status"]} empty={found.length === 0 && "No AI found automatically yet."}>
          {found.map((a) => {
            const devices = [...new Set(a.connectedSystems.filter((c) => c.system === "Seen on").map((c) => c.detail ?? ""))].filter(Boolean);
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
                <td className={`${td} text-ink-400`}>{devices.length === 1 ? devices[0] : `${devices.length} devices`}</td>
                <td className={`${td} text-ink-400`}>{a.lastSeenAt ? fmtDateTime(a.lastSeenAt) : "—"}</td>
                <td className={td}>
                  <Badge>{a.status === "UNKNOWN" || a.status === "UNREVIEWED" ? "NEEDS_REVIEW" : a.status}</Badge>
                </td>
              </tr>
            );
          })}
        </Table>
      </div>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return <span className="h-7 w-7 shrink-0 rounded-full border border-line text-sm font-medium text-ink-100 flex items-center justify-center">{n}</span>;
}

function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0 text-steady">
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

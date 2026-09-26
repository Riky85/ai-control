import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { PageHeader, Table, td } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";
import Badge from "@/components/Badge";
import ScannerSetup from "@/components/ScannerSetup";
import CsvDropzone from "@/components/CsvDropzone";
import { uploadNetworkLogAction, revokeDiscoveryTokenAction } from "@/lib/discovery-actions";
import { fmtDateTime } from "@/lib/format";

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: "Sources", href: "/sources" }]}
        title="Scan computers & network"
        subtitle="Find the AI people really use — with a browser extension, a one-minute scan or your network logs."
      />
      {searchParams.error && <div className="rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm">{searchParams.error}</div>}

      <section className="rounded-xl border border-accent/50 bg-panel p-5 grid grid-cols-[1fr_320px] gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-ink-100">Browser extension — who really uses each AI</h2>
            <span className="text-[11px] font-medium text-accent border border-accent/40 rounded-full px-2 py-0.5">Best for usage</span>
          </div>
          <p className="text-sm text-ink-400">
            Works for Chrome and Edge. It tells angar which AI websites each person opens (ChatGPT, Claude, Gemini, Copilot…), including personal accounts. That's how angar knows "4 of 10 seats are used" and spots AI nobody pays for.
          </p>
          <ol className="text-sm text-ink-100 flex flex-col gap-1.5 list-decimal pl-5">
            <li>Create a scan token below (step 1) — the same token works for the extension.</li>
            <li>Download the extension and send it to IT, or try it yourself: <span className="text-ink-400">chrome://extensions → Developer mode → Load unpacked</span>.</li>
            <li>IT installs it on every computer with a policy: <code className="text-xs bg-ink rounded px-1.5 py-0.5">{`{"token": "…", "server": "${base}"}`}</code></li>
          </ol>
        </div>
        <div className="flex flex-col gap-3 justify-center">
          <a href="/api/discovery/extension.zip" className="btn btn-primary">Download extension</a>
          <p className="text-xs text-ink-400">Sends only AI website names, visit counts and the work email — never pages, prompts or other browsing.</p>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-4 items-start">
        <section className="col-span-2 rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Step n={1} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-ink-100">Scan computers</h2>
                <span className="text-[11px] font-medium text-accent border border-accent/40 rounded-full px-2 py-0.5">Recommended</span>
              </div>
              <p className="text-sm text-ink-400 mt-0.5">
                One command, about a minute. Finds AI websites used in the last 30 days, AI apps, coding assistants, API keys in use and local models.
              </p>
            </div>
          </div>
          <ScannerSetup base={base} hint={org?.discoveryTokenHint ?? null} canCreate={canCreate} />
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
            <Step n={2} />
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
            <Step n={3} />
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

      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink-100">Found automatically</h2>
            <p className="text-sm text-ink-400">
              {connector?.lastSyncedAt ? `Last result ${fmtDateTime(connector.lastSyncedAt)}` : "Nothing yet — run a scan or upload a log."}
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

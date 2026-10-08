import Link from "next/link";
import { db } from "@/lib/db";
import { Panel, Table, td } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";
import Badge from "@/components/Badge";
import ScannerSetup from "@/components/ScannerSetup";
import CopyButton from "@/components/CopyButton";
import CsvDropzone from "@/components/CsvDropzone";
import ConfirmAction from "@/components/ConfirmAction";
import SubmitButton from "@/components/SubmitButton";
import { uploadNetworkLogAction, revokeDiscoveryTokenAction } from "@/lib/discovery-actions";
import { fmtDateTime } from "@/lib/format";

// Pagina "Other ways" di Connect (prima /discover, poi scheda di /download): estensione del browser,
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
    <div className="flex flex-col gap-6">
      <Panel title="Browser extension" subtitle="For computers where you can't install apps">
        <div id="browser-extension" className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:divide-x divide-line scroll-mt-20">
          <div className="flex flex-col gap-3">
            <div className="eyebrow">Try it on this computer</div>
            <ol className="text-sm text-ink-400 flex flex-col gap-2">
              <li><span className="text-ink-100">1.</span> Download it. It&apos;s already connected to {org?.name}.</li>
              <li><span className="text-ink-100">2.</span> Unzip it, open <span className="text-ink-100">chrome://extensions</span> (Edge: <span className="text-ink-100">edge://extensions</span>).</li>
              <li><span className="text-ink-100">3.</span> Turn on <span className="text-ink-100">Developer mode</span>, click <span className="text-ink-100">Load unpacked</span>, pick the folder.</li>
            </ol>
            {canEdit && <a href="/api/extension/download" className="btn btn-primary self-start mt-auto">Download extension</a>}
          </div>
          <div className="flex flex-col gap-3 lg:pl-6">
            <div className="eyebrow">Everyone in the company</div>
            <p className="text-sm text-ink-400">Each person installs the extension, opens this link and types their work email.</p>
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
          <details className="text-sm mt-5 pt-4 border-t border-line">
            <summary className="cursor-pointer list-none text-ink-400 hover:text-ink-100 select-none">For IT: install it on every computer automatically</summary>
            <div className="mt-3 flex flex-col gap-2 text-ink-400">
              <p>Force-install it with Google Admin or Intune/Group Policy (ExtensionInstallForcelist) and push this managed configuration:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded-lg border border-line bg-ink px-3 py-2 text-xs text-ink-100">{policy}</code>
                <CopyButton text={policy} />
              </div>
            </div>
          </details>
        )}
      </Panel>

      <Panel
        title="One-off scan"
        subtitle="One command, about a minute"
        footer={
          <>
            <span className="text-xs text-ink-400 flex-1 min-w-0">Only AI services angar recognises leave the computer, never browsing, prompts or key values. It asks before sending; <span className="font-mono whitespace-nowrap">--dry-run</span> sends nothing.</span>
            {canAdmin && org?.discoveryTokenHint && (
              <ConfirmAction
                label="Revoke token"
                title="Stops the scanner, the extension and every desktop app from sending data"
                question="Revoke the discovery token?"
                detail="The scanner, the extension and every desktop app stop sending data until they get a new token."
                confirmLabel="Yes, revoke the token"
                pendingLabel="Revoking…"
                action={revokeDiscoveryTokenAction}
                fields={{}}
                align="left"
              />
            )}
          </>
        }
      >
        {canAdmin ? <ScannerSetup base={base} token={token} /> : <p className="text-sm text-ink-400">Ask an admin of this workspace to run the scan.</p>}
      </Panel>

      <div id="network" className="scroll-mt-20">
        <Panel title="Upload a network log" subtitle="DNS or web logs from your firewall, router or DNS server">
          {canEdit ? (
            <form action={uploadNetworkLogAction} className="flex flex-col gap-3">
              <CsvDropzone accept=".log,.txt,.csv,.json,.jsonl,.tsv,.gz,.zip,text/plain,text/csv,application/json,application/zip" multiple label="Choose log files or drag them here" />
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton className="btn btn-secondary" pendingLabel="Reading logs…">Find AI in this log</SubmitButton>
                <span className="text-xs text-ink-400">
                  Always on instead? <Link href="/edge" className="underline hover:text-ink-100">angar Edge</Link> watches the network continuously.
                </span>
              </div>
            </form>
          ) : (
            <p className="text-sm text-ink-400">Viewers can&apos;t upload logs. Ask an editor.</p>
          )}
        </Panel>
      </div>

      <Table title="Found automatically" note={connector?.lastSyncedAt ? `Last result ${fmtDateTime(connector.lastSyncedAt)}` : "Nothing yet"} action={found.some((a) => a.status === "UNKNOWN" || a.status === "UNREVIEWED") ? <Link href="/review" className="btn btn-secondary btn-sm">Review what was found</Link> : undefined} columns={["AI system", "Seen on", "Last seen", "Status"]} empty={found.length === 0 && "No AI found automatically yet."}>
          {found.map((a) => {
            const devices = [...new Set(a.connectedSystems.map((c) => c.detail ?? ""))].filter(Boolean);
            return (
              <tr key={a.id}>
                <td className={td}>
                  <Link href={`/estate/${a.id}`} className="flex items-center gap-3">
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

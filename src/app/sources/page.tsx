import Link from "next/link";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { Notice, PageHeader } from "@/components/ui";
import CsvDropzone from "@/components/CsvDropzone";
import EdgeBox from "@/components/EdgeBox";
import { uploadSpendAction, syncFattureInCloudAction, syncBankAction, syncAccountingAction } from "@/lib/spend-actions";
import { fmtDate } from "@/lib/format";
import { workplaceStatus } from "@/lib/connectors/workplace";
import { ficConfigured } from "@/lib/connectors/fatture-in-cloud";
import { bankConfigured } from "@/lib/connectors/bank";
import { chiftConfigured } from "@/lib/connectors/chift";
import { featureEnabled } from "@/lib/plan-gate";
import { LockedNote } from "@/components/LockedFeature";
import { desktopDeviceCounts } from "@/lib/discovery/devices";

export const dynamic = "force-dynamic";

const SPEND_ACCEPT = ".csv,.txt,.tsv,.xlsx,.xls,.ods,.xml,.p7m,.zip";

// Connect: la pagina di configurazione. Quattro riquadri (costi, account aziendali,
// app desktop, angar Edge) e sotto l'elenco compatto delle fonti.
export default async function SourcesPage({ searchParams }: { searchParams: { error?: string } }) {
  const orgId = currentOrgId();
  const [spendCount, lastSpend, connectors, network, workplace, devices, sensors] = await Promise.all([
    db.spendRecord.count({ where: { organizationId: orgId } }),
    db.spendRecord.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" } }),
    db.connector.findMany({ where: { organizationId: orgId, status: "CONNECTED", credentialsEncrypted: { not: null } } }),
    db.connector.findUnique({ where: { organizationId_provider: { organizationId: orgId, provider: "NETWORK" } } }),
    workplaceStatus(orgId),
    desktopDeviceCounts(orgId),
    db.edgeSensor.count({ where: { organizationId: orgId } }),
  ]);
  const [fic, bankRow, accountingRow] = await Promise.all(
    (["FATTURE_IN_CLOUD", "BANK", "ACCOUNTING"] as const).map((provider) => db.connector.findUnique({ where: { organizationId_provider: { organizationId: orgId, provider } } }))
  );
  const bankState: RowState = bankRow?.credentialsEncrypted ? "connected" : bankConfigured() ? "available" : "soon";
  const accountingState: RowState = accountingRow?.lastSyncedAt ? "connected" : chiftConfigured() ? "available" : "soon";
  const ficState: RowState = fic?.credentialsEncrypted ? "connected" : ficConfigured() ? "available" : "soon";
  const workplaceEnabled = await featureEnabled(orgId, "microsoft365");
  const keys = connectors.filter((c) => !["MICROSOFT_365", "GOOGLE_WORKSPACE", "NETWORK", "FATTURE_IN_CLOUD", "BANK", "ACCOUNTING"].includes(c.provider));
  const accountsDone = workplace.connected.length + keys.length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Connect" subtitle="Connect once — angar keeps everything up to date." />
      {searchParams.error && <Notice tone="error">{searchParams.error}</Notice>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
        <Card title="Bank & invoices" text="Upload a statement or invoices to see every AI you pay for." status={spendCount ? `${spendCount} AI charges · last ${fmtDate(lastSpend!.createdAt)}` : null} start>
          <form action={uploadSpendAction} className="flex flex-col gap-3">
            <input type="hidden" name="back" value="/sources" />
            <CsvDropzone accept={SPEND_ACCEPT} multiple label="Drop bank/card exports or e-invoices here" />
            <div className="flex items-center justify-between gap-3">
              <button className="btn btn-primary">Find my AI spend</button>
              <a href="/api/spend/sample" className="text-xs text-ink-400 hover:text-ink-100 underline">Try a sample</a>
            </div>
          </form>
        </Card>

        <Card title="Company accounts" text="Microsoft 365, Google, OpenAI, Anthropic… — who uses which AI." status={accountsDone ? `${accountsDone} connected` : null}>
          <a href="#sources" className="btn btn-secondary self-start">{accountsDone ? "Manage" : "Connect accounts"}</a>
        </Card>

        <Card title="Desktop app" text="See who uses which AI on each computer." status={devices.total ? `${devices.online} of ${devices.total} computer${devices.total === 1 ? "" : "s"} online` : null}>
          <Link href="/download" className="btn btn-secondary self-start">{devices.total ? "Open" : "Get the app"}</Link>
        </Card>

        <Card title="angar Edge" text="A small box that sees every AI on your whole network." status={sensors ? `${sensors} sensor${sensors === 1 ? "" : "s"}` : null}>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <Link href="/edge/sensors" className="btn btn-secondary">{sensors ? "Open" : "Set up"}</Link>
              <Link href="/edge" className="text-xs text-ink-400 hover:text-ink-100 underline">Learn more</Link>
            </span>
            <EdgeBox width={90} className="shrink-0 -my-3" />
          </div>
        </Card>
      </div>

      <section id="sources" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="text-base font-semibold text-ink-100">Sources</h2>
        <div className="rounded-xl border border-line bg-panel divide-y divide-line">
          {workplace.providers.map((p) => (
            <SourceRow key={p.id} label={p.label}>
              {p.connected ? (
                <span className="text-xs text-steady">Connected</span>
              ) : p.available ? (
                workplaceEnabled ? <a href={p.connectUrl} className="btn btn-secondary btn-sm">Connect</a> : <LockedNote feature={p.id === "GOOGLE_WORKSPACE" ? "googleWorkspace" : "microsoft365"} />
              ) : (
                <span className="text-xs text-ink-400">Coming soon</span>
              )}
            </SourceRow>
          ))}
          <SourceRow label="AI provider keys" hint="OpenAI, Anthropic, Gemini, Mistral…">
            {keys.length > 0 && <span className="text-xs text-steady">{keys.length} connected</span>}
            <Link href="/connectors" className="btn btn-secondary btn-sm">{keys.length ? "Manage" : "Add a key"}</Link>
          </SourceRow>
          <AutoRow label="Bank account" state={bankState} connectHref="/sources/bank" syncAction={syncBankAction} />
          <AutoRow label="Accounting software" hint="DATEV, Pennylane, Exact, Sage, Xero…" state={accountingState} connectHref="/api/connectors/accounting/connect" syncAction={syncAccountingAction} />
          <AutoRow label="Fatture in Cloud" hint="Italian e-invoices" state={ficState} connectHref="/api/connectors/fattureincloud/connect" syncAction={syncFattureInCloudAction} />
          <SourceRow label="Desktop app" hint={network?.lastSyncedAt ? `Last data ${fmtDate(network.lastSyncedAt)}` : undefined}>
            <Link href="/download" className="btn btn-ghost btn-sm">{network ? "Open" : "Get the app"}</Link>
          </SourceRow>
        </div>
      </section>
    </div>
  );
}

function Card({ title, text, status, start, children }: { title: string; text: string; status: string | null; start?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-ink-100">{title}</h2>
          {status ? <span className="text-xs text-steady">✓ {status}</span> : start && <span className="text-[11px] font-medium text-accent border border-accent/40 rounded-full px-2 py-0.5">Start here</span>}
        </div>
        <p className="text-sm text-ink-400 mt-0.5">{text}</p>
      </div>
      <div className="flex flex-col gap-3 mt-auto">{children}</div>
    </section>
  );
}

function SourceRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm text-ink-100">{label}</span>
        {hint && <span className="block text-xs text-ink-400 truncate">{hint}</span>}
      </span>
      <span className="flex items-center gap-2 shrink-0">{children}</span>
    </div>
  );
}

type RowState = "connected" | "available" | "soon";

function AutoRow({ label, hint, state, connectHref, syncAction }: { label: string; hint?: string; state: RowState; connectHref: string; syncAction: () => Promise<void> }) {
  return (
    <SourceRow label={label} hint={hint}>
      {state === "connected" ? (
        <>
          <span className="text-xs text-steady">Connected</span>
          <form action={syncAction}>
            <button className="btn btn-secondary btn-sm">Sync now</button>
          </form>
        </>
      ) : state === "available" ? (
        <a href={connectHref} className="btn btn-secondary btn-sm">Connect</a>
      ) : (
        <span className="text-xs text-ink-400">Coming soon</span>
      )}
    </SourceRow>
  );
}

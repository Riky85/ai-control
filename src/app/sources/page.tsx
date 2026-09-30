import Link from "next/link";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { Notice, PageHeader } from "@/components/ui";
import CsvDropzone from "@/components/CsvDropzone";
import { uploadSpendAction, syncFattureInCloudAction, syncBankAction, syncAccountingAction } from "@/lib/spend-actions";
import { fmtDate } from "@/lib/format";
import { workplaceStatus } from "@/lib/connectors/workplace";
import { ficConfigured } from "@/lib/connectors/fatture-in-cloud";
import { bankConfigured } from "@/lib/connectors/bank";
import { chiftConfigured } from "@/lib/connectors/chift";
import { featureEnabled } from "@/lib/plan-gate";
import { LockedNote } from "@/components/LockedFeature";

export const dynamic = "force-dynamic";

const SPEND_ACCEPT = ".csv,.txt,.tsv,.xlsx,.xls,.ods,.xml,.p7m,.zip";

// Sources: caricamento di estratti conto/fatture e l'elenco compatto delle fonti
// (account aziendali, chiavi, banca, contabilità). La panoramica sta in /connect.
export default async function SourcesPage({ searchParams }: { searchParams: { error?: string } }) {
  const orgId = currentOrgId();
  const [spendCount, lastSpend, connectors, workplace] = await Promise.all([
    db.spendRecord.count({ where: { organizationId: orgId } }),
    db.spendRecord.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" } }),
    db.connector.findMany({ where: { organizationId: orgId, status: "CONNECTED", credentialsEncrypted: { not: null } } }),
    workplaceStatus(orgId),
  ]);
  const [fic, bankRow, accountingRow] = await Promise.all(
    (["FATTURE_IN_CLOUD", "BANK", "ACCOUNTING"] as const).map((provider) => db.connector.findUnique({ where: { organizationId_provider: { organizationId: orgId, provider } } }))
  );
  const bankState: RowState = bankRow?.credentialsEncrypted ? "connected" : bankConfigured() ? "available" : "soon";
  const accountingState: RowState = accountingRow?.lastSyncedAt ? "connected" : chiftConfigured() ? "available" : "soon";
  const ficState: RowState = fic?.credentialsEncrypted ? "connected" : ficConfigured() ? "available" : "soon";
  const workplaceEnabled = await featureEnabled(orgId, "microsoft365");
  const keys = connectors.filter((c) => !["MICROSOFT_365", "GOOGLE_WORKSPACE", "NETWORK", "FATTURE_IN_CLOUD", "BANK", "ACCOUNTING", "JIRA", "SERVICENOW"].includes(c.provider));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader crumbs={[{ label: "Connect", href: "/connect" }]} title="Sources" subtitle="Your costs and accounts, in one place." />
      {searchParams.error && <Notice tone="error">{searchParams.error}</Notice>}

      <Card title="Bank & invoices" text="Upload a statement or invoices to see every AI you pay for." status={spendCount ? `${spendCount} AI charges · last ${fmtDate(lastSpend!.createdAt)}` : null}>
        <form action={uploadSpendAction} className="flex flex-col gap-3">
          <input type="hidden" name="back" value="/sources" />
          <CsvDropzone accept={SPEND_ACCEPT} multiple label="Drop bank/card exports or e-invoices here" />
          <div className="flex items-center justify-between gap-3">
            <button className="btn btn-primary">Find my AI spend</button>
            <a href="/api/spend/sample" className="text-xs text-ink-400 hover:text-ink-100 underline">Try a sample</a>
          </div>
        </form>
        {/* Contratti, order form e fatture in PDF: lettura dei campi del contratto. */}
        <Link href="/contracts/upload" className="flex items-center justify-between gap-3 border-t border-line pt-3 text-sm group">
          <span className="min-w-0">
            <span className="text-ink-100 group-hover:underline">Read a contract (PDF)</span>
            <span className="text-ink-400"> — plan, seats, price, renewal and notice from a contract, order form or invoice</span>
          </span>
          <span className="text-ink-400 group-hover:text-ink-100 shrink-0" aria-hidden>→</span>
        </Link>
      </Card>

      <section id="accounts" className="scroll-mt-6">
        <div className="rounded-xl border border-line bg-panel divide-y divide-line overflow-hidden animate-rise">
          <h2 className="bg-ink px-4 py-3 text-sm font-semibold text-ink-100">Accounts</h2>
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
        </div>
      </section>
    </div>
  );
}

function Card({ title, text, status, children }: { title: string; text: string; status: string | null; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4 animate-rise">
      {/* Barra grigia in alto: titolo e stato. */}
      <div className="-mx-5 -mt-5 flex items-center justify-between gap-2 bg-ink border-b border-line rounded-t-xl px-5 py-3 bar-head">
        <h2 className="text-sm font-semibold text-ink-100">{title}</h2>
        {status && <span className="text-xs text-steady">✓ {status}</span>}
      </div>
      <p className="text-sm text-ink-400">{text}</p>
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

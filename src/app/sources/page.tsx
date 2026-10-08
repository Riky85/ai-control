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
import { emailHistoryView, type EmailHistoryView } from "@/lib/connectors/email-history";
import { setEmailHistoryAction } from "@/lib/connectors/email-history-actions";

export const dynamic = "force-dynamic";

const SPEND_ACCEPT = ".csv,.txt,.tsv,.xlsx,.xls,.ods,.xml,.xsig,.p7m,.zip,.pdf";

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
  const keys = connectors.filter((c) => !["MICROSOFT_365", "GOOGLE_WORKSPACE", "NETWORK", "FATTURE_IN_CLOUD", "BANK", "ACCOUNTING", "JIRA", "SERVICENOW", "OKTA", "CLOUDFLARE_GATEWAY", "CISCO_UMBRELLA"].includes(c.provider));
  // Log di rete (Cloudflare Gateway, Cisco Umbrella): riga a parte, non tra le chiavi dei provider AI.
  const networkLogs = connectors.filter((c) => c.provider === "CLOUDFLARE_GATEWAY" || c.provider === "CISCO_UMBRELLA");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader subtitle="Bank, invoices and accounts" crumbs={[{ label: "Connect", href: "/connect" }]} title="Sources" />
      {searchParams.error && <Notice tone="error">{searchParams.error}</Notice>}

      <Card title="Bank & invoices" status={spendCount ? `${spendCount} AI charge${spendCount === 1 ? "" : "s"}${lastSpend ? ` · last ${fmtDate(lastSpend.createdAt)}` : ""}` : null}>
        <form action={uploadSpendAction} className="flex flex-col gap-3">
          <input type="hidden" name="back" value="/sources" />
          <div title="Bank or card exports (CSV, Excel) and e-invoices (FatturaPA, Peppol/UBL, XRechnung, ZUGFeRD, Factur-X, Facturae): XML, PDF or zip.">
            <CsvDropzone accept={SPEND_ACCEPT} multiple label="Drop a statement or invoices" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <button className="btn btn-primary">Find my AI spend</button>
            <a href="/api/spend/sample" className="text-xs text-ink-400 hover:text-ink-100 underline">Try a sample</a>
          </div>
        </form>
        {/* Contratti, order form e fatture in PDF: lettura dei campi del contratto. */}
        <Link href="/contracts/upload" className="flex items-center justify-between gap-3 border-t border-line pt-3 text-sm group">
          <span className="min-w-0">
            <span className="text-ink-100 group-hover:underline" title="Plan, seats, price, renewal and notice from a contract, order form or invoice">Read a contract (PDF)</span>
          </span>
          <span className="font-mono text-[12px] text-ink-400 group-hover:text-ink-100 shrink-0" aria-hidden>[→]</span>
        </Link>
      </Card>

      <section id="accounts" className="scroll-mt-6">
        <div className="rounded-xl border border-line bg-panel divide-y divide-line overflow-hidden animate-rise">
          <h2 className="px-4 py-3 text-sm font-bold text-ink-100">Accounts</h2>
          {workplace.providers.map((p) => {
            // Storico email (mittenti dei servizi AI): riga sotto l'account collegato.
            const row = p.connected ? connectors.find((c) => c.provider === p.id) : undefined;
            const email = row ? emailHistoryView(row, fmtDate) : null;
            return (
            <SourceRow key={p.id} label={p.label} detail={email ? <EmailHistoryLine provider={p.id} view={email} /> : undefined}>
              {p.connected ? (
                <span className="font-mono uppercase text-[10px] tracking-[0.05em] text-steady">Connected</span>
              ) : p.available ? (
                workplaceEnabled ? <a href={p.connectUrl} className="btn btn-secondary btn-sm">Connect</a> : <LockedNote feature={p.id === "GOOGLE_WORKSPACE" ? "googleWorkspace" : p.id === "OKTA" ? "okta" : "microsoft365"} />
              ) : (
                <span className="eyebrow">Coming soon</span>
              )}
            </SourceRow>
            );
          })}
          <SourceRow label="AI provider keys" hint="OpenAI, Anthropic, Gemini, Azure OpenAI, Bedrock, Vertex AI…">
            {keys.length > 0 && <span className="font-mono uppercase text-[10px] tracking-[0.05em] text-steady">{keys.length} connected</span>}
            <Link href="/connectors" className="btn btn-secondary btn-sm">{keys.length ? "Manage" : "Add a key"}</Link>
          </SourceRow>
          <SourceRow label="Network logs" hint="Cloudflare Gateway, Cisco Umbrella, Zscaler, Fortinet, DNS servers">
            {networkLogs.length > 0 && <span className="font-mono uppercase text-[10px] tracking-[0.05em] text-steady">{networkLogs.length} connected</span>}
            <Link href="/connectors#network-logs" className="btn btn-secondary btn-sm">{networkLogs.length ? "Manage" : "Connect"}</Link>
          </SourceRow>
          <AutoRow label="Bank account" state={bankState} connectHref="/sources/bank" syncAction={syncBankAction} />
          <AutoRow label="Accounting software" hint="DATEV, Pennylane, Exact, Sage, Xero…" state={accountingState} connectHref="/api/connectors/accounting/connect" syncAction={syncAccountingAction} />
          <AutoRow label="Fatture in Cloud" hint="Italian e-invoices" state={ficState} connectHref="/api/connectors/fattureincloud/connect" syncAction={syncFattureInCloudAction} />
        </div>
      </section>
    </div>
  );
}

function Card({ title, status, children }: { title: string; status: string | null; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4 animate-rise">
      {/* Barra grigia in alto: titolo e stato. */}
      <div className="-mx-5 -mt-5 flex items-center justify-between gap-2 bg-ink border-b border-line rounded-t-xl px-5 py-3 bar-head">
        <h2 className="text-sm font-bold text-ink-100">{title}</h2>
        {status && <span className="font-mono uppercase text-[10px] tracking-[0.05em] text-steady">✓ {status}</span>}
      </div>
      <div className="flex flex-col gap-3 mt-auto">{children}</div>
    </section>
  );
}

function SourceRow({ label, hint, detail, children }: { label: string; hint?: string; detail?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm text-ink-100" title={hint}>{label}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">{children}</span>
      </div>
      {detail}
    </div>
  );
}

/** Storico email: stato della scansione, eventuale permesso mancante e interruttore. */
function EmailHistoryLine({ provider, view }: { provider: string; view: EmailHistoryView }) {
  return (
    <div className="mt-1.5 flex items-start justify-between gap-3 text-xs">
      <span className="min-w-0 text-ink-400">
        <span className="block">{view.line}</span>
        {view.hint && (
          <span className="block text-accent">
            {view.hint.text}
            {view.hint.href && (
              <>
                {" "}
                <a href={view.hint.href} className="underline hover:text-ink-100">{view.hint.cta ?? "Open"}</a>
              </>
            )}
          </span>
        )}
      </span>
      <form action={setEmailHistoryAction} className="shrink-0">
        <input type="hidden" name="provider" value={provider} />
        <input type="hidden" name="on" value={view.on ? "off" : "on"} />
        <button
          type="submit"
          role="switch"
          aria-checked={view.on}
          aria-label="Email history"
          title={view.on ? "Turn off email history" : "Turn on email history"}
          className={`relative block h-5 w-9 rounded-full transition-colors ${view.on ? "bg-steady" : "bg-ink-400/40"}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${view.on ? "left-[18px]" : "left-0.5"}`} />
        </button>
      </form>
    </div>
  );
}

type RowState = "connected" | "available" | "soon";

function AutoRow({ label, hint, state, connectHref, syncAction }: { label: string; hint?: string; state: RowState; connectHref: string; syncAction: () => Promise<void> }) {
  return (
    <SourceRow label={label} hint={hint}>
      {state === "connected" ? (
        <>
          <span className="font-mono uppercase text-[10px] tracking-[0.05em] text-steady">Connected</span>
          <form action={syncAction}>
            <button className="btn btn-secondary btn-sm">Sync now</button>
          </form>
        </>
      ) : state === "available" ? (
        <a href={connectHref} className="btn btn-secondary btn-sm">Connect</a>
      ) : (
        <span className="eyebrow">Coming soon</span>
      )}
    </SourceRow>
  );
}

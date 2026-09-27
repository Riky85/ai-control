import Link from "next/link";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { PageHeader } from "@/components/ui";
import CsvDropzone from "@/components/CsvDropzone";
import EdgeBox from "@/components/EdgeBox";
import { uploadSpendAction, syncFattureInCloudAction, syncBankAction, syncAccountingAction } from "@/lib/spend-actions";
import { fmtDate } from "@/lib/format";
import { workplaceStatus } from "@/lib/connectors/workplace";
import { ficConfigured } from "@/lib/connectors/fatture-in-cloud";
import { bankConfigured } from "@/lib/connectors/bank";
import { chiftConfigured } from "@/lib/connectors/chift";

export const dynamic = "force-dynamic";

const SPEND_ACCEPT = ".csv,.txt,.tsv,.xlsx,.xls,.ods,.xml,.p7m,.zip";

// Le fonti da cui angar capisce tutto da sola. Una volta collegate, niente
// da inserire: elenco AI, costi e risparmi si aggiornano automaticamente.
export default async function SourcesPage({ searchParams }: { searchParams: { error?: string } }) {
  const orgId = currentOrgId();
  const [spendCount, lastSpend, connectors, network, workplace] = await Promise.all([
    db.spendRecord.count({ where: { organizationId: orgId } }),
    db.spendRecord.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" } }),
    db.connector.findMany({ where: { organizationId: orgId, status: "CONNECTED", credentialsEncrypted: { not: null } } }),
    db.connector.findUnique({ where: { organizationId_provider: { organizationId: orgId, provider: "NETWORK" } } }),
    workplaceStatus(orgId),
  ]);
  const [fic, bankRow, accountingRow] = await Promise.all(
    (["FATTURE_IN_CLOUD", "BANK", "ACCOUNTING"] as const).map((provider) => db.connector.findUnique({ where: { organizationId_provider: { organizationId: orgId, provider } } }))
  );
  const bankState: RowState = bankRow?.credentialsEncrypted ? "connected" : bankConfigured() ? "available" : "soon";
  const accountingState: RowState = accountingRow?.lastSyncedAt ? "connected" : chiftConfigured() ? "available" : "soon";
  const keys = connectors.filter((c) => !["MICROSOFT_365", "GOOGLE_WORKSPACE", "NETWORK", "FATTURE_IN_CLOUD", "BANK", "ACCOUNTING"].includes(c.provider));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Sources" subtitle="Connect once. angar keeps your AI list, costs and savings up to date by itself — nothing to type." />
      {searchParams.error && <div className="rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm">{searchParams.error}</div>}

      <div className="grid grid-cols-2 gap-4 items-stretch">
        <Card
          n={1}
          title="Bank & invoices"
          finds="Every AI you pay for, plans, seats and real cost"
          status={spendCount ? `${spendCount} AI charges read · last ${fmtDate(lastSpend!.createdAt)}` : null}
          recommended
        >
          <form action={uploadSpendAction} className="flex flex-col gap-3">
            <input type="hidden" name="back" value="/sources" />
            <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
              <AutoRow
                label="Bank account"
                hint="every AI charge, every day"
                state={bankState}
                connectHref="/sources/bank"
                syncAction={syncBankAction}
              />
              <AutoRow
                label="Accounting software"
                hint="DATEV, Pennylane, Exact, Sage, Xero, QuickBooks…"
                state={accountingState}
                connectHref="/api/connectors/accounting/connect"
                syncAction={syncAccountingAction}
              />
              <AutoRow
                label="Fatture in Cloud"
                hint="Italian e-invoices"
                state={fic?.credentialsEncrypted ? "connected" : ficConfigured() ? "available" : "soon"}
                connectHref="/api/connectors/fattureincloud/connect"
                syncAction={syncFattureInCloudAction}
              />
            </div>
            <CsvDropzone accept={SPEND_ACCEPT} multiple label="Or drop bank/card exports or e-invoices here" />
            <div className="flex items-center justify-between gap-3">
              <button className="btn btn-primary">Find my AI spend</button>
              <a href="/api/spend/sample" className="text-xs text-ink-400 hover:text-ink-100 underline">Try a sample</a>
            </div>
            <p className="text-xs text-ink-400">Any bank/card CSV or Excel, e-invoices (XML, .p7m) or your accountant's zip. Only AI lines are kept.</p>
          </form>
        </Card>

        <Card n={2} title="Company accounts" finds="Who uses which AI, with their work account" status={workplace.connected.length ? `Connected: ${workplace.connected.join(", ")}` : null}>
          <div className="flex flex-col gap-2">
            {workplace.providers.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
                <span className="text-sm text-ink-100">{p.label}</span>
                {p.connected ? (
                  <span className="text-xs text-steady">Connected</span>
                ) : p.available ? (
                  <a href={p.connectUrl} className="btn btn-secondary btn-sm">Connect</a>
                ) : (
                  <span className="text-xs text-ink-400">Coming soon</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-400">An administrator approves read-only access once. angar sees sign-ins to AI apps — never emails, files or chats.</p>
        </Card>

        <Card n={3} title="AI provider keys" finds="Exact API usage and cost (Claude, OpenAI, Gemini, Mistral…)" status={keys.length ? `${keys.length} connected` : null}>
          <Link href="/connectors" className="btn btn-secondary self-start">{keys.length ? "Manage keys" : "Add a key"}</Link>
        </Card>

        <Card n={4} title="angar desktop app" finds="Who uses each AI and for how long (any browser + desktop apps)" status={network?.lastSyncedAt ? `Last data ${fmtDate(network.lastSyncedAt)}` : null}>
          <Link href="/download" className="btn btn-secondary self-start">{network ? "Open" : "Get the app"}</Link>
        </Card>
      </div>

      <Link href="/edge" className="group rounded-xl border border-line bg-panel px-5 py-4 flex items-center gap-5 hover:border-accent/50 transition-colors">
        <EdgeBox width={110} className="shrink-0 -my-3" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-ink-100">angar Edge</h2>
            <span className="text-[11px] font-medium text-accent border border-accent/40 rounded-full px-2 py-0.5">Hardware</span>
          </div>
          <p className="text-sm text-ink-400 mt-0.5">Prefer nothing installed on computers? A small box on your network sees every AI in use — phones and servers included.</p>
        </div>
        <span className="text-sm text-ink-400 group-hover:text-ink-100 shrink-0">Learn more →</span>
      </Link>
    </div>
  );
}

function Card({ n, title, finds, status, recommended, children }: { n: number; title: string; finds: string; status: string | null; recommended?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className={`h-7 w-7 shrink-0 rounded-full border text-sm font-medium flex items-center justify-center ${status ? "border-steady text-steady" : "border-line text-ink-100"}`}>
          {status ? "✓" : n}
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-ink-100">{title}</h2>
            {recommended && !status && <span className="text-[11px] font-medium text-accent border border-accent/40 rounded-full px-2 py-0.5">Start here</span>}
          </div>
          <p className="text-xs text-ink-400 mt-0.5">Finds: {finds}</p>
          {status && <p className="text-xs text-steady mt-1">{status}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-3 mt-auto">{children}</div>
    </section>
  );
}

type RowState = "connected" | "available" | "soon";

function AutoRow({ label, hint, state, connectHref, syncAction }: { label: string; hint: string; state: RowState; connectHref: string; syncAction: () => Promise<void> }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm text-ink-100">{label}</span>
        <span className="block text-xs text-ink-400 truncate">{hint}</span>
      </span>
      {state === "connected" ? (
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-steady">Connected</span>
          <button formAction={syncAction} formNoValidate className="btn btn-secondary btn-sm">Sync now</button>
        </span>
      ) : state === "available" ? (
        <a href={connectHref} className="btn btn-secondary btn-sm shrink-0">Connect</a>
      ) : (
        <span className="text-xs text-ink-400 shrink-0">Coming soon</span>
      )}
    </div>
  );
}

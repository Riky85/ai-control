import Link from "next/link";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { PageHeader } from "@/components/ui";
import CsvDropzone from "@/components/CsvDropzone";
import { uploadSpendAction } from "@/lib/spend-actions";
import { fmtDate } from "@/lib/format";
import { workplaceStatus } from "@/lib/connectors/workplace";

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
  const keys = connectors.filter((c) => !["MICROSOFT_365", "GOOGLE_WORKSPACE", "NETWORK"].includes(c.provider));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Sources" subtitle="Connect once. angar keeps your AI list, costs and savings up to date by itself — nothing to type." />
      {searchParams.error && <div className="rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm">{searchParams.error}</div>}

      <div className="grid grid-cols-2 gap-4 items-stretch">
        <Card
          n={1}
          title="Bank statement & invoices"
          finds="Every AI you pay for, plans, seats and real cost"
          status={spendCount ? `${spendCount} AI charges read · last ${fmtDate(lastSpend!.createdAt)}` : null}
          recommended
        >
          <form action={uploadSpendAction} className="flex flex-col gap-3">
            <input type="hidden" name="back" value="/sources" />
            <CsvDropzone accept={SPEND_ACCEPT} multiple label="Drop bank/card exports or e-invoices here" />
            <div className="flex items-center justify-between gap-3">
              <button className="btn btn-primary">Find my AI spend</button>
              <a href="/api/spend/sample" className="text-xs text-ink-400 hover:text-ink-100 underline">Try with a sample statement</a>
            </div>
            <p className="text-xs text-ink-400">
              CSV or Excel from any bank or card (Revolut, Qonto, Intesa, UniCredit…), e-invoices (FatturaPA XML, .p7m, TD17 self-invoices) or the zip from your accountant. Only AI lines are kept; everything else is discarded.
            </p>
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

        <Card n={4} title="Extension & network scan" finds="Who really uses each AI, and AI nobody pays for" status={network?.lastSyncedAt ? `Last scan ${fmtDate(network.lastSyncedAt)}` : null}>
          <Link href="/discover" className="btn btn-secondary self-start">{network ? "Open" : "Set up"}</Link>
        </Card>
      </div>
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
          <p className="text-sm text-ink-400 mt-0.5">Finds: {finds}</p>
          {status && <p className="text-xs text-steady mt-1">{status}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-3 mt-auto">{children}</div>
    </section>
  );
}

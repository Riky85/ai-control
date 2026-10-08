import Link from "next/link";
import CsvDropzone from "@/components/CsvDropzone";
import { BlockFoot, BlockHead, PageHeader, Panel } from "@/components/ui";
import { uploadSpendAction } from "@/lib/spend-actions";
import { loadDemoDataAction } from "@/lib/test-data-actions";
import ImportCheckOffer from "@/components/check/ImportCheckOffer";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Un solo passo: dai ad angar l'estratto conto (o le fatture) e basta.
// Le altre fonti sono facoltative e si aggiungono quando si vuole.
export default async function Onboarding({ searchParams }: { searchParams: { error?: string } }) {
  const s = currentSession();
  // L'offerta di importare l'AI Spend Check compare solo con il workspace ancora senza costi.
  const empty = s ? !(await db.spendRecord.findFirst({ where: { organizationId: s.orgId }, select: { id: true } })) : false;
  return (
    <div className="flex flex-col gap-6">
      {/* Intestazione standard della piattaforma al posto del titolo centrato. */}
      <PageHeader
        title="Get started"
        subtitle="One file is enough"
        action={
          <>
            <Link href="/" className="btn btn-ghost btn-sm">Skip</Link>
            <form action={loadDemoDataAction}>
              <button className="btn btn-secondary btn-sm" title="Load a demo company and see angar with data">Load demo data</button>
            </form>
          </>
        }
      />
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-6">
      {empty && s?.role !== "VIEWER" && <ImportCheckOffer />}

      <Panel title="Drop a bank or card statement" subtitle="Only AI charges are kept">
        <form action={uploadSpendAction} className="flex flex-col gap-4">
          <input type="hidden" name="back" value="/onboarding" />
          <div title="CSV or Excel from your bank, or e-invoices (FatturaPA, Peppol/UBL, XRechnung, ZUGFeRD, Factur-X, Facturae) as XML, PDF or zip.">
            <CsvDropzone accept=".csv,.txt,.tsv,.xlsx,.xls,.ods,.xml,.xsig,.p7m,.zip,.pdf" multiple label="Choose files or drag them here" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button className="btn btn-primary">Find my AI</button>
            <a href="/api/spend/sample" className="text-xs text-ink-400 hover:text-ink-100 underline">Download a sample</a>
          </div>
        </form>
      </Panel>

      <div className="rounded-xl border border-line bg-panel animate-rise">
        <BlockHead title="Or start from" />
        <div className="divide-y divide-line">
          <Option href="/sources#accounts" title="Company accounts" text="Microsoft 365 or Google Workspace: who uses which AI." />
          <Option href="/connectors" title="An AI provider key" text="Claude, OpenAI, Gemini, Mistral…: exact API costs." />
          <Option href="/download" title="The desktop app" text="Which AI is used, and for how long. Never what people type." />
        </div>
        <BlockFoot>
          <span className="text-xs text-ink-400 leading-relaxed">
            Privacy starts <span className="text-ink-100">by department</span>: totals for groups of 5 or more, no names. Change it in{" "}
            <Link href="/settings?tab=privacy" className="underline hover:text-ink-100">Settings</Link> after sharing the{" "}
            <Link href="/compliance/employee-notice" className="underline hover:text-ink-100">employee notice</Link>.{" "}
            <Link href="/trust" className="underline hover:text-ink-100">How we protect your data</Link>
          </span>
        </BlockFoot>
      </div>
      </div>
    </div>
  );
}

function Option({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-ink-100/[0.025] transition-colors group">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-100 group-hover:underline">{title}</span>
        <span className="block text-sm text-ink-400">{text}</span>
      </span>
      <span className="eyebrow shrink-0" aria-hidden>[→]</span>
    </Link>
  );
}

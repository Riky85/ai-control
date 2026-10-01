import Link from "next/link";
import CsvDropzone from "@/components/CsvDropzone";
import { uploadSpendAction } from "@/lib/spend-actions";
import { loadDemoDataAction } from "@/lib/test-data-actions";

export const dynamic = "force-dynamic";

// Un solo passo: dai ad angar l'estratto conto (o le fatture) e basta.
// Le altre fonti sono facoltative e si aggiungono quando si vuole.
export default function Onboarding({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6 py-6">
      <div className="text-center">
        <h1 className="font-display text-[30px] leading-tight font-semibold tracking-tight text-ink-100">Let angar find your AI</h1>
        <p className="text-sm text-ink-400 mt-2">One file is enough. angar finds every AI subscription, what it really costs and where you can save — nothing to type, nothing to remember.</p>
      </div>

      <form action={uploadSpendAction} className="rounded-xl border border-line bg-panel p-6 flex flex-col gap-4">
        <input type="hidden" name="back" value="/onboarding" />
        <div>
          <h2 className="text-base font-semibold text-ink-100">Drop a bank or card statement</h2>
          <p className="text-sm text-ink-400 mt-0.5">CSV or Excel from your bank, or your e-invoices (FatturaPA, Peppol/UBL, XRechnung, ZUGFeRD, Factur-X) as XML, PDF or zip from the accountant. Only AI charges are kept.</p>
        </div>
        <CsvDropzone accept=".csv,.txt,.tsv,.xlsx,.xls,.ods,.xml,.p7m,.zip,.pdf" multiple label="Choose files or drag them here" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button className="btn btn-primary">Find my AI</button>
          <a href="/api/spend/sample" className="text-xs text-ink-400 hover:text-ink-100 underline">No file at hand? Download a sample</a>
        </div>
      </form>

      <div>
        <div className="text-xs text-ink-400 uppercase tracking-wide mb-3">Or start from</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Option href="/sources#accounts" title="Company accounts" text="Microsoft 365 or Google Workspace — who uses which AI." />
          <Option href="/connectors" title="An AI provider key" text="Claude, OpenAI, Gemini, Mistral… exact API costs." />
          <Option href="/download" title="The desktop app" text="Which AI is used, and for how long. Never what people type." />
        </div>
        <p className="text-xs text-ink-400 mt-3 leading-relaxed">
          Your workspace starts with employee privacy <span className="text-ink-100">by department</span>: usage is shown only as totals for groups of 5 or more people, with no names. To see it by person, change it in{" "}
          <Link href="/settings?tab=privacy" className="underline hover:text-ink-100">Settings → Privacy</Link> after giving staff the{" "}
          <Link href="/compliance/employee-notice" className="underline hover:text-ink-100">employee notice</Link> (and, where required, a works council agreement).{" "}
          <Link href="/trust" className="underline hover:text-ink-100">How we protect your data</Link>
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-5 py-4">
        <div>
          <div className="text-sm font-medium text-ink-100">Just exploring?</div>
          <div className="text-sm text-ink-400">Load a demo company and see angar with data.</div>
        </div>
        <div className="flex items-center gap-3">
          <form action={loadDemoDataAction}>
            <button className="btn btn-secondary">Load demo data</button>
          </form>
          <Link href="/" className="text-sm text-ink-400 hover:text-ink-100">Skip</Link>
        </div>
      </div>
    </div>
  );
}

function Option({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="rounded-xl border border-line bg-panel p-4 hover:border-ink-400 transition-colors">
      <div className="text-sm font-semibold text-ink-100">{title}</div>
      <div className="text-xs text-ink-400 mt-1">{text}</div>
    </Link>
  );
}

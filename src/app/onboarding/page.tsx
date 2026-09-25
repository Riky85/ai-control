import Link from "next/link";
import FlowSteps from "@/components/FlowSteps";
import { VendorBadge } from "@/components/VendorIcon";
import { connectWithApiKeyAction, importCsvAction } from "@/lib/actions";
import { loadDemoDataAction } from "@/lib/test-data-actions";
import { API_KEY_PROVIDERS } from "@/lib/connectors/api-key-providers";

export const dynamic = "force-dynamic";

const INPUT = "w-full border border-line rounded-lg px-3 py-2.5 text-sm text-ink-100 bg-panel placeholder:text-ink-400 focus:outline-none focus:border-ink-400";

// Passo 1 del percorso guidato: una sola schermata, tre scelte.
export default function ConnectStep({ searchParams }: { searchParams: { error?: string } }) {
  const providers = Object.entries(API_KEY_PROVIDERS).map(([id, cfg]) => ({ id, label: cfg!.label }));
  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-8 py-4">
      <FlowSteps current={1} />
      <div>
        <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink-100">Where does your company use AI?</h1>
        <p className="text-sm text-ink-400 mt-1">Pick one to start — you can add the others later. angar only reads, never changes anything.</p>
      </div>
      {searchParams.error && <div className="rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm">{searchParams.error}</div>}

      <div className="grid grid-cols-3 gap-4">
        <Choice
          title="Paste an AI key"
          text="Claude, ChatGPT, Gemini, Mistral and more. A normal API key is enough."
          icons={["ANTHROPIC", "OPENAI", "GOOGLE_GEMINI"]}
        >
          <form action={connectWithApiKeyAction} className="flex flex-col gap-2">
            <input type="hidden" name="next" value="review" />
            <select name="provider" className={INPUT} defaultValue="ANTHROPIC">
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <input name="apiKey" type="password" required autoComplete="off" placeholder="Paste the API key" className={INPUT} />
            <button className="btn btn-primary w-full">Connect</button>
          </form>
        </Choice>

        <Choice title="Upload a spreadsheet" text="A list of the AI tools you use — works for anything, even tools without an API." icons={[]}>
          <form action={importCsvAction} className="flex flex-col gap-2">
            <input type="hidden" name="next" value="review" />
            <input name="file" type="file" accept=".csv,text/csv" required className="w-full text-sm text-ink-400 file:mr-3 file:rounded-lg file:border file:border-line file:bg-panel file:px-3 file:py-2 file:text-sm file:text-ink-100" />
            <button className="btn btn-primary w-full">Upload</button>
            <a href="/api/csv-template" className="text-xs text-ink-400 hover:text-ink-100 underline text-center">Download the template</a>
          </form>
        </Choice>

        <Choice title="Connect GitHub" text="Finds the AI your developers built into your own products." icons={["GitHub"]}>
          <Link href="/connectors#GITHUB" className="btn btn-secondary w-full mt-auto">Connect GitHub</Link>
          <p className="text-xs text-ink-400 text-center">Takes 2 minutes with a read-only token.</p>
        </Choice>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-dashed border-line px-5 py-4">
        <div>
          <div className="text-sm font-medium text-ink-100">Just exploring?</div>
          <div className="text-sm text-ink-400">Load a demo company and try the whole flow.</div>
        </div>
        <div className="flex items-center gap-3">
          <form action={loadDemoDataAction}>
            <input type="hidden" name="next" value="review" />
            <button className="btn btn-secondary">Load demo data</button>
          </form>
          <Link href="/" className="text-sm text-ink-400 hover:text-ink-100">Skip for now</Link>
        </div>
      </div>
    </div>
  );
}

function Choice({ title, text, icons, children }: { title: string; text: string; icons: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
      <div className="flex -space-x-1.5">
        {icons.length ? (
          icons.map((v) => (
            <span key={v} className="rounded-lg ring-2 ring-panel">
              <VendorBadge vendor={v} size={34} />
            </span>
          ))
        ) : (
          <span className="h-[34px] w-[34px] rounded-lg border border-line flex items-center justify-center text-ink-400">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="2" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><path d="M2.5 6h11M2.5 10h11M6.5 2v12" stroke="currentColor" strokeWidth="1.3" /></svg>
          </span>
        )}
      </div>
      <div className="flex-1">
        <h2 className="text-base font-semibold text-ink-100">{title}</h2>
        <p className="text-sm text-ink-400 mt-1">{text}</p>
      </div>
      {children}
    </div>
  );
}

import { submitRequestAction } from "@/lib/requests/actions";
import { DATA_TYPES } from "@/lib/requests/types";

const label = "eyebrow block mb-1.5";

/**
 * Modulo "Request an AI system": per chiunque nel workspace (anche viewer). Nessun JavaScript:
 * la validazione vera è nel server (requests/types.ts), qui solo i limiti del browser.
 */
export default function RequestForm({ back = "/estate/requests/new", compact = false }: { back?: string; compact?: boolean }) {
  return (
    <form action={submitRequestAction} className="rounded-xl border border-line bg-panel animate-rise">
      <input type="hidden" name="back" value={back} />
      <div className="bg-ink border-b border-line rounded-t-xl px-5 py-3 bar-head flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink-100">Request an AI system</h2>
        <span className="eyebrow">IT decides, you get an email</span>
      </div>
      <div className={`p-5 grid grid-cols-1 ${compact ? "" : "md:grid-cols-2"} gap-x-6 gap-y-5`}>
        <label className="block">
          <span className={label}>Name</span>
          <input name="name" required minLength={2} maxLength={120} placeholder="e.g. Perplexity" className="field w-full" />
        </label>
        <label className="block">
          <span className={label}>Vendor or link (optional)</span>
          <span className="flex gap-2">
            <input name="vendor" maxLength={120} placeholder="Vendor" className="field w-1/2 min-w-0" />
            <input name="url" maxLength={300} placeholder="perplexity.ai" className="field w-1/2 min-w-0" />
          </span>
        </label>
        <label className={`block ${compact ? "" : "md:col-span-2"}`}>
          <span className={label}>What will you use it for?</span>
          <textarea name="purpose" required minLength={10} maxLength={1000} rows={3} placeholder="e.g. Research on competitors and market sizes for the sales team" className="field w-full resize-y" />
        </label>
        <label className="block">
          <span className={label}>Team (optional)</span>
          <input name="team" maxLength={80} placeholder="e.g. Sales" className="field w-full" />
        </label>
        <span className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={label}>Expected users</span>
            <input name="expectedUsers" type="number" min={1} max={100000} step={1} placeholder="5" className="field w-full" />
          </label>
          <label className="block">
            <span className={label}>Cost a month, € (optional)</span>
            <input name="estMonthlyEur" type="number" min={0} step="0.01" placeholder="100" className="field w-full" />
          </label>
        </span>
        <fieldset className={`${compact ? "" : "md:col-span-2"}`}>
          <legend className={label}>Which data will it see?</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-1">
            {DATA_TYPES.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm text-ink-100">
                <input type="checkbox" name="dataTypes" value={d.id} className="accent-accent" />
                {d.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="bg-ink border-t border-line rounded-b-xl px-5 py-3 bar-foot flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-ink-400">Your name and email go with the request.</span>
        <button className="btn btn-primary">Send request</button>
      </div>
    </form>
  );
}

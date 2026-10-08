import Link from "next/link";
import { Switch } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import { setOpportunityStatusAction } from "@/lib/opportunities/actions";
import { CATEGORY_LABEL, type Opportunity } from "@/lib/opportunities/types";

/**
 * "What to do next" della home, in versione semplice: un interruttore, il titolo e quanto vale.
 * Interruttore acceso = "Planned" (stato accepted, scheda In progress di Opportunities);
 * spento = di nuovo da fare. Il dettaglio si apre in /opportunities.
 */
export default function NextActions({ list, total, canEdit }: { list: Opportunity[]; total: number; canEdit: boolean }) {
  if (!list.length) return null;
  return (
    <section className="rounded-xl border border-line bg-panel overflow-hidden animate-rise" aria-labelledby="next-title">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 id="next-title" className="text-sm font-bold text-ink-100">What to do next</h2>
        <Link href="/opportunities" className="eyebrow hover:!text-ink-100 transition-colors">All {total} [→]</Link>
      </div>
      <ul className="divide-y divide-line">
        {list.map((o) => {
          const planned = o.status === "accepted" || o.status === "in_progress";
          return (
            <li key={o.key} className="flex items-center gap-4 px-5 py-3">
              <form action={setOpportunityStatusAction} className="shrink-0 flex">
                <input type="hidden" name="key" value={o.key} />
                <input type="hidden" name="to" value={planned ? "new" : "accepted"} />
                <input type="hidden" name="back" value="/" />
                <Switch on={planned} disabled={!canEdit} aria-label={planned ? `Planned: ${o.title}. Turn off to undo` : `Mark as planned: ${o.title}`} title={planned ? "Planned" : "Mark as planned"} />
              </form>
              <Link href={`/opportunities?open=${encodeURIComponent(o.key)}`} className="flex-1 min-w-0 group">
                <span className={`block text-sm truncate group-hover:underline underline-offset-4 decoration-ink-100/30 ${planned ? "text-ink-400" : "text-ink-100"}`}>{o.title}</span>
                <span className="block text-xs text-ink-400 truncate mt-0.5">
                  {CATEGORY_LABEL[o.category]}
                  {planned ? " · Planned" : ""}
                </span>
              </Link>
              <span className="shrink-0 text-sm tabular text-right whitespace-nowrap">
                {o.savings && o.savings.eur >= 1 ? (
                  <span className={planned ? "text-ink-400" : "text-ink-100"}>
                    {o.savings.kind === "estimated" ? "≈ " : ""}
                    {fmtEur(o.savings.eur)}
                    <span className="text-xs text-ink-400 ml-0.5">/mo</span>
                  </span>
                ) : (
                  <span className="text-ink-400">—</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

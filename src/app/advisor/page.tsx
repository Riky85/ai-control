import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { computeAdvice, type Recommendation } from "@/lib/advisor";
import { PageHeader, StatCard } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";
import { fmtEur } from "@/lib/format";
import { PRICES_AS_OF } from "@/lib/pricing/catalog";

export const dynamic = "force-dynamic";

const CONF: Record<string, { label: string; cls: string }> = {
  HIGH: { label: "Sure", cls: "text-steady bg-steady/10" },
  MEDIUM: { label: "Likely", cls: "text-signal bg-signal/10" },
  LOW: { label: "Worth checking", cls: "text-ink-400 bg-ink-400/10" },
};

export default async function AdvisorPage() {
  const { stack, recommendations, currentEur, recommendedEur, apiEur } = await computeAdvice(currentOrgId());
  const diff = currentEur - recommendedEur;

  if (stack.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="AI Advisor" subtitle="Your ideal AI stack, from how your people really use AI." />
        <div className="rounded-xl border border-dashed border-line p-10 text-center">
          <h2 className="text-lg font-semibold text-ink-100">No paid AI tools yet</h2>
          <p className="text-sm text-ink-400 mt-1 max-w-lg mx-auto">
            angar recommends a standard stack once it knows which AI subscriptions you pay for and who uses them. Add a bank statement or connect your AI providers.
          </p>
          <Link href="/sources" className="btn btn-primary mt-5">Add a source</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="AI Advisor" subtitle="Your ideal AI stack, from how your people really use AI." />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Current AI spend" value={`${fmtEur(currentEur)}/mo`} hint={apiEur > 0 ? `Seat-based tools · APIs (${fmtEur(apiEur)}/mo) not included` : "Seat-based AI tools"} />
        <StatCard label="Recommended stack" value={`${fmtEur(recommendedEur)}/mo`} hint={`${stack.length} tool${stack.length === 1 ? "" : "s"}, seats for active users`} />
        <StatCard
          label={diff >= 0 ? "You would save" : "Extra cost"}
          value={`${fmtEur(Math.abs(diff))}/mo`}
          hint={diff >= 0 ? `${fmtEur(diff * 12)} a year` : "Business plans for everyone who uses AI"}
          tone={diff >= 0 ? "accent" : "signal"}
        />
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink-100">Recommended stack</h2>
          <p className="text-sm text-ink-400">One tool for each job — the one most of your people already use.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {stack.map((s) => (
            <Link key={s.category + s.tool.assetId} href={`/assets/${s.tool.assetId}`} className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4 hover:border-ink-400 transition-colors animate-rise">
              <div className="flex items-center gap-3">
                <VendorBadge vendor={s.tool.vendor ?? ""} name={s.tool.name} size={36} />
                <div className="min-w-0">
                  <div className="text-xs text-ink-400">{s.label}</div>
                  <div className="text-[15px] font-semibold text-ink-100 truncate">{s.tool.name}</div>
                </div>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="text-sm text-ink-400">
                  <div>
                    {s.seats} seat{s.seats === 1 ? "" : "s"}
                    {s.planName ? ` · ${s.planName}` : ""}
                  </div>
                  <div className="text-xs">{s.activeUsers} active in the last 30 days</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-xl font-semibold text-ink-100 tabular">
                    {fmtEur(s.estimatedEur)}
                    <span className="text-sm text-ink-400 font-normal">/mo</span>
                  </div>
                  <div className="text-xs text-ink-400 tabular">today {fmtEur(s.currentEur)}/mo</div>
                </div>
              </div>
              {s.replaces.length > 0 && <div className="text-xs text-ink-400 border-t border-line pt-3">Replaces {s.replaces.join(", ")}</div>}
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-panel overflow-hidden animate-rise">
        {/* Barra grigia in alto: titolo e ordine dei passi. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-ink border-b border-line px-5 py-3 bar-head">
          <h2 className="text-sm font-semibold text-ink-100">How to get there</h2>
          <p className="text-xs text-ink-400">In order: consolidate first, then fix plans, seats and billing.</p>
        </div>
        {recommendations.length === 0 ? (
          <p className="text-sm text-ink-400 p-5">Your stack already matches how people use AI — nothing to change right now.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line">
            {recommendations.map((r, i) => (
              <RecRow key={r.key} r={r} n={i + 1} />
            ))}
          </ol>
        )}
        {/* Barra grigia in basso: da dove vengono le stime. */}
        <p className="bg-ink border-t border-line px-5 py-3 text-xs text-ink-400 bar-foot">Based on usage seen in the last 30 days and today&apos;s list prices ({PRICES_AS_OF}). Estimates — check before changing a plan.</p>
      </section>
    </div>
  );
}

function RecRow({ r, n }: { r: Recommendation; n: number }) {
  const c = CONF[r.confidence];
  return (
    <li className="p-5 flex items-center gap-5">
      <span className="h-7 w-7 shrink-0 rounded-full bg-ink text-sm text-ink-400 flex items-center justify-center tabular">{n}</span>
      <div className="flex -space-x-2 shrink-0">
        {r.assets.slice(0, 3).map((a) => (
          <span key={a.id} className="rounded-lg ring-2 ring-panel">
            <VendorBadge vendor={a.vendor ?? ""} name={a.name} size={32} />
          </span>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold text-ink-100">{r.title}</h3>
          <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${c.cls}`}>{c.label}</span>
        </div>
        <p className="text-sm text-ink-400 mt-0.5">{r.why}</p>
      </div>
      <div className="text-right shrink-0">
        {r.monthlySaving >= 0 ? (
          <>
            <div className="font-display text-xl font-semibold text-ink-100 tabular">
              {fmtEur(r.monthlySaving)}
              <span className="text-sm text-ink-400 font-normal">/mo</span>
            </div>
            <div className="text-xs text-ink-400 tabular">{fmtEur(r.monthlySaving * 12)} a year</div>
          </>
        ) : (
          <>
            <div className="font-display text-xl font-semibold text-signal tabular">
              +{fmtEur(-r.monthlySaving)}
              <span className="text-sm text-ink-400 font-normal">/mo</span>
            </div>
            <div className="text-xs text-ink-400">for control</div>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {r.manageUrl && (
          <a href={r.manageUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" title="Open the provider's billing page">
            Billing ↗
          </a>
        )}
        <Link href={r.href} className="btn btn-secondary btn-sm">Open</Link>
      </div>
    </li>
  );
}

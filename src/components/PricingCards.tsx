import { PLANS, GUARANTEE } from "@/lib/plans";
import { startCheckoutAction, switchToFreeAction } from "@/lib/workspace-actions";
import type { Plan } from "@prisma/client";

const ORDER: Plan[] = ["FREE", "STARTER", "GROWTH", "SCALE", "ENTERPRISE"];

/** Piani affiancati: pagina pubblica (/pricing) e area abbonamento. */
export default function PricingCards({ mode, current, payments, salesEmail }: { mode: "public" | "billing"; current?: Plan; payments?: boolean; salesEmail?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-5 gap-3">
        {PLANS.map((p) => {
          const isCurrent = mode === "billing" && p.id === current;
          const upgrade = current ? ORDER.indexOf(p.id) > ORDER.indexOf(current) : true;
          const highlight = p.id === "GROWTH";
          return (
            <div key={p.id} className={`rounded-xl border bg-panel p-5 flex flex-col gap-4 ${highlight ? "border-accent/60" : "border-line"}`}>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-ink-100">{p.name}</h3>
                  {highlight && <span className="text-[11px] font-medium text-accent bg-accent-soft rounded-full px-2 py-0.5 whitespace-nowrap">Most popular</span>}
                </div>
                <p className="text-xs text-ink-400 mt-1">{p.employees}</p>
              </div>
              <div className="font-display text-ink-100">
                {p.price === null ? (
                  <span className="text-[26px] font-semibold tracking-tight">Custom</span>
                ) : (
                  <>
                    <span className="text-[26px] font-semibold tracking-tight tabular">€{p.price}</span>
                    <span className="text-sm text-ink-400"> / month</span>
                  </>
                )}
              </div>
              <p className="text-sm text-ink-400 -mt-2">{p.tagline}</p>
              <ul className="flex flex-col gap-2 text-sm text-ink-100 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5 text-accent" aria-hidden>
                      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              {mode === "public" ? (
                p.price === null ? (
                  <a href={`mailto:${salesEmail ?? ""}?subject=${encodeURIComponent("angar Enterprise")}`} className="btn btn-secondary w-full">Contact sales</a>
                ) : (
                  <a href="/signup" className={`btn w-full ${highlight ? "btn-primary" : "btn-secondary"}`}>{p.price === 0 ? "Start free" : "Start 14-day trial"}</a>
                )
              ) : isCurrent ? (
                <div className="btn btn-secondary w-full opacity-60 cursor-default">Current plan</div>
              ) : p.price === null ? (
                <a href={`mailto:${salesEmail ?? ""}?subject=${encodeURIComponent("angar Enterprise")}`} className="btn btn-secondary w-full">Contact sales</a>
              ) : p.price === 0 ? (
                <form action={switchToFreeAction}>
                  <button className="btn btn-secondary w-full">Switch to Free</button>
                </form>
              ) : (
                <form action={startCheckoutAction}>
                  <input type="hidden" name="plan" value={p.id} />
                  <button disabled={!payments} className={`btn w-full ${upgrade ? "btn-primary" : "btn-secondary"} disabled:opacity-50 disabled:cursor-not-allowed`}>
                    {upgrade ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
      <div className="rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-100 flex items-center gap-3">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="text-steady shrink-0" aria-hidden>
          <path d="M8 1.5l5 2v4c0 3.2-2.2 5.6-5 7-2.8-1.4-5-3.8-5-7v-4l5-2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M5.5 8l1.8 1.8L10.8 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span><b>Savings guarantee.</b> {GUARANTEE} Prices exclude VAT.</span>
      </div>
    </div>
  );
}

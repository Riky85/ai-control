import { PLANS, GUARANTEE, ADDONS, EDGE, ANNUAL_DISCOUNT_PCT, TRIAL_DAYS, TRIAL_PLAN, annualMonthly, planRank, type PlanDef } from "@/lib/plans";
import { startCheckoutAction, startAddonCheckoutAction, switchToFreeAction } from "@/lib/workspace-actions";
import type { Plan } from "@prisma/client";
import { Tabs } from "@/components/ui";

export interface BillingPlanView {
  planId: Plan;
  effectivePlan: Plan;
  trialing: boolean;
  expired: boolean;
  subscribed: boolean;
  addons: string[];
}

const Check = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5 text-accent" aria-hidden>
    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Price({ p, annual }: { p: PlanDef; annual: boolean }) {
  if (p.price === null) return <span className="text-[26px] font-semibold tracking-tight">Custom</span>;
  const monthly = annual && p.price > 0 ? annualMonthly(p.price) : p.price;
  return (
    <>
      <span className="text-[26px] font-semibold tracking-tight tabular">€{monthly}</span>
      <span className="text-sm text-ink-400"> / month</span>
      {annual && p.price > 0 && <div className="text-xs text-ink-400 mt-0.5">billed yearly (€{(monthly * 12).toLocaleString("en")}) · <s>€{p.price}</s></div>}
    </>
  );
}

/** Mensile / annuale: stesso parametro (?billing=annual) su /pricing e /billing. */
export function BillingToggle({ basePath, annual }: { basePath: string; annual: boolean }) {
  return (
    <Tabs
      active={annual ? "annual" : "monthly"}
      items={[
        { key: "monthly", label: "Monthly", href: basePath },
        { key: "annual", label: `Annual · save ${ANNUAL_DISCOUNT_PCT}%`, href: `${basePath}?billing=annual` },
      ]}
    />
  );
}

/** Piani affiancati: pagina pubblica (/pricing) e area abbonamento. */
export default function PricingCards({
  mode,
  view,
  payments,
  salesEmail,
  annual = false,
}: {
  mode: "public" | "billing";
  view?: BillingPlanView;
  payments?: boolean;
  salesEmail?: string;
  annual?: boolean;
}) {
  const interval = annual ? "year" : "month";
  const cards = PLANS.filter((p) => p.price !== null);
  const enterprise = PLANS.find((p) => p.price === null);
  const salesHref = (subject: string) => `mailto:${salesEmail ?? ""}?subject=${encodeURIComponent(subject)}`;
  // Piano "attuale" per i pulsanti: solo se pagato/attivo, non durante la prova o a prova scaduta.
  const current = view && !view.trialing && !view.expired ? view.planId : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((p) => {
          const isCurrent = mode === "billing" && p.id === current;
          const onTrial = mode === "billing" && view?.trialing && p.id === view.effectivePlan;
          const upgrade = current ? planRank(p.id) > planRank(current) : true;
          const highlight = p.id === "GROWTH";
          return (
            <div key={p.id} className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-ink-100">{p.name}</h3>
                  {onTrial ? (
                    <span className="text-[11px] font-medium text-accent bg-accent-soft rounded-full px-2 py-0.5 whitespace-nowrap">Your trial</span>
                  ) : isCurrent ? (
                    <span className="text-[11px] font-medium text-steady bg-steady/10 rounded-full px-2 py-0.5 whitespace-nowrap">Current</span>
                  ) : (
                    highlight && <span className="text-[11px] text-ink-400 whitespace-nowrap">Most popular</span>
                  )}
                </div>
                <p className="text-xs text-ink-400 mt-1">{p.employees}</p>
              </div>
              <div className="font-display text-ink-100">
                <Price p={p} annual={annual} />
              </div>
              <p className="text-sm text-ink-400 -mt-2">{p.tagline}</p>
              <ul className="flex flex-col gap-2 text-sm text-ink-100 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check />
                    {f}
                  </li>
                ))}
              </ul>
              {mode === "public" ? (
                <a href="/signup" className={`btn w-full ${highlight ? "btn-primary" : "btn-secondary"}`}>{p.price === 0 ? "Start free" : `Start ${TRIAL_DAYS}-day trial`}</a>
              ) : isCurrent ? (
                <div className="btn btn-secondary w-full opacity-60 cursor-default">Current plan</div>
              ) : p.price === 0 ? (
                <form action={switchToFreeAction}>
                  <button className="btn btn-secondary w-full">Switch to Free</button>
                </form>
              ) : (
                <form action={startCheckoutAction}>
                  <input type="hidden" name="plan" value={p.id} />
                  <input type="hidden" name="interval" value={interval} />
                  <button disabled={!payments} className={`btn w-full ${upgrade && (highlight || current) ? "btn-primary" : "btn-secondary"} disabled:opacity-50 disabled:cursor-not-allowed`}>
                    {current ? (upgrade ? `Upgrade to ${p.name}` : `Switch to ${p.name}`) : `Choose ${p.name}`}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      {enterprise && (
        <div className="rounded-xl border border-line bg-panel px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex-1 min-w-[220px]">
            <span className="text-sm font-semibold text-ink-100">{enterprise.name}</span>
            <span className="text-sm text-ink-400"> · {enterprise.employees} · {enterprise.tagline}</span>
            <div className="text-xs text-ink-400 mt-0.5">{enterprise.features.join(" · ")}</div>
          </div>
          {mode === "billing" && current === "ENTERPRISE" ? (
            <span className="text-sm text-steady">Current plan</span>
          ) : (
            <a href={salesHref("angar Enterprise")} className="btn btn-secondary btn-sm">Contact sales</a>
          )}
        </div>
      )}

      <div id="addons" className="grid grid-cols-1 lg:grid-cols-2 gap-3 scroll-mt-6">
        {ADDONS.map((a) => {
          const active = view?.addons.includes(a.id);
          const included = view ? planRank(view.effectivePlan) >= planRank(a.includedFrom) : false;
          const monthly = annual ? annualMonthly(a.price) : a.price;
          return (
            <div key={a.id} className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-ink-100">{a.name}</h3>
                    <span className="text-[11px] font-medium text-ink-400 border border-line rounded-full px-2 py-0.5">Add-on</span>
                  </div>
                  <p className="text-sm text-ink-400 mt-1">{a.tagline} Included in Scale and above.</p>
                </div>
                <div className="font-display text-ink-100 text-right whitespace-nowrap">
                  <span className="text-[22px] font-semibold tracking-tight tabular">€{monthly}</span>
                  <span className="text-sm text-ink-400"> / month</span>
                </div>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-ink-100">
                {a.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check />
                    {f}
                  </li>
                ))}
              </ul>
              {mode === "billing" &&
                (active ? (
                  <div className="text-sm text-steady">Active — manage it from “Invoices & payment method”.</div>
                ) : included ? (
                  <div className="text-sm text-ink-400">Included in your plan.</div>
                ) : (
                  <form action={startAddonCheckoutAction}>
                    <input type="hidden" name="addon" value={a.id} />
                    <input type="hidden" name="interval" value={interval} />
                    <button disabled={!payments} className="btn btn-secondary btn-sm disabled:opacity-50 disabled:cursor-not-allowed">Add {a.name}</button>
                  </form>
                ))}
            </div>
          );
        })}
        <div className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="text-steady shrink-0" aria-hidden>
              <path d="M8 1.5l5 2v4c0 3.2-2.2 5.6-5 7-2.8-1.4-5-3.8-5-7v-4l5-2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M5.5 8l1.8 1.8L10.8 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h3 className="text-base font-semibold text-ink-100">Savings guarantee</h3>
          </div>
          <p className="text-sm text-ink-400">{GUARANTEE}</p>
          <p className="text-sm text-ink-400">
            <b className="text-ink-100">Partners: {EDGE.partnerDiscountPct}% off.</b> MSPs and integrators get {EDGE.partnerDiscountPct}% off every plan and angar Edge device.{" "}
            <a href={salesHref("angar partner programme")} className="text-accent hover:underline">Become a partner</a>
          </p>
        </div>
      </div>
      <p className="text-xs text-ink-400">
        Prices exclude VAT. {mode === "public" ? `Paid plans start with a ${TRIAL_DAYS}-day trial of ${PLANS.find((p) => p.id === TRIAL_PLAN)!.name} — no card needed.` : ""} Annual billing saves {ANNUAL_DISCOUNT_PCT}%.
      </p>
    </div>
  );
}

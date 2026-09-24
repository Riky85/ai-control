import { db } from "@/lib/db";
import { PageHeader, Panel } from "@/components/ui";
import { PLANS, planById } from "@/lib/plans";
import { stripeEnabled } from "@/lib/stripe";
import { startCheckoutAction, openBillingPortalAction } from "@/lib/workspace-actions";

export const dynamic = "force-dynamic";
const ORG_ID = "demo-org";
const ORDER = ["STARTER", "GROWTH", "ENTERPRISE"];

export default async function BillingPage({ searchParams }: { searchParams: { checkout?: string; error?: string } }) {
  const [org, aiSystems, connections, members, sharedDashboards] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: ORG_ID } }),
    db.aiAsset.count({ where: { organizationId: ORG_ID, deletedAt: null } }),
    db.connector.count({ where: { organizationId: ORG_ID, status: "CONNECTED", credentialsEncrypted: { not: null } } }),
    db.workspaceMember.count({ where: { organizationId: ORG_ID } }),
    db.shareLink.count({ where: { organizationId: ORG_ID, revokedAt: null } }),
  ]);
  const current = planById(org.plan);
  const payments = stripeEnabled();
  const salesEmail = process.env.SALES_EMAIL;

  const usage: [string, number, number | null][] = [
    ["AI systems", aiSystems, current.limits.aiSystems],
    ["Connections", connections, current.limits.connections],
    ["Members", members, current.limits.members],
    ["Shared dashboards", sharedDashboards, current.limits.sharedDashboards],
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Plan & billing"
        subtitle="Your subscription, usage and invoices."
        action={
          org.stripeCustomerId ? (
            <form action={openBillingPortalAction}>
              <button className="btn btn-secondary">Invoices & payment method</button>
            </form>
          ) : undefined
        }
      />

      {searchParams.checkout === "success" && (
        <div className="rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-100">Payment received — your plan updates as soon as Stripe confirms it (usually a few seconds).</div>
      )}
      {searchParams.checkout === "cancelled" && <div className="rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-400">Checkout cancelled — nothing was charged.</div>}
      {searchParams.error && <div className="rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm">{searchParams.error}</div>}
      {!payments && (
        <div className="rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-400">
          Payments aren't connected on this deployment yet, so plans can be compared but not purchased.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Panel title={`${current.name} plan`} subtitle={statusLabel(org.planStatus, org.currentPeriodEnd)} className="col-span-3">
          <div className="grid grid-cols-4 gap-6">
            {usage.map(([label, used, limit]) => {
              const pct = limit === null ? 0 : Math.min(100, Math.round((used / limit) * 100));
              return (
                <div key={label}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-ink-400">{label}</span>
                    <span className="text-ink-100 font-semibold tabular">
                      {used}
                      <span className="text-ink-400 font-normal"> / {limit ?? "∞"}</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-ink rounded-full overflow-hidden mt-2">
                    <div
                      className={`h-full rounded-full animate-grow ${pct >= 100 ? "bg-alarm" : pct >= 80 ? "bg-signal" : "bg-ink-100"}`}
                      style={{ width: limit === null ? "4%" : `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {PLANS.map((p) => {
          const isCurrent = p.id === org.plan;
          const upgrade = ORDER.indexOf(p.id) > ORDER.indexOf(org.plan);
          const highlight = p.id === "GROWTH";
          return (
            <div key={p.id} className={`rounded-xl border bg-panel p-6 flex flex-col gap-5 ${highlight ? "border-ink-100" : "border-line"}`}>
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-ink-100">{p.name}</h2>
                  {highlight && <span className="text-[11px] font-medium text-accent-dark bg-accent-soft rounded-full px-2 py-0.5">Most popular</span>}
                </div>
                <p className="text-sm text-ink-400 mt-1">{p.tagline}</p>
              </div>
              <div className="font-display text-ink-100">
                {p.price === null ? (
                  <span className="text-[30px] font-semibold tracking-tight">Custom</span>
                ) : (
                  <>
                    <span className="text-[30px] font-semibold tracking-tight tabular">€{p.price}</span>
                    <span className="text-sm text-ink-400"> / month</span>
                  </>
                )}
              </div>
              <ul className="flex flex-col gap-2 text-sm text-ink-100 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5 text-accent">
                      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <div className="btn btn-secondary opacity-60 cursor-default">Current plan</div>
              ) : p.price === null ? (
                <a href={`mailto:${salesEmail ?? ""}?subject=${encodeURIComponent("Angar Enterprise")}`} className="btn btn-secondary">
                  Contact sales
                </a>
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
      <p className="text-xs text-ink-400">Prices exclude VAT. Payments are processed securely by Stripe — Angar never sees your card details.</p>
    </div>
  );
}

function statusLabel(status: string, periodEnd: Date | null) {
  const s = { active: "Active", trialing: "Trial", past_due: "Payment overdue", canceled: "Canceled", unpaid: "Unpaid" }[status] ?? status;
  return periodEnd ? `${s} · renews ${periodEnd.toLocaleDateString()}` : s;
}

import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import { PageHeader, Panel } from "@/components/ui";
import Badge from "@/components/Badge";
import { PLANS, planById, EDGE } from "@/lib/plans";
import { stripeEnabled } from "@/lib/stripe";
import { startCheckoutAction, openBillingPortalAction, startEdgeCheckoutAction } from "@/lib/workspace-actions";

export const dynamic = "force-dynamic";
const ORDER = ["STARTER", "GROWTH", "ENTERPRISE"];

export default async function BillingPage({ searchParams }: { searchParams: { checkout?: string; error?: string } }) {
  const [org, aiSystems, connections, members, sharedDashboards] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: currentOrgId() } }),
    db.aiAsset.count({ where: { organizationId: currentOrgId(), deletedAt: null } }),
    db.connector.count({ where: { organizationId: currentOrgId(), status: "CONNECTED", credentialsEncrypted: { not: null } } }),
    db.workspaceMember.count({ where: { organizationId: currentOrgId() } }),
    db.shareLink.count({ where: { organizationId: currentOrgId(), revokedAt: null } }),
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
      {searchParams.checkout === "edge" && (
        <div className="rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-100">Edge order received — we'll email tracking details when your devices ship.</div>
      )}
      {searchParams.checkout === "cancelled" && <div className="rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-400">Checkout cancelled — nothing was charged.</div>}
      {searchParams.error && <div className="rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm">{searchParams.error}</div>}
      {!payments && (
        <div className="rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-400">
          Payments aren't connected on this deployment yet, so plans can be compared but not purchased.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Panel
          title={`${current.name} plan`}
          subtitle={org.currentPeriodEnd ? `Renews ${org.currentPeriodEnd.toLocaleDateString()}` : undefined}
          action={<Badge>{org.planStatus}</Badge>}
          className="col-span-3"
        >
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

      <section id="edge" className="rounded-xl border border-line bg-panel p-6 grid grid-cols-3 gap-8 scroll-mt-6">
        <div className="col-span-2 flex gap-6">
          <EdgeDevice />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-ink-100">{EDGE.name}</h2>
              <Badge>EARLY_ACCESS</Badge>
            </div>
            <p className="text-sm text-ink-400 mt-1">{EDGE.tagline}</p>
            <ul className="flex flex-col gap-2 text-sm text-ink-100 mt-4">
              {EDGE.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5 text-accent">
                    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-l border-line pl-8">
          <div className="font-display text-ink-100">
            <span className="text-[30px] font-semibold tracking-tight tabular">€{EDGE.pricePerDevice}</span>
            <span className="text-sm text-ink-400"> / device / month</span>
            <div className="text-xs text-ink-400 mt-1">Any plan · {EDGE.minMonths}-month minimum · shipping included</div>
          </div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-400">Active devices</span>
            <span className="text-ink-100 font-semibold tabular">{org.edgeDevices}</span>
          </div>
          <form action={startEdgeCheckoutAction} className="flex flex-col gap-2 mt-auto">
            <label className="flex items-center justify-between gap-3 border border-line rounded-lg px-3 py-2 text-sm">
              <span className="text-ink-400">Devices</span>
              <input name="quantity" type="number" min={1} max={EDGE.maxSelfServe} defaultValue={1} className="w-16 text-right font-medium text-ink-100 bg-transparent outline-none" />
            </label>
            <button disabled={!payments} className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
              Order Edge devices
            </button>
            <a href={`mailto:${salesEmail ?? ""}?subject=${encodeURIComponent("Angar Edge — more than 20 devices")}`} className="text-xs text-ink-400 hover:text-ink-100 underline text-center">
              More than {EDGE.maxSelfServe} devices? Contact sales
            </a>
          </form>
        </div>
      </section>
      <p className="text-xs text-ink-400">Prices exclude VAT. Payments are processed securely by Stripe — Angar never sees your card details.</p>
    </div>
  );
}

// Illustrazione del dispositivo: un piccolo box con led di stato.
function EdgeDevice() {
  return (
    <svg width="132" height="108" viewBox="0 0 132 108" fill="none" className="shrink-0">
      <rect x="10" y="30" width="112" height="52" rx="12" fill="#141418" />
      <rect x="10" y="30" width="112" height="10" rx="5" fill="#26262C" />
      <circle cx="28" cy="62" r="3.5" fill="#FF7323" />
      <circle cx="41" cy="62" r="3.5" fill="#1F9254" />
      <rect x="62" y="56" width="46" height="12" rx="3" fill="#26262C" />
      <rect x="66" y="59" width="8" height="6" rx="1" fill="#3A3A42" />
      <rect x="78" y="59" width="8" height="6" rx="1" fill="#3A3A42" />
      <rect x="90" y="59" width="8" height="6" rx="1" fill="#3A3A42" />
      <text x="66" y="48" fontSize="8" fill="#8C8C96" fontFamily="var(--font-brand), sans-serif">Angar Edge</text>
      <ellipse cx="66" cy="92" rx="50" ry="4" fill="#141418" opacity="0.08" />
    </svg>
  );
}

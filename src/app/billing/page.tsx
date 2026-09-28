import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import { Notice, PageHeader, Panel } from "@/components/ui";
import Badge from "@/components/Badge";
import { planById, EDGE, addonById } from "@/lib/plans";
import { getPlanState } from "@/lib/plan-gate";
import EdgeBox from "@/components/EdgeBox";
import PricingCards, { BillingToggle } from "@/components/PricingCards";
import { stripeEnabled } from "@/lib/stripe";
import { openBillingPortalAction, startEdgeCheckoutAction } from "@/lib/workspace-actions";

export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: { checkout?: string; error?: string; billing?: string } }) {
  const annual = searchParams.billing === "annual";
  const [state, aiSystems, connections, members, sharedDashboards] = await Promise.all([
    getPlanState(currentOrgId()),
    db.aiAsset.count({ where: { organizationId: currentOrgId(), deletedAt: null } }),
    db.connector.count({ where: { organizationId: currentOrgId(), status: "CONNECTED", credentialsEncrypted: { not: null } } }),
    db.workspaceMember.count({ where: { organizationId: currentOrgId() } }),
    // Come in Workspace: contano solo i link non revocati e non scaduti.
    db.shareLink.count({ where: { organizationId: currentOrgId(), revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
  ]);
  const org = state.org;
  const current = planById(state.effectivePlan);
  const planTitle = state.trialing
    ? `${current.name} trial`
    : state.expired
      ? "Free limits"
      : `${planById(org.plan).name} plan`;
  const planSubtitle = state.trialing
    ? `${state.trialDaysLeft} day${state.trialDaysLeft === 1 ? "" : "s"} left · ends ${fmtDate(state.trialEndsAt)} · then Free limits unless you choose a plan`
    : state.expired
      ? "Your data stays visible; changes beyond the Free limits are locked until you choose a plan."
      : [
          org.currentPeriodEnd ? `Renews ${fmtDate(org.currentPeriodEnd)}` : null,
          org.billingInterval === "year" ? "billed yearly" : org.stripeSubscriptionId ? "billed monthly" : null,
          ...state.addons.map((a) => `+ ${addonById(a)?.name ?? a}`),
        ].filter(Boolean).join(" · ") || undefined;
  const statusLabel = state.trialing ? "trialing" : state.expired ? "expired" : org.planStatus;
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
        <Notice tone="success">Payment received — your plan updates as soon as Stripe confirms it (usually a few seconds).</Notice>
      )}
      {searchParams.checkout === "edge" && (
        <Notice tone="success">Edge order received — we&apos;ll email tracking details when your devices ship.</Notice>
      )}
      {searchParams.checkout === "addon" && (
        <Notice tone="success">Add-on payment received — it switches on as soon as Stripe confirms it.</Notice>
      )}
      {searchParams.checkout === "cancelled" && <Notice>Checkout cancelled — nothing was charged.</Notice>}
      {searchParams.error && <Notice tone="error">{searchParams.error}</Notice>}
      {!payments && (
        <Notice>Payments aren&apos;t connected on this deployment yet, so plans can be compared but not purchased.</Notice>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Panel
          title={planTitle}
          subtitle={planSubtitle}
          action={<Badge>{statusLabel}</Badge>}
          className="col-span-3"
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
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

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-ink-100">{state.trialing || state.expired ? "Choose a plan" : "Plans"}</h2>
        <BillingToggle basePath="/billing" annual={annual} />
      </div>
      <PricingCards
        mode="billing"
        annual={annual}
        view={{ planId: org.plan, effectivePlan: state.effectivePlan, trialing: state.trialing, expired: state.expired, subscribed: Boolean(org.stripeSubscriptionId), addons: state.addons }}
        payments={payments}
        salesEmail={salesEmail}
      />

      <section id="edge" className="rounded-xl border border-line bg-panel p-6 grid grid-cols-1 lg:grid-cols-3 gap-8 scroll-mt-6">
        <div className="lg:col-span-2 flex flex-col sm:flex-row gap-6">
          <Link href="/edge" aria-label="About angar Edge" className="shrink-0 hover:opacity-90 transition-opacity">
            <EdgeBox width={150} />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Link href="/edge" className="text-base font-semibold text-ink-100 hover:underline">{EDGE.name}</Link>
              <Badge>EARLY_ACCESS</Badge>
            </div>
            <p className="text-sm text-ink-400 mt-1">{EDGE.tagline}</p>
            <Link href="/edge" className="inline-block text-sm text-accent hover:underline mt-2">How it works, where it goes, what it sees →</Link>
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

        <div className="flex flex-col gap-4 lg:border-l border-line lg:pl-8">
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
            <a href={`mailto:${salesEmail ?? ""}?subject=${encodeURIComponent(`angar Edge — more than ${EDGE.maxSelfServe} devices`)}`} className="text-xs text-ink-400 hover:text-ink-100 underline text-center">
              More than {EDGE.maxSelfServe} devices? Contact sales
            </a>
          </form>
        </div>
      </section>
      <p className="text-xs text-ink-400">Prices exclude VAT. Payments are processed securely by Stripe — angar never sees your card details.</p>
    </div>
  );
}


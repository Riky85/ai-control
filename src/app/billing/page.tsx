import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import { isOnPrem } from "@/lib/edition";
import { Notice, PageHeader } from "@/components/ui";
import { Row, Section } from "@/components/SettingsRows";
import Badge from "@/components/Badge";
import { planById, EDGE, addonById } from "@/lib/plans";
import { getPlanState } from "@/lib/plan-gate";
import EdgeBox from "@/components/EdgeBox";
import PricingCards, { BillingToggle } from "@/components/PricingCards";
import { stripeEnabled } from "@/lib/stripe";
import { openBillingPortalAction, startEdgeCheckoutAction, requestEdgeDevicesAction } from "@/lib/workspace-actions";
import EdgeOrder from "@/components/EdgeOrder";

export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: { checkout?: string; billing?: string } }) {
  if (isOnPrem()) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Plan & billing" subtitle="angar on-premises" />
        <Section title="Plan">
          <Row title="Everything included" hint="All features on, data stays on your server.">
            <span className="text-sm text-ink-400">Licence and invoices directly with angar</span>
          </Row>
        </Section>
      </div>
    );
  }
  const annual = searchParams.billing === "annual";
  const [state, aiSystems, connections, members, sharedDashboards] = await Promise.all([
    getPlanState(currentOrgId()),
    db.aiAsset.count({ where: { organizationId: currentOrgId(), deletedAt: null } }),
    db.connector.count({ where: { organizationId: currentOrgId(), status: "CONNECTED", credentialsEncrypted: { not: null }, provider: { notIn: ["JIRA", "SERVICENOW"] } } }),
    db.workspaceMember.count({ where: { organizationId: currentOrgId() } }),
    // Come in Workspace: contano solo i link non revocati e non scaduti.
    db.shareLink.count({ where: { organizationId: currentOrgId(), revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
  ]);
  const org = state.org;
  const current = planById(state.effectivePlan);
  const planTitle = state.trialing
    ? `${current.displayName} trial`
    : state.expired
      ? "Free limits"
      : `${planById(org.plan).displayName} plan`;
  const planSubtitle = state.trialing
    ? `${state.trialDaysLeft} day${state.trialDaysLeft === 1 ? "" : "s"} left · ends ${fmtDate(state.trialEndsAt)} · then Free limits`
    : state.expired
      ? "Data stays visible; changes beyond Free limits are locked."
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
      <PageHeader subtitle="Your plan and invoices" title="Plan & billing" />

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
      {!payments && <Notice>Online payments aren&apos;t set up on this deployment — plans can be compared, not bought.</Notice>}

      <Section title="Your plan">
        <Row title={<span className="flex items-center gap-2">{planTitle} <Badge>{statusLabel}</Badge></span>} hint={planSubtitle}>
          {org.stripeCustomerId && (
            <form action={openBillingPortalAction}>
              <button className="btn btn-secondary btn-sm">Invoices & payment method</button>
            </form>
          )}
        </Row>
        {usage.map(([label, used, limit]) => {
          const pct = limit === null ? 0 : Math.min(100, Math.round((used / limit) * 100));
          return (
            <Row key={label} title={label}>
              <div className="flex items-center gap-3 w-full max-w-xs">
                <div className="flex-1 h-1 bg-ink-100/[0.08] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full animate-grow ${pct >= 100 ? "bg-alarm" : pct >= 80 ? "bg-accent" : "bg-ink-100/70"}`}
                    style={{ width: limit === null ? "4%" : `${Math.max(pct, 2)}%` }}
                  />
                </div>
                <span className={`text-[15px] font-light tracking-[-0.02em] tabular whitespace-nowrap min-w-[4rem] text-right ${pct >= 80 ? "text-accent" : "text-ink-100"}`}>
                  {used}
                  <span className="text-xs tracking-normal text-ink-400"> / {limit ?? "∞"}</span>
                </span>
              </div>
            </Row>
          );
        })}
      </Section>

      {/* Titolo sopra le card dei piani, senza fascia grigia */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-1">
        <h2 className="text-sm font-bold text-ink-100">{state.trialing || state.expired ? "Choose a plan" : "Plans"}</h2>
        <BillingToggle basePath="/billing" annual={annual} />
      </div>
      <PricingCards
        mode="billing"
        annual={annual}
        view={{ planId: org.plan, effectivePlan: state.effectivePlan, trialing: state.trialing, expired: state.expired, subscribed: Boolean(org.stripeSubscriptionId), addons: state.addons }}
        payments={payments}
        salesEmail={salesEmail}
      />

      <Section id="edge" title="Hardware">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6 md:gap-8 px-5 py-5">
          <div className="flex flex-col sm:flex-row gap-5 min-w-0">
            <Link href="/edge" aria-label="About angar Edge" className="shrink-0 self-start hover:opacity-90 transition-opacity">
              <EdgeBox width={120} />
            </Link>
            <div className="min-w-0 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Link href="/edge" className="text-sm font-semibold text-ink-100 hover:underline">{EDGE.name}</Link>
                <Badge>EARLY_ACCESS</Badge>
              </div>
              <p className="text-xs text-ink-400">{EDGE.tagline}</p>
              <div className="font-display text-ink-100">
                <span className="text-[22px] font-light tracking-[-0.03em] tabular">€{EDGE.pricePerDevice}</span>
                <span className="text-sm text-ink-400"> a month for each device</span>
              </div>
              <div className="eyebrow">Any plan · {EDGE.minMonths}-month minimum · shipping included · {org.edgeDevices} active</div>
              <Link href="/edge" className="text-xs text-ink-400 hover:text-ink-100 underline self-start">How it works</Link>
            </div>
          </div>
          <div className="flex flex-col gap-2 md:border-l border-line md:pl-8">
            <EdgeOrder price={EDGE.pricePerDevice} max={EDGE.maxSelfServe} payments={payments && !!process.env[EDGE.stripePriceEnv]} checkoutAction={startEdgeCheckoutAction} requestAction={requestEdgeDevicesAction} />
            {salesEmail && (
              <a href={`mailto:${salesEmail}?subject=${encodeURIComponent(`angar Edge — more than ${EDGE.maxSelfServe} devices`)}`} className="text-xs text-ink-400 hover:text-ink-100 underline text-center">
                More than {EDGE.maxSelfServe} devices? Contact sales
              </a>
            )}
          </div>
        </div>
      </Section>
      <p className="text-xs text-ink-400 px-1">Payments by Stripe — angar never sees your card details.</p>
    </div>
  );
}

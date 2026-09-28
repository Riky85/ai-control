import { db } from "@/lib/db";
import { verifyStripeSignature } from "@/lib/stripe";
import { PLANS, ADDONS } from "@/lib/plans";
import type { Plan } from "@prisma/client";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Stripe → angar: aggiorna piano e stato dell'abbonamento. Richiede
// STRIPE_WEBHOOK_SECRET; senza firma valida la richiesta viene rifiutata.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const payload = await req.text();
  if (!secret || !verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return new Response("invalid signature", { status: 400 });
  }
  const event = JSON.parse(payload);
  const obj = event.data?.object ?? {};

  // Prezzi mensili e annuali (STRIPE_PRICE_<PLAN> / STRIPE_PRICE_<PLAN>_ANNUAL).
  const priceIs = (env: string | undefined, priceId?: string) => Boolean(env && priceId && process.env[env] === priceId);
  const planFromPrice = (priceId?: string): Plan | undefined =>
    PLANS.find((p) => priceIs(p.stripePriceEnv, priceId) || priceIs(p.stripeAnnualPriceEnv, priceId))?.id;
  const addonFromPrice = (priceId?: string) =>
    ADDONS.find((a) => priceIs(a.stripePriceEnv, priceId) || priceIs(a.stripeAnnualPriceEnv, priceId))?.id;
  const intervalOf = (sub: any): string | undefined => sub?.items?.data?.[0]?.price?.recurring?.interval ?? undefined;

  if (event.type === "checkout.session.completed") {
    const orgId = obj.metadata?.organizationId ?? obj.client_reference_id;
    if (orgId && obj.metadata?.kind === "addon") {
      const addon = ADDONS.find((a) => a.id === obj.metadata?.addon)?.id;
      const org = await db.organization.findUnique({ where: { id: orgId }, select: { addons: true } });
      if (org && addon) {
        await db.organization.update({
          where: { id: orgId },
          data: {
            stripeCustomerId: obj.customer ?? undefined,
            stripeAddonSubscriptionId: obj.subscription ?? undefined,
            addons: Array.from(new Set([...org.addons, addon])),
          },
        });
      }
    } else if (orgId && obj.metadata?.kind === "edge") {
      // La quantità definitiva arriva con customer.subscription.updated.
      await db.organization.update({
        where: { id: orgId },
        data: { stripeCustomerId: obj.customer ?? undefined, stripeEdgeSubscriptionId: obj.subscription ?? undefined },
      });
    } else if (orgId) {
      await db.organization.update({
        where: { id: orgId },
        data: {
          stripeCustomerId: obj.customer ?? undefined,
          stripeSubscriptionId: obj.subscription ?? undefined,
          plan: PLANS.some((p) => p.id === obj.metadata?.plan) ? (obj.metadata.plan as Plan) : undefined,
          planStatus: "active",
          billingInterval: obj.metadata?.interval === "year" ? "year" : "month",
        },
      });
    }
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    // Prima l'organizzazione nei metadati dell'abbonamento (può arrivare prima del checkout.session.completed), poi il cliente.
    const byMeta = obj.metadata?.organizationId ? await db.organization.findUnique({ where: { id: String(obj.metadata.organizationId) } }) : null;
    const org = byMeta ?? (obj.customer ? await db.organization.findFirst({ where: { stripeCustomerId: obj.customer } }) : null);
    const isEdge = obj.metadata?.kind === "edge" || (org && obj.id === org.stripeEdgeSubscriptionId);
    const addonId = obj.metadata?.kind === "addon" || (org && obj.id === org.stripeAddonSubscriptionId)
      ? (ADDONS.find((a) => a.id === obj.metadata?.addon)?.id ?? addonFromPrice(obj.items?.data?.[0]?.price?.id))
      : undefined;
    if (org && addonId) {
      const ended = event.type === "customer.subscription.deleted" || ["canceled", "unpaid", "incomplete_expired"].includes(obj.status);
      await db.organization.update({
        where: { id: org.id },
        data: {
          stripeCustomerId: org.stripeCustomerId ?? obj.customer ?? undefined,
          stripeAddonSubscriptionId: ended ? null : obj.id,
          addons: ended ? org.addons.filter((a) => a !== addonId) : Array.from(new Set([...org.addons, addonId])),
        },
      });
    } else if (org && isEdge) {
      const deleted = event.type === "customer.subscription.deleted" || obj.status === "canceled";
      await db.organization.update({
        where: { id: org.id },
        data: {
          stripeEdgeSubscriptionId: deleted ? null : obj.id,
          edgeDevices: deleted ? 0 : Number(obj.items?.data?.[0]?.quantity ?? 0),
        },
      });
    } else if (org && org.stripeSubscriptionId && org.stripeSubscriptionId !== obj.id) {
      // Evento di un abbonamento precedente (già sostituito): non tocca il piano attuale.
    } else if (org) {
      const deleted = event.type === "customer.subscription.deleted";
      const periodEnd = obj.current_period_end ?? obj.items?.data?.[0]?.current_period_end;
      await db.organization.update({
        where: { id: org.id },
        data: {
          planStatus: deleted ? "canceled" : obj.status,
          plan: deleted ? "FREE" : planFromPrice(obj.items?.data?.[0]?.price?.id) ?? undefined,
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined,
          stripeSubscriptionId: deleted ? null : obj.id,
          stripeCustomerId: org.stripeCustomerId ?? obj.customer ?? undefined,
          ...(!deleted && intervalOf(obj) ? { billingInterval: intervalOf(obj) } : {}),
        },
      });
    }
  }

  await audit(`billing.${event.type}`, obj.id, { status: obj.status, plan: obj.metadata?.plan, kind: obj.metadata?.kind, addon: obj.metadata?.addon }, { orgId: obj.metadata?.organizationId ?? null, actorEmail: "stripe" });
  return new Response("ok");
}

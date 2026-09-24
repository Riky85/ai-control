import { db } from "@/lib/db";
import { verifyStripeSignature } from "@/lib/stripe";
import { PLANS } from "@/lib/plans";
import type { Plan } from "@prisma/client";

// Stripe → Angar: aggiorna piano e stato dell'abbonamento. Richiede
// STRIPE_WEBHOOK_SECRET; senza firma valida la richiesta viene rifiutata.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const payload = await req.text();
  if (!secret || !verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return new Response("invalid signature", { status: 400 });
  }
  const event = JSON.parse(payload);
  const obj = event.data?.object ?? {};

  const planFromPrice = (priceId?: string): Plan | undefined =>
    PLANS.find((p) => p.stripePriceEnv && process.env[p.stripePriceEnv] === priceId)?.id;

  if (event.type === "checkout.session.completed") {
    const orgId = obj.metadata?.organizationId ?? obj.client_reference_id;
    if (orgId && obj.metadata?.kind === "edge") {
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
          plan: (obj.metadata?.plan as Plan) ?? undefined,
          planStatus: "active",
        },
      });
    }
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const org = await db.organization.findFirst({ where: { stripeCustomerId: obj.customer } });
    const isEdge = obj.metadata?.kind === "edge" || (org && obj.id === org.stripeEdgeSubscriptionId);
    if (org && isEdge) {
      const deleted = event.type === "customer.subscription.deleted" || obj.status === "canceled";
      await db.organization.update({
        where: { id: org.id },
        data: {
          stripeEdgeSubscriptionId: deleted ? null : obj.id,
          edgeDevices: deleted ? 0 : Number(obj.items?.data?.[0]?.quantity ?? 0),
        },
      });
    } else if (org) {
      const deleted = event.type === "customer.subscription.deleted";
      await db.organization.update({
        where: { id: org.id },
        data: {
          planStatus: deleted ? "canceled" : obj.status,
          plan: deleted ? "STARTER" : planFromPrice(obj.items?.data?.[0]?.price?.id) ?? undefined,
          currentPeriodEnd: obj.current_period_end ? new Date(obj.current_period_end * 1000) : undefined,
          stripeSubscriptionId: deleted ? null : obj.id,
        },
      });
    }
  }

  return new Response("ok");
}

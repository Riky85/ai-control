import type { Plan } from "@prisma/client";

/**
 * I tre piani di abbonamento. Prezzi e limiti sono una proposta iniziale:
 * si cambiano solo qui. `null` = illimitato. Gli ID prezzo Stripe arrivano
 * da variabili d'ambiente (STRIPE_PRICE_STARTER / STRIPE_PRICE_GROWTH).
 */
export interface PlanDef {
  id: Plan;
  name: string;
  price: number | null; // €/mese, null = su richiesta
  tagline: string;
  limits: { aiSystems: number | null; connections: number | null; members: number | null; sharedDashboards: number | null };
  features: string[];
  stripePriceEnv?: string;
}

export const PLANS: PlanDef[] = [
  {
    id: "STARTER",
    name: "Starter",
    price: 49,
    tagline: "See what AI your company uses.",
    limits: { aiSystems: 25, connections: 3, members: 3, sharedDashboards: 1 },
    features: ["Up to 25 AI systems", "3 connections", "3 workspace members", "AI Passports & estate map", "CSV import", "1 shared dashboard"],
    stripePriceEnv: "STRIPE_PRICE_STARTER",
  },
  {
    id: "GROWTH",
    name: "Growth",
    price: 199,
    tagline: "Understand costs, changes and alternatives.",
    limits: { aiSystems: 250, connections: null, members: 15, sharedDashboards: null },
    features: ["Up to 250 AI systems", "Unlimited connections", "15 workspace members", "Savings & alternatives", "Change history", "Unlimited shared dashboards"],
    stripePriceEnv: "STRIPE_PRICE_GROWTH",
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    price: null,
    tagline: "For large AI estates and regulated teams.",
    limits: { aiSystems: null, connections: null, members: null, sharedDashboards: null },
    features: ["Unlimited AI systems", "Unlimited members", "Governance & evidence exports", "Priority support", "Custom contract & invoicing", "SSO (on the roadmap)"],
  },
];

export const planById = (id: Plan) => PLANS.find((p) => p.id === id)!;

export function withinLimit(limit: number | null, used: number) {
  return limit === null || used < limit;
}

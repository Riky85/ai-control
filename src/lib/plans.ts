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
  limits: { aiSystems: number | null; connections: number | null; members: number | null; sharedDashboards: number | null; workspaces: number | null };
  features: string[];
  stripePriceEnv?: string;
}

export const PLANS: PlanDef[] = [
  {
    id: "STARTER",
    name: "Starter",
    price: 49,
    tagline: "Every AI you pay for, and what it costs.",
    limits: { aiSystems: 25, connections: 3, members: 3, sharedDashboards: 1, workspaces: 1 },
    features: ["Up to 25 AI systems", "Bank statements & e-invoices", "Automatic savings", "Monthly report", "3 connections", "3 members"],
    stripePriceEnv: "STRIPE_PRICE_STARTER",
  },
  {
    id: "GROWTH",
    name: "Growth",
    price: 199,
    tagline: "Who uses what, unused seats and shadow AI.",
    limits: { aiSystems: 250, connections: null, members: 15, sharedDashboards: null, workspaces: 3 },
    features: ["Up to 250 AI systems", "Microsoft 365 & Google Workspace", "Unused seats & usage", "Network scans", "Unlimited connections", "15 members, 3 workspaces"],
    stripePriceEnv: "STRIPE_PRICE_GROWTH",
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    price: null,
    tagline: "For large AI estates and regulated teams.",
    limits: { aiSystems: null, connections: null, members: null, sharedDashboards: null, workspaces: null },
    features: ["Unlimited AI systems", "Unlimited members & workspaces", "AI register & evidence exports", "Priority support", "Custom contract & invoicing", "SSO (on the roadmap)"],
  },
];

/**
 * angar Edge — dispositivo fisico in abbonamento, per dispositivo al mese,
 * aggiuntivo a qualunque piano (stesso modello per-device di Exein).
 * Hardware incluso in comodato, sostituzione in caso di guasto.
 */
export const EDGE = {
  name: "angar Edge",
  pricePerDevice: 39,
  minMonths: 12,
  maxSelfServe: 20,
  stripePriceEnv: "STRIPE_PRICE_EDGE",
  tagline: "A small appliance on your network that finds AI no connector can see.",
  features: [
    "Plug-and-play device for your office or plant network",
    "Detects traffic to AI services (ChatGPT, Claude, Gemini, Copilot…) — no content inspected",
    "Finds shadow AI and unmanaged tools automatically",
    "Feeds Your AI, Savings and the monthly report",
    "Hardware included, free replacement if it fails",
  ],
};

export const planById = (id: Plan) => PLANS.find((p) => p.id === id)!;

export function withinLimit(limit: number | null, used: number) {
  return limit === null || used < limit;
}

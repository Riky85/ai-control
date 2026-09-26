import type { Plan } from "@prisma/client";

/**
 * I piani di abbonamento (Free, Starter, Growth, Scale, Enterprise). Prezzi e limiti sono una proposta iniziale:
 * si cambiano solo qui. `null` = illimitato. Gli ID prezzo Stripe arrivano
 * da variabili d'ambiente (STRIPE_PRICE_STARTER / STRIPE_PRICE_GROWTH).
 */
export interface PlanDef {
  id: Plan;
  name: string;
  price: number | null; // €/mese, null = su richiesta
  employees: string;
  tagline: string;
  limits: { aiSystems: number | null; connections: number | null; members: number | null; sharedDashboards: number | null; workspaces: number | null };
  features: string[];
  stripePriceEnv?: string;
}

export const PLANS: PlanDef[] = [
  {
    id: "FREE",
    name: "Free",
    price: 0,
    employees: "Freelancers & 1 person",
    tagline: "See what you pay for AI, forever free.",
    limits: { aiSystems: 5, connections: 1, members: 1, sharedDashboards: 0, workspaces: 1 },
    features: ["Up to 5 AI", "Bank statements & invoices", "Automatic savings", "1 member"],
  },
  {
    id: "STARTER",
    name: "Starter",
    price: 79,
    employees: "Up to 50 employees",
    tagline: "Every AI your company pays for, and where to save.",
    limits: { aiSystems: 30, connections: 3, members: 3, sharedDashboards: 1, workspaces: 1 },
    features: ["Up to 30 AI", "Bank statements & e-invoices", "Automatic savings", "Monthly report", "Renewal alerts", "3 members"],
    stripePriceEnv: "STRIPE_PRICE_STARTER",
  },
  {
    id: "GROWTH",
    name: "Growth",
    price: 249,
    employees: "Up to 250 employees",
    tagline: "Who really uses each AI, unused seats and shadow AI.",
    limits: { aiSystems: 250, connections: null, members: 15, sharedDashboards: null, workspaces: 3 },
    features: ["Everything in Starter", "Microsoft 365 & Google Workspace", "Browser extension: real usage per person", "Unused seats & reminders", "Network scans & angar Edge software", "15 members, 3 workspaces"],
    stripePriceEnv: "STRIPE_PRICE_GROWTH",
  },
  {
    id: "SCALE",
    name: "Scale",
    price: 599,
    employees: "Up to 1,000 employees",
    tagline: "For groups with many teams, sites and AI.",
    limits: { aiSystems: null, connections: null, members: 50, sharedDashboards: null, workspaces: 10 },
    features: ["Everything in Growth", "Unlimited AI", "AI register (AI Act) & evidence exports", "10 workspaces, 50 members", "Priority support"],
    stripePriceEnv: "STRIPE_PRICE_SCALE",
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    price: null,
    employees: "1,000+ employees",
    tagline: "Custom contract, SSO and dedicated support.",
    limits: { aiSystems: null, connections: null, members: null, sharedDashboards: null, workspaces: null },
    features: ["Everything in Scale", "Unlimited members & workspaces", "SSO & custom contract", "Dedicated success manager"],
  },
];

/** Garanzia: se in 90 giorni non troviamo risparmi pari all'abbonamento, rimborso. */
export const GUARANTEE = "If angar doesn't find savings at least equal to your subscription in the first 90 days, we refund you.";

/**
 * angar Edge — dispositivo fisico in abbonamento, per dispositivo al mese,
 * aggiuntivo a qualunque piano (stesso modello per-device di Exein).
 * Hardware incluso in comodato, sostituzione in caso di guasto.
 */
export const EDGE = {
  name: "angar Edge",
  pricePerDevice: 29,
  minMonths: 12,
  maxSelfServe: 20,
  stripePriceEnv: "STRIPE_PRICE_EDGE",
  tagline: "Always-on discovery for a whole network: software for any always-on computer, or a small device on loan.",
  features: [
    "Software (Docker) included in Growth and above — or a pre-configured device on loan",
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

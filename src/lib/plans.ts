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
  /** Prezzo Stripe annuale (~15% di sconto): STRIPE_PRICE_<PLAN>_ANNUAL. */
  stripeAnnualPriceEnv?: string;
}

/** Sconto per il pagamento annuale. */
export const ANNUAL_DISCOUNT_PCT = 15;
/** €/mese equivalente pagando annualmente (arrotondato all'euro). */
export const annualMonthly = (monthly: number) => Math.round(monthly * (100 - ANNUAL_DISCOUNT_PCT) / 100);

/** Giorni di prova (funzioni Growth) per i nuovi workspace. */
export const TRIAL_DAYS = 14;
export const TRIAL_PLAN: Plan = "GROWTH";

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
    stripeAnnualPriceEnv: "STRIPE_PRICE_STARTER_ANNUAL",
  },
  {
    id: "GROWTH",
    name: "Growth",
    price: 249,
    employees: "Up to 250 employees",
    tagline: "Who really uses each AI, unused seats and shadow AI.",
    limits: { aiSystems: 250, connections: null, members: 15, sharedDashboards: null, workspaces: 3 },
    features: ["Everything in Starter", "Microsoft 365 & Google Workspace", "Browser extension: real usage for each person", "Unused seats & reminders", "Network scans & angar Edge software", "AI register export", "15 members, 3 workspaces"],
    stripePriceEnv: "STRIPE_PRICE_GROWTH",
    stripeAnnualPriceEnv: "STRIPE_PRICE_GROWTH_ANNUAL",
  },
  {
    id: "SCALE",
    name: "Scale",
    price: 599,
    employees: "Up to 1,000 employees",
    tagline: "For groups with many teams, sites and AI.",
    limits: { aiSystems: null, connections: null, members: 50, sharedDashboards: null, workspaces: 10 },
    features: ["Everything in Growth", "Unlimited AI", "Compliance add-on included: AI Act evidence pack", "10 workspaces, 50 members", "Priority support"],
    stripePriceEnv: "STRIPE_PRICE_SCALE",
    stripeAnnualPriceEnv: "STRIPE_PRICE_SCALE_ANNUAL",
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
 * angar Edge — sensore di rete. Tre modi: software (Docker/VM/Raspberry Pi,
 * incluso da Growth), log dal cloud (nessuna installazione, incluso da Growth)
 * o dispositivo angar in abbonamento per dispositivo al mese (hardware in
 * comodato, sostituzione in caso di guasto). Prezzi partner/MSP qui sotto.
 */
export const EDGE = {
  name: "angar Edge",
  pricePerDevice: 29,
  minMonths: 12,
  maxSelfServe: 20,
  stripePriceEnv: "STRIPE_PRICE_EDGE",
  /** Da quale piano software e log dal cloud sono inclusi. */
  softwareFromPlan: "GROWTH" as Plan,
  /** Sconto per MSP / integratori sul canone angar e sui dispositivi. */
  partnerDiscountPct: 30,
  /** Per i clienti gestiti da un partner su Growth+ il software Edge resta gratuito. */
  partnerSoftwareFree: true,
  /** Un sensore è online se ha fatto check-in negli ultimi N minuti. */
  onlineMinutes: 15,
  tagline: "Network sensor: sees every AI on the network, blocks the ones you don't approve and finds AI running in the background.",
  features: [
    "Software (Docker, VM, Raspberry Pi) or cloud logs — included in Growth and above",
    "Sees every AI on the network, incl. phones and servers — never content",
    "Blocks non-approved AI and suggests the approved one",
    "Finds invisible AI: scripts and agents calling AI APIs, local models",
    "Privacy modes for works councils; AI Act / NIS2 evidence",
    "angar device: plug & play, hardware and replacement included",
  ],
};

/** Prezzo mensile al partner (sconto MSP applicato). */
export const partnerPrice = (listPrice: number) => Math.round(listPrice * (100 - EDGE.partnerDiscountPct)) / 100;

export const planById = (id: Plan) => PLANS.find((p) => p.id === id)!;

export function withinLimit(limit: number | null, used: number) {
  return limit === null || used < limit;
}

export const PLAN_ORDER: Plan[] = ["FREE", "STARTER", "GROWTH", "SCALE", "ENTERPRISE"];
export const planRank = (id: Plan) => PLAN_ORDER.indexOf(id);

// ── Add-on ──────────────────────────────────────────────────────────────
export type AddonId = "COMPLIANCE";
export interface AddonDef {
  id: AddonId;
  name: string;
  price: number; // €/mese
  tagline: string;
  features: string[];
  stripePriceEnv: string;
  stripeAnnualPriceEnv: string;
  /** Da questo piano l'add-on è già incluso. */
  includedFrom: Plan;
}

export const ADDONS: AddonDef[] = [
  {
    id: "COMPLIANCE",
    name: "Compliance",
    price: 99,
    tagline: "AI Act evidence, on any paid plan.",
    features: ["AI Act evidence pack (PDF & signed JSON)", "Policy acknowledgements", "Vendor risk reviews", "Employee AI notice"],
    stripePriceEnv: "STRIPE_PRICE_COMPLIANCE",
    stripeAnnualPriceEnv: "STRIPE_PRICE_COMPLIANCE_ANNUAL",
    includedFrom: "SCALE",
  },
];
export const addonById = (id: string) => ADDONS.find((a) => a.id === id);

// ── Funzioni per piano ──────────────────────────────────────────────────
/**
 * Matrice delle funzioni: piano minimo e, se c'è, l'add-on che le sblocca
 * anche su piani inferiori. Le funzioni bloccate si mostrano con un
 * lucchetto e un link a /billing, mai nascoste.
 */
export type Feature =
  | "microsoft365"
  | "googleWorkspace"
  | "registerExport"
  | "evidencePack"
  | "complianceExports"
  | "policyAcks"
  | "vendorRisk"
  | "employeeNotice"
  | "edgeSensors"
  | "partnerConsole";

export const FEATURES: Record<Feature, { label: string; minPlan: Plan; addon?: AddonId }> = {
  microsoft365: { label: "Microsoft 365", minPlan: "GROWTH" },
  googleWorkspace: { label: "Google Workspace", minPlan: "GROWTH" },
  registerExport: { label: "AI register export", minPlan: "GROWTH", addon: "COMPLIANCE" },
  evidencePack: { label: "AI Act evidence pack", minPlan: "SCALE", addon: "COMPLIANCE" },
  complianceExports: { label: "Compliance exports", minPlan: "SCALE", addon: "COMPLIANCE" },
  policyAcks: { label: "Policy acknowledgements", minPlan: "SCALE", addon: "COMPLIANCE" },
  vendorRisk: { label: "Vendor risk", minPlan: "SCALE", addon: "COMPLIANCE" },
  employeeNotice: { label: "Employee AI notice", minPlan: "FREE", addon: "COMPLIANCE" },
  edgeSensors: { label: "angar Edge software & cloud logs", minPlan: "GROWTH" },
  partnerConsole: { label: "Partner console", minPlan: "GROWTH" },
};

/** Funzione disponibile con questo piano (effettivo) e questi add-on? */
export function hasFeature(plan: Plan, addons: readonly string[], feature: Feature) {
  const f = FEATURES[feature];
  return planRank(plan) >= planRank(f.minPlan) || (f.addon ? addons.includes(f.addon) : false);
}

/** "Available on Growth" / "Available on Scale or with the Compliance add-on". */
export function featureAvailability(feature: Feature) {
  const f = FEATURES[feature];
  const plan = planById(f.minPlan).name;
  return f.addon ? `Available on ${plan} or with the ${addonById(f.addon)!.name} add-on` : `Available on ${plan}`;
}

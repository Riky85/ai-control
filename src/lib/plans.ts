import type { Plan } from "@prisma/client";

/**
 * I piani di abbonamento. Nomi pubblici: Discover (FREE), Save (GROWTH),
 * Govern (SCALE), Enterprise; Starter resta solo per chi lo ha già acquistato.
 * Gli ID (enum Plan) e le variabili Stripe non cambiano. Prezzi e limiti si
 * cambiano solo qui. `null` = illimitato. Gli ID prezzo Stripe arrivano da
 * variabili d'ambiente (STRIPE_PRICE_STARTER / STRIPE_PRICE_GROWTH / ...).
 */
export interface PlanDef {
  id: Plan;
  /** Nome storico, solo per uso interno (log, email ai venditori). */
  name: string;
  /** Nome mostrato agli utenti: Discover / Save / Govern / Enterprise. */
  displayName: string;
  /** Mostrato su /pricing e tra i piani acquistabili (Starter: solo per chi ce l'ha già). */
  listed: boolean;
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

/** Giorni di prova (funzioni del piano Save) per i nuovi workspace. */
export const TRIAL_DAYS = 14;
export const TRIAL_PLAN: Plan = "GROWTH";

export const PLANS: PlanDef[] = [
  {
    id: "FREE",
    name: "Free",
    displayName: "Discover",
    listed: true,
    price: 0,
    employees: "Freelancers & small teams",
    tagline: "See what you spend on AI, forever free.",
    limits: { aiSystems: 5, connections: 1, members: 1, sharedDashboards: 0, workspaces: 1 },
    features: ["Up to 5 AI", "Bank statements & e-invoices", "Savings suggestions", "1 member"],
  },
  {
    id: "STARTER",
    name: "Starter",
    displayName: "Starter",
    listed: false,
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
    displayName: "Save",
    listed: true,
    price: 249,
    employees: "Up to 250 employees",
    tagline: "Cut what you overpay — savings verified on your next bills.",
    limits: { aiSystems: 250, connections: null, members: 15, sharedDashboards: null, workspaces: 3 },
    features: ["Everything in Discover", "Savings verified on the next bank charges", "Monthly report & renewal alerts", "Microsoft 365 & Google Workspace", "Real usage for each person, unused seats", "Network scans & angar Edge software", "AI register export", "15 members, 3 workspaces"],
    stripePriceEnv: "STRIPE_PRICE_GROWTH",
    stripeAnnualPriceEnv: "STRIPE_PRICE_GROWTH_ANNUAL",
  },
  {
    id: "SCALE",
    name: "Scale",
    displayName: "Govern",
    listed: true,
    price: 599,
    employees: "Up to 1,000 employees",
    tagline: "Policies, AI Act evidence and control across teams and sites.",
    limits: { aiSystems: null, connections: null, members: 50, sharedDashboards: null, workspaces: 10 },
    features: ["Everything in Save", "Unlimited AI", "Compliance included: AI Act evidence pack", "Policies & vendor risk reviews", "10 workspaces, 50 members", "Priority support"],
    stripePriceEnv: "STRIPE_PRICE_SCALE",
    stripeAnnualPriceEnv: "STRIPE_PRICE_SCALE_ANNUAL",
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    displayName: "Enterprise",
    listed: true,
    price: null,
    employees: "1,000+ employees",
    tagline: "Custom contract, SSO and dedicated support.",
    limits: { aiSystems: null, connections: null, members: null, sharedDashboards: null, workspaces: null },
    features: ["Everything in Govern", "Unlimited members & workspaces", "SSO & custom contract", "Dedicated success manager"],
  },
];

/**
 * Success fee opzionale sul piano Save: invece del canone fisso, una quota dei
 * risparmi che angar verifica sugli addebiti successivi. Solo su contratto
 * (si parla con le vendite): il checkout online resta a canone fisso.
 */
export const SUCCESS_FEE = { plan: "GROWTH" as Plan, pct: 20 };

/** Garanzia: se in 90 giorni non troviamo risparmi pari all'abbonamento, rimborso. */
export const GUARANTEE = "If angar doesn't find savings at least equal to your subscription in the first 90 days, we refund you.";

/**
 * angar Edge — sensore di rete. Tre modi: software (Docker/VM/Raspberry Pi,
 * incluso da Save/GROWTH), log dal cloud (nessuna installazione, incluso da Save)
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
    "Software (Docker, VM, Raspberry Pi) or cloud logs — included in Save and above",
    "Sees every AI on the network, incl. phones and servers — never content",
    "Blocks non-approved AI and suggests the approved one",
    "Finds invisible AI: scripts and agents calling AI APIs, local models",
    "Privacy modes for works councils; AI Act / NIS2 evidence",
    "angar device: plug & play, hardware and replacement included",
  ],
};

/**
 * Programma partner (commercialisti, consulenti fiscali, MSP / IT provider).
 * Sconto licenze uguale a quello di angar Edge; in alternativa una quota
 * ricorrente sui clienti presentati (proposta iniziale, si cambia solo qui).
 */
export const PARTNER = {
  discountPct: EDGE.partnerDiscountPct,
  revenueSharePct: 20,
  /** Report ai clienti con il marchio dello studio: non ancora disponibile. */
  brandedReports: false,
};

/** Prezzo mensile al partner (sconto MSP applicato). */
export const partnerPrice = (listPrice: number) => Math.round(listPrice * (100 - EDGE.partnerDiscountPct)) / 100;

export const planById = (id: Plan) => PLANS.find((p) => p.id === id)!;
/** Nome pubblico del piano ("Save" per GROWTH, "Govern" per SCALE...). */
export const planLabel = (id: Plan) => planById(id).displayName;

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

/** "Available on Save" / "Available on Govern or with the Compliance add-on". */
export function featureAvailability(feature: Feature) {
  const f = FEATURES[feature];
  const plan = planById(f.minPlan).displayName;
  return f.addon ? `Available on ${plan} or with the ${addonById(f.addon)!.name} add-on` : `Available on ${plan}`;
}

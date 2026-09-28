/**
 * Prontezza EU AI Act: suggerimento del livello di rischio con regole
 * semplici e leggibili, e un punteggio 0–100 da controlli verificabili.
 * È una guida, non un parere legale: i casi ad alto rischio vanno confermati.
 */
import type { EuAiActTier, AiAssetType } from "@prisma/client";
import { db } from "@/lib/db";
import { categoryOf } from "@/lib/savings";

const DAY = 86400000;

export const TIER_LABEL: Record<EuAiActTier, string> = {
  UNCLASSIFIED: "Not classified",
  MINIMAL_RISK: "Minimal risk",
  LIMITED_RISK: "Limited risk",
  HIGH_RISK: "High risk",
};

// Ambiti dell'Allegato III (lavoro, credito, biometria, istruzione, assicurazioni…).
const HIGH_RISK_RULES: { re: RegExp; why: string }[] = [
  { re: /\b(hr|human resources|recruit\w*|hiring|hire|cv|cvs|r[ée]sum[ée]s?|candidates?|applicants?|talent|workforce|employee performance)\b/i, why: "employment and HR decisions (Annex III, point 4)" },
  { re: /\b(credit|creditworth\w*|scoring|loan|lending)\b/i, why: "creditworthiness or scoring of people (Annex III, point 5)" },
  { re: /\b(insurance|underwrit\w*)\b/i, why: "life or health insurance pricing (Annex III, point 5)" },
  { re: /\b(biometric\w*|face recognition|facial|emotion\w*)\b/i, why: "biometrics or emotion recognition (Annex III, point 1)" },
  { re: /\b(exams?|education|grading|proctor\w*|admissions?|students?)\b/i, why: "education and exams (Annex III, point 3)" },
];

export interface TierSuggestion {
  tier: EuAiActTier;
  reason: string;
}

/**
 * Livello suggerito. Non assegna mai "vietato": le pratiche proibite vanno
 * individuate da una persona, non da una regola automatica.
 */
export function suggestTier(asset: { name: string; vendor: string | null; serviceId: string | null; type: AiAssetType; model?: string | null; department?: string | null; dataNames?: string[] }): TierSuggestion {
  const text = [asset.name, asset.model ?? "", ...(asset.dataNames ?? [])].join(" ");
  for (const r of HIGH_RISK_RULES) {
    if (r.re.test(text)) return { tier: "HIGH_RISK", reason: `Looks like it's used for ${r.why}.` };
  }
  const cat = categoryOf(asset);
  if (cat === "coding" || cat === "api" || cat === "local") return { tier: "MINIMAL_RISK", reason: "Developer tool or model API — no specific AI Act duties unless built into a high-risk product." };
  if (cat === "assistant" || cat === "search") return { tier: "LIMITED_RISK", reason: "Chatbot people talk to — transparency duties (Art. 50)." };
  if (cat === "media" || cat === "writing") return { tier: "LIMITED_RISK", reason: "Generates content others may see — AI-generated content must be disclosed (Art. 50)." };
  if (cat === "meetings") return { tier: "LIMITED_RISK", reason: "Records and summarises conversations — tell participants AI is used (Art. 50)." };
  if (asset.type === "AI_API" || asset.type === "AI_DEV_TOOL" || asset.type === "MCP_SERVER") return { tier: "MINIMAL_RISK", reason: "Technical component — no specific AI Act duties on its own." };
  return { tier: "LIMITED_RISK", reason: "Interacts with people or generates content — transparency duties (Art. 50)." };
}

// Date aggiornate al Digital Omnibus sull'AI (Reg. (UE) 2026/1744, in vigore dal 27 luglio 2026).
export const AI_ACT_LAST_REVIEW = "2026-09-28";
export const AI_ACT_DATES = [
  { date: new Date("2025-02-02"), title: "Prohibited practices & AI literacy", detail: "Banned AI uses stop; companies must take measures to support their staff's AI literacy (Art. 4–5, as amended by the 2026 Omnibus)." },
  { date: new Date("2025-08-02"), title: "General-purpose AI models", detail: "Obligations for GPAI model providers; governance and penalties apply." },
  { date: new Date("2026-08-02"), title: "Transparency duties", detail: "Tell people when they talk to AI and label AI-generated content (Art. 50). Watermarking grace until 2 Dec 2026 for systems already on the market." },
  { date: new Date("2027-12-02"), title: "High-risk systems (Annex III)", detail: "HR, credit, education, essential services… — postponed by the Digital Omnibus (Reg. 2026/1744)." },
  { date: new Date("2028-08-02"), title: "High-risk in regulated products", detail: "AI that is a safety component of products under EU product law (Annex I) — postponed by the Digital Omnibus." },
];

export function timeline(now = new Date()) {
  return AI_ACT_DATES.map((d) => ({ ...d, inForce: d.date.getTime() <= now.getTime() }));
}

export const LITERACY_EVIDENCE = "ai_literacy";

export interface ReadinessCheck {
  key: string;
  label: string;
  detail: string;
  weight: number;
  fraction: number; // 0..1
  href?: string;
}

export async function loadComplianceAssets(organizationId: string) {
  return db.aiAsset.findMany({
    where: { organizationId, deletedAt: null },
    include: {
      owner: { select: { name: true, email: true } },
      usages: { select: { lastSeenAt: true } },
      dataAccess: { select: { dataAsset: { select: { name: true } } } },
    },
    orderBy: { name: "asc" },
  });
}

export type ComplianceAsset = Awaited<ReturnType<typeof loadComplianceAssets>>[number];

export const suggestionFor = (a: ComplianceAsset) => suggestTier({ ...a, dataNames: a.dataAccess.map((d) => d.dataAsset.name) });

export async function readiness(organizationId: string, now = new Date()) {
  const [assets, literacy] = await Promise.all([
    loadComplianceAssets(organizationId),
    db.evidence.findFirst({ where: { organizationId, type: LITERACY_EVIDENCE }, orderBy: { createdAt: "desc" } }),
  ]);
  const t = now.getTime();
  const total = assets.length;
  const classified = assets.filter((a) => a.euAiActTier !== "UNCLASSIFIED");
  const high = assets.filter((a) => a.euAiActTier === "HIGH_RISK");
  const highOwned = high.filter((a) => a.ownerId);
  const approved = assets.filter((a) => a.status === "APPROVED");
  const approvedOwned = approved.filter((a) => a.ownerId);
  const recent = (d: Date | null | undefined) => !!d && t - d.getTime() < 30 * DAY;
  const unapprovedInUse = assets.filter((a) => a.status === "UNAPPROVED" && (recent(a.lastSeenAt) || a.usages.some((u) => recent(u.lastSeenAt))));
  const highWithData = high.filter((a) => a.dataAccess.length > 0);
  const literacyRecent = literacy && t - literacy.createdAt.getTime() < 365 * DAY ? literacy : null;
  const ratio = (n: number, d: number) => (d === 0 ? 1 : n / d);

  const checks: ReadinessCheck[] = [
    {
      key: "classified",
      label: "Every AI has a risk class",
      detail: total ? `${classified.length} of ${total} AI classified.` : "No AI found yet.",
      weight: 30,
      fraction: ratio(classified.length, total),
    },
    {
      key: "high_owner",
      label: "Every high-risk AI has an owner",
      detail: high.length ? `${highOwned.length} of ${high.length} high-risk AI have an owner.` : "No high-risk AI.",
      weight: 20,
      fraction: ratio(highOwned.length, high.length),
    },
    {
      key: "approved_owner",
      label: "Every allowed AI has an owner",
      detail: approved.length ? `${approvedOwned.length} of ${approved.length} allowed AI have an owner.` : "No allowed AI yet.",
      weight: 15,
      fraction: ratio(approvedOwned.length, approved.length),
      href: "/assets",
    },
    {
      key: "unapproved",
      label: "No blocked AI still in use",
      detail: unapprovedInUse.length ? `${unapprovedInUse.length} AI marked not allowed were used in the last 30 days.` : "Nothing marked not allowed is in use.",
      weight: 15,
      fraction: unapprovedInUse.length ? 0 : 1,
      href: "/review",
    },
    {
      key: "high_data",
      label: "Data declared for high-risk AI",
      detail: high.length ? `${highWithData.length} of ${high.length} high-risk AI list the data they use.` : "No high-risk AI.",
      weight: 10,
      fraction: ratio(highWithData.length, high.length),
    },
    {
      key: "literacy",
      label: "AI literacy training recorded (Art. 4)",
      detail: literacyRecent ? `Last recorded ${literacyRecent.createdAt.toISOString().slice(0, 10)}: ${literacyRecent.summary}` : "No AI literacy training recorded in the last 12 months.",
      weight: 10,
      fraction: literacyRecent ? 1 : 0,
    },
  ];
  const score = Math.round(checks.reduce((s, c) => s + c.weight * c.fraction, 0));

  return {
    score,
    checks,
    assets,
    total,
    classified: classified.length,
    highRisk: high.length,
    missingOwners: assets.filter((a) => !a.ownerId && (a.status === "APPROVED" || a.euAiActTier === "HIGH_RISK")).length,
    literacy: literacyRecent,
  };
}

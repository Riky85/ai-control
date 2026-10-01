/**
 * Classificazione EU AI Act di un'AI: funzione pura, nessuna query.
 * Si basa su tipo dell'asset, categoria del catalogo, uso/reparto e dati
 * collegati. Un "vietato" (Art. 5) non viene mai assegnato in automatico:
 * lo decide una persona con l'override manuale. È una guida, non un parere legale.
 */
import { SERVICE_CATEGORY, type Category } from "@/lib/pricing/catalog";

export const AI_ACT_TIERS = ["prohibited", "high", "limited", "minimal", "gpai"] as const;
export type AiActTier = (typeof AI_ACT_TIERS)[number];
export type AiActRole = "deployer" | "provider";

export const AI_ACT_TIER_LABEL: Record<AiActTier, string> = {
  prohibited: "Prohibited",
  high: "High risk",
  limited: "Limited risk",
  minimal: "Minimal risk",
  gpai: "General-purpose AI",
};

export interface AiActInput {
  type: string;
  name: string;
  vendor?: string | null;
  serviceId?: string | null;
  model?: string | null;
  department?: string | null;
  /** Categoria del catalogo, se già calcolata (savings.categoryOf); altrimenti dedotta da serviceId. */
  category?: Category | null;
  /** Nomi dei dati collegati (AiAssetDataAccess → DataAsset.name). */
  dataNames?: string[];
  /** Classe del vecchio campo enum: un HIGH_RISK messo a mano non si abbassa mai in automatico. */
  euAiActTier?: string | null;
  /** Override manuale (AiAsset.aiActTier / aiActNote). */
  override?: string | null;
  overrideNote?: string | null;
}

export interface AiActResult {
  tier: AiActTier;
  role: AiActRole;
  reasons: string[];
  obligations: string[];
  /** "manual" quando la classe viene dall'override. */
  source: "manual" | "auto";
}

export const isAiActTier = (v: unknown): v is AiActTier => typeof v === "string" && (AI_ACT_TIERS as readonly string[]).includes(v);

// Ambiti dell'Allegato III. L'ordine conta: il primo che corrisponde vince.
const ANNEX_III: { key: string; re: RegExp; why: string }[] = [
  { key: "hr", re: /\b(hr|human resources|people ops|recruit\w*|hiring|hire|cvs?|r[ée]sum[ée]s?|candidates?|applicants?|talent|workforce|employee performance|performance review\w*|payroll)\b/i, why: "employment and HR decisions (Annex III, point 4)" },
  { key: "credit", re: /\b(credit\s*scor\w*|creditworth\w*|loans?|lending|underwrit\w*)\b/i, why: "creditworthiness or insurance pricing of people (Annex III, point 5)" },
  { key: "insurance", re: /\b(life insurance|health insurance)\b/i, why: "life or health insurance pricing (Annex III, point 5)" },
  { key: "biometric", re: /\b(biometric\w*|face recognition|facial recognition|emotion recognition|emotion\w* detect\w*)\b/i, why: "biometrics or emotion recognition (Annex III, point 1)" },
  { key: "education", re: /\b(exams?|grading|proctor\w*|admissions?|students?)\b/i, why: "education and exams (Annex III, point 3)" },
  { key: "services", re: /\b(benefits eligibility|social benefits|emergency call\w*|triage)\b/i, why: "access to essential services (Annex III, point 5)" },
  { key: "infra", re: /\b(scada|grid control|water supply|traffic control)\b/i, why: "critical infrastructure (Annex III, point 2)" },
];

// Reparti il cui uso specifico porta verso l'Allegato III.
const HR_DEPT = /\b(hr|human resources|people|recruit\w*|talent)\b/i;

const LITERACY = "AI literacy for staff (Art. 4)";
const TRANSPARENCY = "Transparency to people (Art. 50)";

/** Classe dell'AI con motivi e obblighi del deployer. */
export function classifyAiAct(a: AiActInput): AiActResult {
  const category = a.category ?? (a.serviceId ? SERVICE_CATEGORY[a.serviceId] ?? null : null);
  // Agente costruito in casa (nessun fornitore, nessun servizio di catalogo): l'azienda ne è il provider.
  const role: AiActRole = a.type === "AI_AGENT" && !a.vendor && !a.serviceId ? "provider" : "deployer";
  const roleReason = role === "provider" ? "Built in-house: your company is its provider, not only a deployer." : null;

  if (isAiActTier(a.override)) {
    const reasons = [a.overrideNote?.trim() ? `Set by hand: ${a.overrideNote.trim()}` : "Set by hand."];
    if (roleReason) reasons.push(roleReason);
    return { tier: a.override, role, reasons, obligations: obligationsFor(a.override, role, null), source: "manual" };
  }

  const text = [a.name, a.model ?? "", ...(a.dataNames ?? [])].join(" ");
  const hit = ANNEX_III.find((r) => r.re.test(text));
  const hrDept = !!a.department && HR_DEPT.test(a.department);

  let tier: AiActTier;
  const reasons: string[] = [];
  let area: string | null = null;

  if (hit) {
    tier = "high";
    area = hit.key;
    reasons.push(`Looks like it's used for ${hit.why}.`);
    if (hit.key === "biometric") reasons.push("Emotion recognition at work or school is banned (Art. 5): check how it's used.");
  } else if (hrDept && !category) {
    // Strumento specifico (fuori dal catalogo) usato dalle Risorse Umane.
    tier = "high";
    area = "hr";
    reasons.push(`Used by ${a.department}: employment and HR decisions (Annex III, point 4).`);
  } else if (a.euAiActTier === "HIGH_RISK") {
    tier = "high";
    reasons.push("Marked high risk in the AI Act class.");
  } else if (category === "assistant" || category === "search") {
    tier = "gpai";
    reasons.push(`General-purpose chatbot${a.vendor ? ` from ${a.vendor}` : ""}: model duties sit with the provider (Art. 53).`);
    reasons.push("People talk to it and it generates content: transparency duties (Art. 50).");
  } else if (category === "api" || category === "local") {
    tier = "gpai";
    reasons.push(category === "local" ? "Runs a general-purpose model on the computer." : "Access to a general-purpose model: what you build on it gets its own class.");
  } else if (category === "coding" || a.type === "AI_DEV_TOOL" || a.type === "MCP_SERVER") {
    tier = "minimal";
    reasons.push(a.type === "MCP_SERVER" ? "Technical connector for AI agents: no specific AI Act duties on its own." : "Developer tool: no specific AI Act duties unless built into a high-risk product.");
  } else if (category === "media" || category === "writing") {
    tier = "limited";
    reasons.push("Generates content others may see: AI-generated content must be disclosed (Art. 50).");
  } else if (category === "meetings") {
    tier = "limited";
    reasons.push("Records and summarises conversations: tell participants AI is used (Art. 50).");
  } else if (a.type === "AI_API") {
    tier = "gpai";
    reasons.push("Model API: what you build on it gets its own class.");
  } else {
    tier = "limited";
    reasons.push("Interacts with people or generates content: transparency duties (Art. 50).");
  }

  // Uno strumento generico usato dalle Risorse Umane non è alto rischio da solo, ma con un avviso.
  if (tier !== "high" && hrDept) reasons.push(`Used by ${a.department}: high risk if it screens, ranks or evaluates people (Annex III, point 4).`);
  if (roleReason) reasons.push(roleReason);

  return { tier, role, reasons, obligations: obligationsFor(tier, role, area), source: "auto" };
}

/** Obblighi brevi del deployer (o del provider, per le AI fatte in casa). */
function obligationsFor(tier: AiActTier, role: AiActRole, area: string | null): string[] {
  if (tier === "prohibited") return ["Stop using it (Art. 5)", LITERACY];
  const out = [LITERACY];
  if (tier === "high") {
    out.push("Use as the provider instructs (Art. 26)", "Human oversight + logs (Art. 26)", "Inform people affected (Art. 26)");
    if (area === "hr") out.push("Inform workers and their representatives (Art. 26)");
    if (area === "credit" || area === "insurance") out.push("Fundamental rights impact assessment (Art. 27)");
    out.push("Data protection impact assessment (GDPR Art. 35)");
    if (role === "provider") out.push("Provider duties: conformity, risk management, registration (Art. 16)");
  }
  if (tier === "limited" || tier === "gpai") out.push(TRANSPARENCY);
  if (tier === "gpai") out.push("Keep the provider's model documentation (Art. 53)");
  return out;
}

/** Classe equivalente nel vecchio campo enum (prontezza, punteggio, export). */
export function toEuAiActTier(t: AiActTier): "HIGH_RISK" | "LIMITED_RISK" | "MINIMAL_RISK" {
  return t === "prohibited" || t === "high" ? "HIGH_RISK" : t === "minimal" ? "MINIMAL_RISK" : "LIMITED_RISK";
}

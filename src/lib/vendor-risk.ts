/**
 * Schede di rischio dei fornitori AI: sede, residenza dei dati nell'UE,
 * addestramento sui dati dei clienti (piani consumer vs business), DPA,
 * certificazioni e sub-responsabili. Catalogo statico e prudente: solo i
 * fornitori principali sono verificati (fonti nei commenti, controllate il
 * 2026-09-28); gli altri sono marcati "unverified — check" e riportano solo la
 * sede. Nessun valore inventato: nel dubbio "unknown".
 */

export type Residency = "yes" | "no" | "enterprise" | "unknown"; // yes = di default / su tutti i piani business
export type Training = "yes" | "no" | "choice" | "unknown"; // yes = di default (opt-out); choice = scelta esplicita della persona

export interface VendorRisk {
  key: string;
  vendor: string;
  hq: string; // paese della sede
  euResidency: Residency;
  residencyNote?: string;
  trainsConsumer: Training;
  trainsBusiness: Training;
  trainingNote?: string;
  dpaUrl?: string;
  certifications: string[]; // "SOC 2", "ISO 27001", "ISO 42001"…
  subprocessorsUrl?: string;
  trustUrl?: string;
  verified: boolean;
  lastReviewed: string; // YYYY-MM-DD
}

const REVIEWED = "2026-09-28";

const V: VendorRisk[] = [
  {
    // https://openai.com/index/expanding-data-residency-access-to-business-customers-worldwide/ (Nov 2025: EU residency for ChatGPT Enterprise/Edu + API)
    // https://openai.com/security-and-privacy/ , https://openai.com/business-data/ , https://trust.openai.com/
    key: "openai",
    vendor: "OpenAI",
    hq: "United States",
    euResidency: "enterprise",
    residencyNote: "ChatGPT Enterprise / Edu and the API (eligible customers). Not ChatGPT Free, Plus or Business.",
    trainsConsumer: "yes",
    trainsBusiness: "no",
    trainingNote: "ChatGPT Free/Plus: “Improve the model for everyone” is on by default. Business, Enterprise and API data are not used for training by default.",
    dpaUrl: "https://openai.com/policies/data-processing-addendum/",
    certifications: ["SOC 2 Type 2", "ISO 27001", "ISO 27017", "ISO 27018", "ISO 27701", "CSA STAR"],
    subprocessorsUrl: "https://openai.com/policies/sub-processor-list/",
    trustUrl: "https://trust.openai.com/",
    verified: true,
    lastReviewed: REVIEWED,
  },
  {
    // https://privacy.claude.com/en/articles/10015870-what-certifications-has-anthropic-obtained (SOC 2 I/II, ISO 27001:2022, ISO 42001:2023)
    // https://www.anthropic.com/news/updates-to-our-consumer-terms (Aug 2025: Free/Pro/Max users choose; Work/API/Gov/Edu excluded)
    // No first-party EU residency (e.g. https://sonomos.ai/blog/claude-eu-data-residency-2026/); EU regions via AWS Bedrock / Google Vertex AI.
    key: "anthropic",
    vendor: "Anthropic",
    hq: "United States",
    euResidency: "no",
    residencyNote: "No EU residency on claude.ai / Anthropic API. EU regions are available through AWS Bedrock or Google Vertex AI.",
    trainsConsumer: "choice",
    trainsBusiness: "no",
    trainingNote: "Claude Free/Pro/Max: each user chooses whether chats are used for training (since Oct 2025). Team, Enterprise and API: never by default.",
    dpaUrl: "https://www.anthropic.com/legal/data-processing-addendum",
    certifications: ["SOC 2 Type 2", "ISO 27001", "ISO 42001"],
    subprocessorsUrl: "https://trust.anthropic.com/",
    trustUrl: "https://trust.anthropic.com/",
    verified: true,
    lastReviewed: REVIEWED,
  },
  {
    // https://workspaceupdates.googleblog.com/2026/06/gemini-app-data-regions-support.html (data regions for the Gemini app: Enterprise Plus, Education Standard/Plus, Frontline Plus)
    // https://workspace.google.com/security/ai-privacy/ (Workspace data not used to train models)
    // https://workspaceupdates.googleblog.com/2024/12/hippa-and-more-iso-certifications-for-the-gemini-app-on-web-and-mobile.html (ISO 42001 incl.)
    key: "google",
    vendor: "Google",
    hq: "United States",
    euResidency: "enterprise",
    residencyNote: "Data regions for Gemini in Workspace Enterprise Plus (and Education Plus/Standard, Frontline Plus). Not personal Google accounts.",
    trainsConsumer: "yes",
    trainsBusiness: "no",
    trainingNote: "Personal Gemini: Gemini Apps Activity is on by default and can be reviewed/used to improve models. Workspace and Google Cloud data are not used for training.",
    dpaUrl: "https://cloud.google.com/terms/data-processing-addendum",
    certifications: ["SOC 2", "ISO 27001", "ISO 42001"],
    subprocessorsUrl: "https://workspace.google.com/terms/subprocessors.html",
    trustUrl: "https://workspace.google.com/security/ai-privacy/",
    verified: true,
    lastReviewed: REVIEWED,
  },
  {
    // https://learn.microsoft.com/en-us/microsoft-365/copilot/microsoft-365-copilot-privacy (no training on prompts/Graph data; EU Data Boundary, Anthropic models excluded; ISO 27001, ISO 42001)
    // https://www.helpnetsecurity.com/2026/05/28/microsoft-365-copilot-iso-42001-certification/
    key: "microsoft",
    vendor: "Microsoft",
    hq: "United States",
    euResidency: "yes",
    residencyNote: "Microsoft 365 Copilot follows the EU Data Boundary for EU tenants (models from Anthropic are excluded). Consumer Copilot is not covered.",
    trainsConsumer: "unknown",
    trainsBusiness: "no",
    trainingNote: "Microsoft 365 Copilot: prompts, responses and Graph data are not used to train foundation models. Consumer Copilot: check the current consumer privacy settings.",
    dpaUrl: "https://www.microsoft.com/licensing/docs/view/Microsoft-Products-and-Services-Data-Protection-Addendum-DPA",
    certifications: ["SOC 2", "ISO 27001", "ISO 42001"],
    subprocessorsUrl: "https://servicetrust.microsoft.com/",
    trustUrl: "https://servicetrust.microsoft.com/",
    verified: true,
    lastReviewed: REVIEWED,
  },
  {
    // https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training (Free/Pro not opted out by default; Enterprise opted out by default)
    // https://trust.mistral.ai/
    key: "mistral",
    vendor: "Mistral",
    hq: "France",
    euResidency: "yes",
    residencyNote: "EU company; hosted in the EU by default.",
    trainsConsumer: "yes",
    trainsBusiness: "choice",
    trainingNote: "Le Chat Free/Pro: used for training unless the user opts out. Team: admins can turn it off. Enterprise: opted out by default. API: opt-out toggle in the admin panel.",
    dpaUrl: "https://legal.mistral.ai/terms/data-processing-addendum",
    certifications: ["SOC 2 Type 2", "ISO 27001"],
    subprocessorsUrl: "https://trust.mistral.ai/",
    trustUrl: "https://trust.mistral.ai/",
    verified: true,
    lastReviewed: REVIEWED,
  },
  {
    // https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html (data stored in the PRC; inputs used to improve services)
    // https://www.euronews.com/2025/01/29/italian-data-privacy-agency-probes-chinas-deepseek-ai-as-eu-tests-gdpr-compliance
    key: "deepseek",
    vendor: "DeepSeek",
    hq: "China",
    euResidency: "no",
    residencyNote: "Data is stored on servers in the People's Republic of China. The Italian Garante ordered a block of the app in Jan 2025.",
    trainsConsumer: "yes",
    trainsBusiness: "unknown",
    trainingNote: "Inputs may be used to improve and train the service. No business tier with contractual no-training commitments found.",
    certifications: [],
    verified: true,
    lastReviewed: REVIEWED,
  },
  {
    // https://www.perplexity.ai/help-center/en/articles/11564572-data-collection-at-perplexity ("AI Data Retention is enabled by default" for Free/Pro/Max; Enterprise never used for training)
    // https://www.perplexity.ai/help-center/en/articles/11187708-data-retention-and-privacy-for-enterprise-organizations-and-users
    key: "perplexity",
    vendor: "Perplexity",
    hq: "United States",
    euResidency: "unknown",
    trainsConsumer: "yes",
    trainsBusiness: "no",
    trainingNote: "Free/Pro/Max: “AI data retention” is on by default (Account → Preferences to turn off). Enterprise data is never used for training.",
    certifications: ["SOC 2 Type 2"],
    trustUrl: "https://trust.perplexity.ai/",
    verified: true,
    lastReviewed: REVIEWED,
  },
  {
    // https://aiprovidertrust.com/offerings/xai-api/ (SOC 2 Type 2 under NDA; no training on API data; residency enterprise-only via sales)
    // https://x.ai/legal/privacy-policy
    key: "xai",
    vendor: "xAI",
    hq: "United States",
    euResidency: "enterprise",
    residencyNote: "Only as an enterprise feature through sales.",
    trainsConsumer: "yes",
    trainsBusiness: "no",
    trainingNote: "Grok consumer apps: conversations can be used for training unless the user opts out. API: not used for training without permission.",
    dpaUrl: "https://x.ai/legal/data-processing-addendum",
    certifications: ["SOC 2 Type 2"],
    trustUrl: "https://trust.x.ai/",
    verified: true,
    lastReviewed: REVIEWED,
  },
  {
    // https://github.blog/changelog/2026-04-13-copilot-data-residency-in-us-eu-and-fedramp-compliance-now-available/ (enterprise/org admins)
    // https://github.blog/changelog/2024-06-03-github-copilot-compliance-soc-2-type-1-report-and-iso-iec-270012013-certification-scope/
    key: "github",
    vendor: "GitHub",
    hq: "United States",
    euResidency: "enterprise",
    residencyNote: "Copilot data residency in the EU for enterprise / organisation accounts (GitHub Enterprise Cloud with data residency).",
    trainsConsumer: "choice",
    trainsBusiness: "no",
    trainingNote: "Copilot Free/Pro: a personal setting controls whether your data is used for product improvement. Copilot Business/Enterprise data is not used for training.",
    dpaUrl: "https://github.com/customer-terms/github-data-protection-agreement",
    certifications: ["SOC 2", "ISO 27001"],
    subprocessorsUrl: "https://docs.github.com/en/site-policy/privacy-policies/github-subprocessors",
    trustUrl: "https://copilot.github.trust.page/",
    verified: true,
    lastReviewed: REVIEWED,
  },
  {
    // https://cursor.com/security (SOC 2 Type II, ISO 27001:2022, ISO 42001:2023; Privacy Mode: "we will not train on your data")
    key: "cursor",
    vendor: "Cursor (Anysphere)",
    hq: "United States",
    euResidency: "no",
    trainsConsumer: "yes",
    trainsBusiness: "no",
    trainingNote: "Individual plans: code may be used unless Privacy Mode is turned on. Teams/Business: Privacy Mode can be enforced by admins.",
    dpaUrl: "https://cursor.com/terms/dpa",
    certifications: ["SOC 2 Type 2", "ISO 27001", "ISO 42001"],
    subprocessorsUrl: "https://trust.cursor.com/",
    trustUrl: "https://trust.cursor.com/",
    verified: true,
    lastReviewed: REVIEWED,
  },
  // Non verificati: solo la sede, il resto va controllato col fornitore.
  ...(
    [
      ["meta", "Meta", "United States"],
      ["cohere", "Cohere", "Canada"],
      ["deepl", "DeepL", "Germany"],
      ["grammarly", "Grammarly", "United States"],
      ["notion", "Notion", "United States"],
      ["otter", "Otter", "United States"],
      ["fireflies", "Fireflies", "United States"],
      ["elevenlabs", "ElevenLabs", "United States"],
      ["midjourney", "Midjourney", "United States"],
      ["huggingface", "Hugging Face", "United States"],
    ] as const
  ).map(([key, vendor, hq]): VendorRisk => ({ key, vendor, hq, euResidency: "unknown", trainsConsumer: "unknown", trainsBusiness: "unknown", certifications: [], verified: false, lastReviewed: REVIEWED })),
];

export const VENDOR_RISKS = V;

// Nomi di fornitori e servizi del catalogo (discovery/catalog.ts) → scheda.
const ALIASES: Record<string, string> = {
  "github / microsoft": "github",
  "github-copilot": "github",
  anysphere: "cursor",
  "azure-openai": "microsoft",
  copilot: "microsoft",
  "mistral ai": "mistral",
  "google deepmind": "google",
  "hugging face": "huggingface",
  "meta ai": "meta",
  "x.ai": "xai",
  grok: "xai",
  learneo: "", // (QuillBot) non in catalogo
};

const norm = (s: string) => s.trim().toLowerCase();

export function vendorRiskFor(a: { vendor?: string | null; serviceId?: string | null }): VendorRisk | null {
  const tries = [a.serviceId, a.vendor].filter(Boolean).map((x) => norm(String(x)));
  for (const t of tries) {
    const alias = ALIASES[t];
    if (alias === "") continue;
    const key = alias ?? t.replace(/\s+/g, "");
    const hit = V.find((v) => v.key === key || norm(v.vendor) === t);
    if (hit) return hit;
  }
  return null;
}

export const RESIDENCY_LABEL: Record<Residency, string> = { yes: "Yes", no: "No", enterprise: "Enterprise plans only", unknown: "Unverified — check" };
export const TRAINING_LABEL: Record<Training, string> = { yes: "Yes, by default", no: "No", choice: "User / admin choice", unknown: "Unverified — check" };

export interface VendorFlag {
  kind: "personal_data_no_eu" | "trains_consumer";
  label: string;
}

/**
 * Segnalazioni per un'AI: dati personali verso un fornitore senza residenza UE,
 * e fornitori che addestrano di default sui dati dei piani consumer (rischio
 * se le persone usano account personali/gratuiti).
 */
export function vendorFlags(risk: VendorRisk | null, a: { type?: string; dataSensitivities?: string[]; paidPlan?: boolean }): VendorFlag[] {
  if (!risk) return [];
  const out: VendorFlag[] = [];
  if (a.dataSensitivities?.includes("PII") && (risk.euResidency === "no" || (risk.euResidency === "enterprise" && !a.paidPlan))) {
    out.push({ kind: "personal_data_no_eu", label: `Personal data + no EU data residency (${risk.vendor}, ${risk.hq})` });
  }
  if (risk.trainsConsumer === "yes" && a.type !== "AI_API" && !a.paidPlan) {
    out.push({ kind: "trains_consumer", label: `Trains on data by default on consumer plans (${risk.vendor}) — make sure people use a business account` });
  }
  return out;
}

/** Colonne "rischio fornitore" per il registro AI (export Excel). */
export function vendorRiskColumns(a: { vendor: string | null; serviceId: string | null }): Record<string, string | null> {
  const r = vendorRiskFor(a);
  return {
    "Vendor HQ": r?.hq ?? null,
    "EU data residency": r ? RESIDENCY_LABEL[r.euResidency] : null,
    "Trains on data (consumer / business)": r ? `${TRAINING_LABEL[r.trainsConsumer]} / ${TRAINING_LABEL[r.trainsBusiness]}` : null,
    "Vendor DPA": r?.dpaUrl ?? null,
    "Vendor certifications": r ? r.certifications.join(", ") || (r.verified ? "None found" : "Unverified — check") : null,
    "Vendor info reviewed": r ? `${r.lastReviewed}${r.verified ? "" : " (unverified)"}` : null,
  };
}

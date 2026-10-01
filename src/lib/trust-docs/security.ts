// Panoramica di sicurezza (misure tecniche e organizzative, art. 32 GDPR), solo inglese.
import { HOSTING, MEASURES, ROADMAP, SUB_PROCESSORS, NEVER_COLLECTED } from "@/lib/trust";
import type { TrustDoc } from "./types";

export function buildSecurityOverview(): TrustDoc {
  return {
    title: "Security overview — technical and organisational measures",
    subtitle: "Article 32 GDPR · angar cloud edition",
    blocks: [
      { p: `angar keeps an inventory of the AI tools a company uses, what they cost and how much they are used. This document describes how the service protects the data entrusted to it. It reflects how the software works today; where a measure depends on the customer's own configuration, it says so.` },
      { h: "1. Scope and hosting" },
      {
        ul: [
          `Application and database run on ${HOSTING.provider}, in the ${HOSTING.region} region (${HOSTING.country}).`,
          "An on-premises edition runs the same software on the customer's own server (Docker Compose); in that case the customer operates the infrastructure and data does not leave its network.",
          "Customer workspaces are logically separated: every query is scoped to the organisation it belongs to.",
        ],
      },
      { h: "2. What is never collected" },
      { ul: NEVER_COLLECTED },
      ...MEASURES.flatMap((g, i) => [{ h: `${i + 3}. ${g.title}` }, { ul: g.items }]),
      { h: `${MEASURES.length + 3}. Incident response` },
      {
        ul: [
          "Security incidents are triaged by the angar team as soon as they are detected.",
          "Customers affected by a personal data breach are notified without undue delay and in any case within 48 hours of angar becoming aware of it, with the information needed for their own notification under Article 33 GDPR.",
          "Affected credentials are revoked and re-issued; the audit log hash chain helps establish what happened.",
        ],
      },
      { h: `${MEASURES.length + 4}. Sub-processors` },
      {
        table: {
          head: ["Sub-processor", "Purpose", "Location", "When"],
          rows: SUB_PROCESSORS.map((s) => [s.name, s.purpose, s.location, s.whenText]),
        },
      },
      { h: `${MEASURES.length + 5}. Certifications and roadmap` },
      { ul: ROADMAP.map((r) => `${r.title} — ${r.status}. ${r.text}`) },
      { p: "Security questions and responsible disclosure: [[security contact email]]." },
    ],
  };
}

// Accordo sul trattamento dei dati (art. 28 GDPR): angar responsabile, cliente titolare. Solo inglese.
import { HOSTING, MEASURES, MIN_GROUP, SUB_PROCESSORS, USAGE_RETENTION_MONTHS } from "@/lib/trust";
import type { TrustDoc } from "./types";

export function buildDpa(): TrustDoc {
  return {
    title: "Data Processing Agreement",
    subtitle: "Under Article 28 of Regulation (EU) 2016/679 (GDPR)",
    blocks: [
      { h: "Parties" },
      {
        ul: [
          "[[Customer legal name]], [[registered address]], [[company / VAT number]] (the \"Customer\", acting as controller); and",
          "[[angar legal entity]], [[registered address]], [[company / VAT number]] (\"angar\", acting as processor).",
        ],
      },
      { p: "This Data Processing Agreement (\"DPA\") forms part of the agreement under which angar provides its service to the Customer (the \"Main Agreement\"). If this DPA and the Main Agreement conflict on the processing of personal data, this DPA prevails." },

      { h: "1. Subject matter and duration" },
      { p: "angar processes personal data on behalf of the Customer to provide the angar service: an inventory of the artificial intelligence tools used in the Customer's organisation, their cost and their use, as described in Annex 1. Processing lasts for the term of the Main Agreement and ends when the data is deleted or returned under section 12." },

      { h: "2. Nature and purpose of the processing" },
      { p: "Collection, storage, aggregation, display and deletion of data, for the following purposes only: managing the cost and licences of AI tools; identifying unapproved AI tools (information security); and supporting the Customer's compliance with Regulation (EU) 2024/1689 (AI Act). The processing is not intended for, and angar does not provide features for, evaluating the performance or productivity of individual workers." },

      { h: "3. Data subjects and categories of personal data" },
      { p: "Data subjects: the Customer's employees and contractors whose use of AI tools is recorded, and the Customer's users of angar." },
      {
        ul: [
          "Identification and organisational data: name, work email, department.",
          "AI tool usage: names of AI tools used, dates and times, minutes of use per day, number of visits or connections.",
          "Device data (desktop app and angar Edge only): computer name, operating system, app version, local IP addresses.",
          "AI charges: date, amount, merchant description and service, taken from bank statements and invoices. Transactions that are not AI charges are not stored.",
          "angar user data: name, work email, role, sign-in records, two-step verification status, audit log of administrator actions.",
        ],
      },
      { p: "angar is not designed to process special categories of personal data (Article 9 GDPR) and does not collect the content of prompts, messages, emails, files or web pages. The Customer will not use the service to submit such data." },

      { h: "4. Customer's instructions" },
      { p: "angar processes personal data only on the Customer's documented instructions, which are this DPA, the Main Agreement and the configuration the Customer chooses in the service (for example the sources it connects and the employee privacy mode). angar will inform the Customer if, in its opinion, an instruction infringes data protection law. The Customer is responsible for the lawfulness of the processing, including informing employees and, where national law requires it, involving workers' representatives before enabling the desktop app or angar Edge." },

      { h: "5. Confidentiality" },
      { p: "angar ensures that everyone authorised to process the personal data is bound by confidentiality and accesses it only to the extent needed to run, support and secure the service." },

      { h: "6. Security of processing" },
      { p: "angar implements the technical and organisational measures in Annex 2, taking into account the state of the art, the cost of implementation and the nature, scope, context and purposes of the processing (Article 32 GDPR). angar may update these measures provided the overall level of protection is not reduced." },

      { h: "7. Privacy by default" },
      { p: `New workspaces start in the "By department" privacy mode: usage is shown only as totals for groups of at least ${MIN_GROUP} people, and usage records are stored under a keyed pseudonym rather than an email. The Customer can switch to the "By person" mode; doing so is the Customer's decision as controller.` },

      { h: "8. Sub-processors" },
      { p: "The Customer gives angar general authorisation to engage the sub-processors listed in Annex 3. angar will announce any intended addition or replacement on its Trust Center at least 30 days in advance, giving the Customer the opportunity to object on reasonable data protection grounds. If the parties cannot resolve an objection, the Customer may terminate the affected part of the service. angar imposes on each sub-processor data protection obligations equivalent to those in this DPA and remains responsible for their performance." },
      { p: "Optional sub-processors in Annex 3 receive data only if the Customer connects or uses the corresponding feature." },

      { h: "9. International transfers" },
      { p: `By default, Customer personal data is stored and processed in the European Union (${HOSTING.provider}, ${HOSTING.region} region, ${HOSTING.country}). Where a sub-processor in Annex 3 processes personal data outside the European Economic Area, the transfer relies on an adequacy decision (including the EU–US Data Privacy Framework for certified recipients) or on the Standard Contractual Clauses adopted by the European Commission, with supplementary measures where necessary.` },

      { h: "10. Assistance to the Customer" },
      {
        ul: [
          "Data subject requests: angar provides tools in the service (export, pseudonymisation of past data, deletion) and, where needed, reasonable assistance to respond to requests under Articles 15–22 GDPR. angar forwards any request it receives directly to the Customer.",
          "Data protection impact assessments and prior consultation (Articles 35–36 GDPR): angar provides the information it holds, including the DPIA template on its Trust Center.",
          "Security and breaches (Articles 32–34 GDPR): as set out in sections 6 and 11.",
        ],
      },

      { h: "11. Personal data breaches" },
      { p: "angar notifies the Customer without undue delay, and in any case within 48 hours of becoming aware of a personal data breach affecting Customer personal data. The notice describes, as far as then known, the nature of the breach, the categories and approximate number of data subjects and records concerned, the likely consequences and the measures taken or proposed. angar supplements the notice as more information becomes available." },

      { h: "12. Deletion and return at the end of the service" },
      { p: `During the term, usage data from the desktop app, browser extension and angar Edge is deleted automatically after ${USAGE_RETENTION_MONTHS} months, and the Customer can export or reset its workspace data at any time. Within 30 days after the end of the Main Agreement, angar deletes all Customer personal data, unless Union or Member State law requires it to be kept. Before that date, the Customer may export its data as spreadsheets (Excel) from the service. Copies in backups are overwritten as backups rotate.` },

      { h: "13. Information and audits" },
      { p: "angar makes available to the Customer the information necessary to demonstrate compliance with Article 28 GDPR, including this DPA, the security overview and, once obtained, its certifications. angar is preparing for ISO/IEC 27001 certification (target 2027) and is not certified today. The Customer, or an independent auditor bound by confidentiality, may audit angar's compliance once a year, or after a personal data breach, with at least 30 days' written notice, during business hours and without disrupting the service. Each party bears its own costs." },

      { h: "14. Liability, term and governing law" },
      { p: "Liability under this DPA is subject to the limitations in the Main Agreement, except where the GDPR provides otherwise. This DPA stays in force as long as angar processes Customer personal data. It is governed by the law of [[Member State]], and the courts of [[city]] have jurisdiction." },

      { h: "Annex 1 — Details of the processing" },
      {
        table: {
          head: ["Item", "Details"],
          rows: [
            ["Controller", "[[Customer legal name]]"],
            ["Processor", "[[angar legal entity]]"],
            ["Purposes", "AI cost and licence management; detection of unapproved AI tools; AI Act inventory and AI literacy"],
            ["Data subjects", "Customer employees and contractors; Customer users of angar"],
            ["Personal data", "Name, work email, department; AI tool names, dates and minutes of use; computer name, OS and local IP (desktop app, angar Edge); AI charges; angar user and audit data"],
            ["Special categories", "None"],
            ["Sources enabled", "[[bank / e-invoices · Microsoft 365 · Google Workspace · AI provider keys · desktop app · browser extension · angar Edge]]"],
            ["Employee privacy mode", `[[By department (default, groups of ${MIN_GROUP}+) · By person · Company totals only]]`],
            ["Retention", `Usage data: ${USAGE_RETENTION_MONTHS} months, then deleted automatically. Other data: for the term of the Main Agreement, then deleted within 30 days.`],
            ["Location", `European Union — ${HOSTING.provider}, ${HOSTING.region} (${HOSTING.country})`],
          ],
        },
      },

      { h: "Annex 2 — Technical and organisational measures" },
      ...MEASURES.flatMap((g) => [{ h3: g.title }, { ul: g.items }]),

      { h: "Annex 3 — Sub-processors" },
      {
        table: {
          head: ["Sub-processor", "Purpose", "Data", "Location", "When"],
          rows: SUB_PROCESSORS.map((s) => [s.name, s.purpose, s.data, s.location, s.whenText]),
        },
      },

      { h: "Signatures" },
      { sign: ["For the Customer (controller)", "For angar (processor)"] },
    ],
  };
}

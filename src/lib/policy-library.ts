/**
 * Libreria di policy pre-costruite — l'equivalente in piccolo del "Policy
 * Manager" con policy seeded di OneTrust. Sono testo leggibile da un
 * umano, non regole valutate da un motore runtime (quello è V4 nella
 * roadmap): servono a dimostrare intento di governance da subito, senza
 * costruire un rule engine che non abbiamo ancora.
 */
export interface PolicyTemplate {
  name: string;
  description: string;
  category: "data_access" | "approval" | "environment" | "vendor";
}

export const POLICY_LIBRARY: PolicyTemplate[] = [
  {
    name: "No unapproved agent in production",
    description: "AI agents cannot remain in Unapproved or Unreviewed status while connected to a production system.",
    category: "environment",
  },
  {
    name: "Owner required for high-risk assets",
    description: "Every AI asset scored High or Critical risk must have an assigned owner within 5 business days of detection.",
    category: "approval",
  },
  {
    name: "No PII to unmanaged AI",
    description: "AI applications without an enterprise/managed connector cannot be granted access to data classified as PII.",
    category: "data_access",
  },
  {
    name: "External email requires approval",
    description: "Agents cannot send external email without a human approval step recorded before the action.",
    category: "approval",
  },
  {
    name: "New AI vendor review",
    description: "Any newly detected AI vendor not already in the registry must be reviewed before being marked Approved.",
    category: "vendor",
  },
  {
    name: "Source code access logging",
    description: "AI dev tools with access to production repositories must have activity logging enabled at all times.",
    category: "data_access",
  },
];

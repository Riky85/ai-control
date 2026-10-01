/**
 * Modalità "solo UE": quando è attiva, nessun dato del cliente lascia l'UE
 * per colpa di angar. Due livelli:
 * - globale (ANGAR_EU_ONLY=1): spegne le risposte AI (Anthropic) per tutti i
 *   workspace e impedisce l'invio email via Resend (serve SMTP_URL);
 * - workspace (Organization.euOnly, Settings → Privacy): spegne le risposte AI
 *   solo per quel workspace. L'email resta una scelta del deployment.
 * Solo codice lato server: niente "use client" qui.
 */
import { isOnPrem } from "@/lib/edition";

/** Modalità solo UE attiva per l'intero deployment. */
export function euOnlyDeployment(): boolean {
  return process.env.ANGAR_EU_ONLY === "1" || process.env.ANGAR_EU_ONLY === "true";
}

/** Email inviata da un server SMTP scelto da chi gestisce il deployment (non Resend). */
export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_URL);
}

/**
 * Le chiamate ad Anthropic sono possibili in assoluto? No senza chiave,
 * sull'edizione on-premises o con la modalità solo UE globale.
 */
export function aiAnswersAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && !isOnPrem() && !euOnlyDeployment();
}

/** Il workspace ha chiesto di tenere le risposte AI nell'UE (Settings → Privacy). */
export async function workspaceEuOnly(orgId: string | null | undefined): Promise<boolean> {
  if (!orgId) return false;
  // Import dinamico: mail.ts usa questo modulo e non deve caricare Prisma.
  const { db } = await import("@/lib/db");
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { euOnly: true } });
  return org?.euOnly === true;
}

/**
 * Si possono mandare dati di questo workspace ad Anthropic? Unico punto di
 * controllo per assistente, comandi e lettura dei contratti.
 */
export async function aiAnswersAllowed(orgId: string | null | undefined): Promise<boolean> {
  if (!aiAnswersAvailable()) return false;
  return !(await workspaceEuOnly(orgId));
}

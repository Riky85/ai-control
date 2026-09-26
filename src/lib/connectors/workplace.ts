import { db } from "@/lib/db";

/**
 * Account aziendali (Microsoft 365, Google Workspace): un amministratore
 * approva una volta l'accesso in sola lettura. Disponibili solo quando
 * angar ha le proprie credenziali OAuth configurate (variabili d'ambiente).
 */
export const msConfigured = () => Boolean(process.env.MS365_CLIENT_ID && process.env.MS365_CLIENT_SECRET);
export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export async function workplaceStatus(organizationId: string) {
  const rows = await db.connector.findMany({
    where: { organizationId, provider: { in: ["MICROSOFT_365", "GOOGLE_WORKSPACE"] }, status: "CONNECTED", credentialsEncrypted: { not: null } },
  });
  const has = (p: string) => rows.some((r) => r.provider === p);
  const providers = [
    { id: "MICROSOFT_365", label: "Microsoft 365 / Entra ID", available: msConfigured(), connected: has("MICROSOFT_365"), connectUrl: "/api/connectors/microsoft/connect" },
    { id: "GOOGLE_WORKSPACE", label: "Google Workspace", available: googleConfigured(), connected: has("GOOGLE_WORKSPACE"), connectUrl: "/api/connectors/google/connect" },
  ];
  return { providers, connected: providers.filter((p) => p.connected).map((p) => p.label) };
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { encryptJson } from "@/lib/crypto";
import { requireFeature } from "@/lib/plan-gate";
import { testCloudflare } from "@/lib/connectors/cloudflare-gateway";
import { testUmbrella } from "@/lib/connectors/cisco-umbrella";
import { syncNetworkLogs, type NetworkLogProvider } from "@/lib/connectors/network-logs";

const back = (provider: NetworkLogProvider, msg: string): never => redirect(`/connectors?error=${encodeURIComponent(msg)}&provider=${provider}#${provider}`);

/** Prova le credenziali, le salva cifrate, poi il primo sync (ultimi 7 giorni). */
async function connect(provider: NetworkLogProvider, creds: Record<string, string>, test: () => Promise<void>) {
  const s = await requireRole("ADMIN", "/connectors");
  await requireFeature("connections", `/connectors#${provider}`, { provider });
  try {
    await test();
  } catch (err) {
    back(provider, (err as Error).message.slice(0, 250));
  }
  await db.connector.upsert({
    where: { organizationId_provider: { organizationId: s.orgId, provider } },
    // Credenziali nuove: si riparte dal cursore iniziale (ultimi 7 giorni).
    update: { credentialsEncrypted: encryptJson(creds), status: "CONNECTED", lastSyncError: null, lastSyncWarnings: [] },
    create: { organizationId: s.orgId, provider, credentialsEncrypted: encryptJson(creds), status: "CONNECTED", scopes: ["network-logs"] },
  });
  await audit("connector.connect", provider);
  const r = await syncNetworkLogs(s.orgId, provider);
  revalidatePath("/", "layout");
  if (!r.ok) back(provider, `Connected, but the first sync failed: ${(r.error ?? "unknown error").slice(0, 200)}`);
  redirect(`/connectors?connected=${provider}#${provider}`);
}

export async function connectCloudflareGatewayAction(formData: FormData) {
  const apiToken = String(formData.get("apiToken") ?? "").trim();
  const accountId = String(formData.get("accountId") ?? "").trim().toLowerCase();
  if (!apiToken) back("CLOUDFLARE_GATEWAY", "Paste an API token first.");
  if (!/^[0-9a-f]{32}$/.test(accountId)) back("CLOUDFLARE_GATEWAY", "The account ID is 32 letters and digits — copy it from the Cloudflare dashboard.");
  await connect("CLOUDFLARE_GATEWAY", { apiToken, accountId }, () => testCloudflare({ apiToken, accountId }));
}

export async function connectCiscoUmbrellaAction(formData: FormData) {
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const apiSecret = String(formData.get("apiSecret") ?? "").trim();
  if (!apiKey || !apiSecret) back("CISCO_UMBRELLA", "Paste both the API key and the secret.");
  await connect("CISCO_UMBRELLA", { apiKey, apiSecret }, () => testUmbrella({ apiKey, apiSecret }));
}

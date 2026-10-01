"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { requireFeature } from "@/lib/plan-gate";
import { encryptJson } from "@/lib/crypto";
import { runConnectorSync } from "./sync";
import { azureToken, validateAzure, type AzureCreds } from "./azure-openai";
import { testAws, validateAws, type AwsCreds } from "./aws-bedrock";
import { googleToken, parseServiceAccount, validateGcp, type GcpCreds } from "./google-vertex";

type CloudProvider = "AZURE_OPENAI" | "AWS_BEDROCK" | "GOOGLE_VERTEX";
const CLOUD: CloudProvider[] = ["AZURE_OPENAI", "AWS_BEDROCK", "GOOGLE_VERTEX"];

/**
 * Collega una piattaforma cloud AI: 1) controllo dei campi, 2) accesso di
 * prova (solo lettura), 3) credenziali salvate cifrate, 4) primo sync.
 * Le credenziali non tornano mai nella pagina.
 */
export async function connectCloudAiAction(formData: FormData) {
  const s = await requireRole("ADMIN", "/connectors");
  const provider = String(formData.get("provider")) as CloudProvider;
  if (!CLOUD.includes(provider)) redirect("/connectors");
  await requireFeature("connections", `/connectors?provider=${provider}#${provider}`, { provider });
  const back = (msg: string): never => redirect(`/connectors?error=${encodeURIComponent(msg)}&provider=${provider}#${provider}`);
  const f = (k: string) => String(formData.get(k) ?? "").trim();
  const deadline = Date.now() + 20_000;

  let creds: AzureCreds | AwsCreds | GcpCreds;
  let failure: string | null = null;
  if (provider === "AZURE_OPENAI") {
    const c: AzureCreds = { tenantId: f("tenantId"), clientId: f("clientId"), clientSecret: f("clientSecret"), subscriptionId: f("subscriptionId") };
    failure = validateAzure(c);
    if (!failure) await azureToken(c, deadline).catch((err) => (failure = (err as Error).message));
    creds = c;
  } else if (provider === "AWS_BEDROCK") {
    const c: AwsCreds = { accessKeyId: f("accessKeyId"), secretAccessKey: f("secretAccessKey") };
    failure = validateAws(c);
    if (!failure) await testAws(c).catch((err) => (failure = (err as Error).message));
    creds = c;
  } else {
    const sa = parseServiceAccount(f("serviceAccount"));
    const c: GcpCreds | null = typeof sa === "string" ? null : { serviceAccount: sa, table: f("table").replace(/`/g, "").replace(/:/, "."), ...(f("location") ? { location: f("location") } : {}) };
    failure = typeof sa === "string" ? sa : validateGcp(c!);
    if (!failure) await googleToken(c!.serviceAccount, deadline).catch((err) => (failure = (err as Error).message));
    creds = c as GcpCreds;
  }
  if (failure) back(failure);

  let encrypted = "";
  try {
    encrypted = encryptJson(creds);
  } catch (err) {
    back((err as Error).message);
  }
  await db.connector.upsert({
    where: { organizationId_provider: { organizationId: s.orgId, provider } },
    update: { credentialsEncrypted: encrypted, status: "CONNECTED", lastSyncError: null, lastSyncedAt: null },
    create: { organizationId: s.orgId, provider, credentialsEncrypted: encrypted, status: "CONNECTED", scopes: ["billing:read"] },
  });
  await audit("connector.connect", provider);
  const result = await runConnectorSync(s.orgId, provider);
  // Collegato da un admin sul proprio account cloud: le AI trovate sono uso ufficiale, con lui come owner.
  const row = await db.connector.findUnique({ where: { organizationId_provider: { organizationId: s.orgId, provider } } });
  if (row && s.email) {
    const owner = await db.user.upsert({ where: { organizationId_email: { organizationId: s.orgId, email: s.email } }, update: {}, create: { organizationId: s.orgId, email: s.email, name: s.name } });
    const pending = await db.aiAsset.findMany({ where: { connectorId: row.id, deletedAt: null, status: { in: ["UNKNOWN", "UNREVIEWED"] } } });
    for (const a of pending) {
      await db.aiAsset.update({ where: { id: a.id }, data: { status: "APPROVED", ownerId: a.ownerId ?? owner.id } });
      await db.assetChange.create({ data: { aiAssetId: a.id, field: "status", oldValue: a.status, newValue: "APPROVED" } });
    }
  }
  revalidatePath("/", "layout");
  if (!result.ok) back(`Saved, but the first sync failed: ${result.error.slice(0, 220)}`);
  redirect(`/connectors?connected=${provider}#${provider}`);
}

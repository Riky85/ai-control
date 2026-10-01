"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { encryptJson } from "@/lib/crypto";
import { requireFeature } from "@/lib/plan-gate";
import { runConnectorSync } from "./sync";
import { normalizeOktaDomain, testOktaConnection, type OktaCredentials } from "./okta";

/**
 * Collegamento Okta (solo admin): 1) dominio controllato, 2) token provato
 * subito con una lettura delle app, 3) solo se funziona si salva cifrato,
 * 4) parte la prima sincronizzazione.
 */
export async function connectOktaAction(formData: FormData) {
  const s = await requireRole("ADMIN", "/connectors");
  await requireFeature("connections", "/connectors#OKTA", { provider: "OKTA" });
  const back = (msg: string) => redirect(`/connectors?error=${encodeURIComponent(msg)}&provider=OKTA#OKTA`);
  const domain = normalizeOktaDomain(String(formData.get("domain") ?? ""));
  const apiToken = String(formData.get("apiToken") ?? "").trim();
  if (!domain) back("Enter your Okta domain, e.g. acme.okta.com.");
  if (!apiToken) back("Paste an Okta API token first.");

  const test = await testOktaConnection(domain!, apiToken);
  if (!test.ok) back(test.error);

  let credentials = "";
  try {
    credentials = encryptJson({ mode: "token", domain: domain!, apiToken } satisfies OktaCredentials);
  } catch (err) {
    back((err as Error).message);
  }
  await db.connector.upsert({
    where: { organizationId_provider: { organizationId: s.orgId, provider: "OKTA" } },
    // Nuovo token o nuovo dominio: si rilegge tutto lo storico di 90 giorni.
    update: { credentialsEncrypted: credentials, status: "CONNECTED", lastSyncError: null, lastSyncedAt: null },
    create: { organizationId: s.orgId, provider: "OKTA", credentialsEncrypted: credentials, status: "CONNECTED", scopes: ["okta:read-only-admin"] },
  });
  await audit("connector.connect", "OKTA", { domain });
  const result = await runConnectorSync(s.orgId, "OKTA");
  revalidatePath("/", "layout");
  if (!result.ok) back(`Connected, but the first sync failed: ${result.error.slice(0, 200)}`);
  redirect("/connectors?connected=OKTA#OKTA");
}

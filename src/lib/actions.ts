"use server";

/**
 * Server actions — la UI chiama queste invece di fare fetch verso le API
 * route. Ogni azione tocca solo il database (mai un LLM) e poi invalida
 * le pagine interessate, così l'utente vede subito il risultato.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { runConnectorSync } from "@/lib/connectors/sync";
import type { ConnectorProvider, AiAssetStatus, EuAiActTier } from "@prisma/client";

const ORG_ID = "demo-org"; // MVP: single-tenant demo; sostituire con auth reale

export async function syncConnectorAction(formData: FormData) {
  const provider = formData.get("provider") as ConnectorProvider;
  await runConnectorSync(ORG_ID, provider);
  revalidatePath("/connectors");
  revalidatePath("/assets");
  revalidatePath("/evidence");
  revalidatePath("/");
}

export async function setAssetOwnerAction(formData: FormData) {
  const assetId = formData.get("assetId") as string;
  const ownerId = formData.get("ownerId") as string;
  await db.aiAsset.update({
    where: { id: assetId },
    data: { ownerId: ownerId || null },
  });
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
  revalidatePath("/");
}

export async function setAssetStatusAction(formData: FormData) {
  const assetId = formData.get("assetId") as string;
  const status = formData.get("status") as AiAssetStatus;
  await db.aiAsset.update({
    where: { id: assetId },
    data: { status },
  });
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
  revalidatePath("/approvals");
  revalidatePath("/");
}

export async function setAssetEuAiActTierAction(formData: FormData) {
  const assetId = formData.get("assetId") as string;
  const tier = formData.get("tier") as EuAiActTier;
  await db.aiAsset.update({
    where: { id: assetId },
    data: { euAiActTier: tier },
  });
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
}

export async function createPolicyAction(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const category = (formData.get("category") as string) || "other";
  if (!name || !description) return;
  const existing = await db.policy.findFirst({ where: { organizationId: ORG_ID, name } });
  if (existing) {
    revalidatePath("/policies");
    return; // already exists under this name — never create a duplicate
  }
  await db.policy.create({
    data: { organizationId: ORG_ID, name, description, category },
  });
  revalidatePath("/policies");
}

export async function addPolicyFromLibraryAction(formData: FormData) {
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const category = formData.get("category") as string;
  const existing = await db.policy.findFirst({ where: { organizationId: ORG_ID, name } });
  if (existing) {
    revalidatePath("/policies");
    return; // already added — clicking "Add" again is a no-op, not a duplicate
  }
  await db.policy.create({
    data: { organizationId: ORG_ID, name, description, category },
  });
  revalidatePath("/policies");
}

export async function togglePolicyAction(formData: FormData) {
  const policyId = formData.get("policyId") as string;
  const enabled = formData.get("enabled") === "true";
  await db.policy.update({
    where: { id: policyId },
    data: { enabled: !enabled },
  });
  revalidatePath("/policies");
}

export async function deletePolicyAction(formData: FormData) {
  const policyId = formData.get("policyId") as string;
  await db.policy.delete({ where: { id: policyId } });
  revalidatePath("/policies");
}

export async function addUserAction(formData: FormData) {
  const email = (formData.get("email") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const department = (formData.get("department") as string)?.trim();
  if (!email) return;
  await db.user.upsert({
    where: { organizationId_email: { organizationId: ORG_ID, email } },
    update: { name: name || undefined, department: department || undefined },
    create: { organizationId: ORG_ID, email, name: name || undefined, department: department || undefined },
  });
  revalidatePath("/people");
  revalidatePath("/settings");
  revalidatePath("/onboarding");
}

export async function updateOrganizationAction(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const country = (formData.get("country") as string)?.trim();
  if (!name) return;
  await db.organization.update({
    where: { id: ORG_ID },
    data: { name, country: country || null },
  });
  revalidatePath("/settings");
  revalidatePath("/onboarding");
  revalidatePath("/");
}

export async function completeOnboardingAction() {
  await db.organization.update({
    where: { id: ORG_ID },
    data: { onboardingCompletedAt: new Date() },
  });
  revalidatePath("/");
  revalidatePath("/settings");
  redirect("/");
}

export async function restartOnboardingAction() {
  await db.organization.update({
    where: { id: ORG_ID },
    data: { onboardingCompletedAt: null },
  });
  revalidatePath("/settings");
  redirect("/onboarding?step=1");
}

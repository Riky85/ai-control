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
import { assessAssetRisk } from "@/lib/risk-engine";
import { runAssuranceChecks } from "@/lib/assurance-engine";
import type { ConnectorProvider, AiAssetStatus, EuAiActTier } from "@prisma/client";

const ORG_ID = "demo-org"; // MVP: single-tenant demo; sostituire con auth reale

// Ricalcola risk + assurance per un singolo asset dopo una modifica manuale
// (owner, stato, classificazione) — le stesse funzioni deterministiche usate
// dopo ogni sync, così l'assurance non resta mai disallineata da un edit.
async function recomputeAssuranceFor(assetId: string) {
  const full = await db.aiAsset.findUnique({
    where: { id: assetId },
    include: {
      connectedSystems: true,
      dataAccess: { include: { dataAsset: true } },
      activities: { orderBy: { occurredAt: "desc" }, take: 50 },
    },
  });
  if (!full) return;
  const risk = assessAssetRisk(full);
  const orgHasActivePolicy = (await db.policy.count({ where: { organizationId: full.organizationId, enabled: true } })) > 0;
  const assurance = runAssuranceChecks(full, risk, orgHasActivePolicy);
  await db.assuranceReport.create({
    data: {
      aiAssetId: assetId,
      level: assurance.level,
      score: assurance.score,
      passedCount: assurance.passedCount,
      warningCount: assurance.warningCount,
      failedCount: assurance.failedCount,
      checks: assurance.checks as any,
    },
  });
}

export async function syncConnectorAction(formData: FormData) {
  const provider = formData.get("provider") as ConnectorProvider;
  await runConnectorSync(ORG_ID, provider);
  revalidatePath("/connectors");
  revalidatePath("/assets");
  revalidatePath("/evidence");
  revalidatePath("/assurance");
  revalidatePath("/changes");
  revalidatePath("/");
}

export async function setAssetOwnerAction(formData: FormData) {
  const assetId = formData.get("assetId") as string;
  const ownerId = formData.get("ownerId") as string;
  await db.aiAsset.update({
    where: { id: assetId },
    data: { ownerId: ownerId || null },
  });
  await recomputeAssuranceFor(assetId);
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
  revalidatePath("/assurance");
  revalidatePath("/changes");
  revalidatePath("/");
}

export async function setAssetStatusAction(formData: FormData) {
  const assetId = formData.get("assetId") as string;
  const status = formData.get("status") as AiAssetStatus;
  const before = await db.aiAsset.findUnique({ where: { id: assetId }, select: { status: true } });
  await db.aiAsset.update({
    where: { id: assetId },
    data: { status },
  });
  if (before && before.status !== status) {
    await db.assetChange.create({
      data: { aiAssetId: assetId, field: "status", oldValue: before.status, newValue: status },
    });
  }
  await recomputeAssuranceFor(assetId);
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
  revalidatePath("/approvals");
  revalidatePath("/assurance");
  revalidatePath("/changes");
  revalidatePath("/");
}

export async function setAssetEuAiActTierAction(formData: FormData) {
  const assetId = formData.get("assetId") as string;
  const tier = formData.get("tier") as EuAiActTier;
  await db.aiAsset.update({
    where: { id: assetId },
    data: { euAiActTier: tier },
  });
  await recomputeAssuranceFor(assetId);
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
  revalidatePath("/assurance");
  revalidatePath("/changes");
}

// Costo manuale — nessuna automazione, l'utente inserisce quello che sa e
// dichiara quanto ne è sicuro. "basis" resta sempre "manual" finché non
// esiste un vero connettore di billing.
export async function setAssetCostAction(formData: FormData) {
  const assetId = formData.get("assetId") as string;
  const monthlyRaw = formData.get("monthlyCostEstimate") as string;
  const confidence = formData.get("confidence") as string;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const monthlyCostEstimate = monthlyRaw ? parseFloat(monthlyRaw) : null;

  await db.aiSystemCost.upsert({
    where: { aiAssetId: assetId },
    update: { monthlyCostEstimate, confidence, notes, basis: "manual" },
    create: { aiAssetId: assetId, monthlyCostEstimate, confidence, notes, basis: "manual" },
  });
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
  revalidatePath("/providers");
}

// Alternativa registrata a mano — mai generata da un modello, mai un
// punteggio nascosto. L'utente dice cosa ha confrontato e perché.
export async function addAlternativeAction(formData: FormData) {
  const assetId = formData.get("assetId") as string;
  const provider = (formData.get("provider") as string)?.trim();
  const model = (formData.get("model") as string)?.trim();
  if (!provider || !model) return;
  const costRaw = formData.get("estimatedMonthlyCost") as string;
  await db.modelAlternative.create({
    data: {
      aiAssetId: assetId,
      provider,
      model,
      estimatedMonthlyCost: costRaw ? parseFloat(costRaw) : null,
      qualityConfidence: (formData.get("qualityConfidence") as string) || null,
      migrationEffortDays: (formData.get("migrationEffortDays") as string)?.trim() || null,
      reasoning: (formData.get("reasoning") as string)?.trim() || null,
    },
  });
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/savings");
}

export async function deleteAlternativeAction(formData: FormData) {
  const id = formData.get("alternativeId") as string;
  const assetId = formData.get("assetId") as string;
  await db.modelAlternative.delete({ where: { id } });
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/savings");
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

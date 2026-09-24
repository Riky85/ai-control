"use server";

import { currentOrgId } from "@/lib/org";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { MemberRole } from "@prisma/client";

// Ogni azione di scrittura: ruolo minimo verificato nel database, e gli ID
// che arrivano dal modulo devono appartenere al workspace corrente —
// altrimenti un'azienda potrebbe modificare i dati di un'altra.
async function guard(min: MemberRole, action: string, formData?: FormData, back = "/") {
  const s = await requireRole(min, back);
  const assetId = formData?.get("assetId");
  if (assetId) {
    const ok = await db.aiAsset.count({ where: { id: String(assetId), organizationId: s.orgId } });
    if (!ok) redirect(`${back}?error=${encodeURIComponent("That AI system isn't in this workspace.")}`);
  }
  const policyId = formData?.get("policyId");
  if (policyId) {
    const ok = await db.policy.count({ where: { id: String(policyId), organizationId: s.orgId } });
    if (!ok) redirect(`${back}?error=${encodeURIComponent("That policy isn't in this workspace.")}`);
  }
  const alternativeId = formData?.get("alternativeId");
  if (alternativeId) {
    const ok = await db.modelAlternative.count({ where: { id: String(alternativeId), aiAsset: { organizationId: s.orgId } } });
    if (!ok) redirect(`${back}?error=${encodeURIComponent("That alternative isn't in this workspace.")}`);
  }
  await audit(action, String(assetId ?? policyId ?? alternativeId ?? formData?.get("provider") ?? "") || undefined);
  return s;
}
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
import { encryptJson } from "@/lib/crypto";
import { adminGet as anthropicGet } from "@/lib/connectors/anthropic";
import { adminGet as openaiGet } from "@/lib/connectors/openai";
import { isAdminKey, testApiKey } from "@/lib/connectors/api-key-providers";
import type { ConnectorProvider, AiAssetStatus, EuAiActTier } from "@prisma/client";


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
  await guard("EDITOR", "connector.sync", formData, "/connectors");
  const provider = formData.get("provider") as ConnectorProvider;
  await runConnectorSync(currentOrgId(), provider);
  revalidatePath("/connectors");
  revalidatePath("/assets");
  revalidatePath("/activity");
  revalidatePath("/governance");
  revalidatePath("/changes");
  revalidatePath("/");
}


// Connect con API key incollata nell'app: 1) la chiave viene provata subito
// contro il provider (una chiamata di sola lettura), 2) solo se funziona la
// salviamo cifrata, 3) parte la prima sincronizzazione. Niente Railway,
// niente variabili d'ambiente per il cliente.
const KEY_TESTS: Partial<Record<ConnectorProvider, (key: string) => Promise<unknown>>> = {
  ANTHROPIC: (key) => anthropicGet("/organizations/users?limit=1", key),
  OPENAI: (key) => openaiGet("/organization/users?limit=1", key),
};

export async function connectWithApiKeyAction(formData: FormData) {
  await guard("ADMIN", "connector.connect", formData, "/connectors");
  const provider = formData.get("provider") as ConnectorProvider;
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const back = (msg: string) => redirect(`/connectors?error=${encodeURIComponent(msg)}&provider=${provider}#${provider}`);
  if (!apiKey) back("Paste a key first.");

  // Chiave Admin (Anthropic/OpenAI) → connettore completo con utenti;
  // chiave normale → verifica tramite elenco modelli. Entrambe valide.
  const admin = isAdminKey(provider, apiKey);
  let failure: string | null = null;
  if (admin) {
    try {
      await KEY_TESTS[provider]!(apiKey);
    } catch (err) {
      failure = `Admin key rejected: ${(err as Error).message.slice(0, 200)}`;
    }
  } else {
    const test = await testApiKey(provider, apiKey);
    if (!test.ok) failure = test.error;
  }
  if (failure) back(failure);

  let credentials = "";
  try {
    credentials = encryptJson({ apiKey, mode: admin ? "admin" : "standard" });
  } catch (err) {
    back((err as Error).message);
  }
  await db.connector.upsert({
    where: { organizationId_provider: { organizationId: currentOrgId(), provider } },
    update: { credentialsEncrypted: credentials, status: "CONNECTED", lastSyncError: null },
    create: { organizationId: currentOrgId(), provider, credentialsEncrypted: credentials, status: "CONNECTED", scopes: [] },
  });
  const result = await runConnectorSync(currentOrgId(), provider);
  revalidatePath("/", "layout");
  if (!result.ok) back(`Key saved, but the first sync failed: ${result.error.slice(0, 200)}`);
  redirect(`/connectors?connected=${provider}`);
}

// Crea (o aggiorna) un sistema AI senza connettore — aggiunta manuale e
// import CSV — e calcola subito rischio e assurance come dopo un sync.
async function upsertManualAsset(input: { name: string; vendor?: string; type?: string; model?: string; ownerEmail?: string; department?: string; monthlyCost?: number }) {
  const types = ["AI_APPLICATION", "AI_FEATURE", "AI_API", "AI_AGENT", "MCP_SERVER", "AI_DEV_TOOL"];
  const type = (types.includes((input.type ?? "").toUpperCase()) ? input.type!.toUpperCase() : "AI_APPLICATION") as any;
  const owner = input.ownerEmail
    ? await db.user.upsert({
        where: { organizationId_email: { organizationId: currentOrgId(), email: input.ownerEmail.toLowerCase() } },
        update: {},
        create: { organizationId: currentOrgId(), email: input.ownerEmail.toLowerCase() },
      })
    : null;
  const existing = await db.aiAsset.findFirst({ where: { organizationId: currentOrgId(), connectorId: null, name: input.name } });
  const data = {
    type,
    vendor: input.vendor || null,
    model: input.model || null,
    department: input.department || null,
    ...(owner ? { ownerId: owner.id } : {}),
    lastSeenAt: new Date(),
  };
  const asset = existing
    ? await db.aiAsset.update({ where: { id: existing.id }, data })
    : await db.aiAsset.create({ data: { ...data, organizationId: currentOrgId(), name: input.name, status: "UNREVIEWED", firstSeenAt: new Date() } });
  if (input.monthlyCost != null && !Number.isNaN(input.monthlyCost)) {
    await db.aiSystemCost.upsert({
      where: { aiAssetId: asset.id },
      update: { monthlyCostEstimate: input.monthlyCost, basis: "manual" },
      create: { aiAssetId: asset.id, monthlyCostEstimate: input.monthlyCost, basis: "manual", confidence: "MEDIUM" },
    });
  }
  const full = await db.aiAsset.findUniqueOrThrow({
    where: { id: asset.id },
    include: { connectedSystems: true, dataAccess: { include: { dataAsset: true } }, activities: { orderBy: { occurredAt: "desc" }, take: 50 } },
  });
  const risk = assessAssetRisk(full);
  await db.riskAssessment.create({ data: { aiAssetId: asset.id, level: risk.level, score: risk.score, reasons: risk.reasons, mitigations: risk.mitigations } });
  await recomputeAssuranceFor(asset.id);
  return asset;
}

export async function addManualAssetAction(formData: FormData) {
  await guard("EDITOR", "asset.create_manual", formData, "/connectors");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect(`/connectors?error=${encodeURIComponent("Give the AI system a name.")}#manual`);
  const cost = String(formData.get("monthlyCost") ?? "").trim();
  const asset = await upsertManualAsset({
    name,
    vendor: String(formData.get("vendor") ?? "").trim(),
    type: String(formData.get("type") ?? ""),
    model: String(formData.get("model") ?? "").trim(),
    ownerEmail: String(formData.get("ownerEmail") ?? "").trim(),
    monthlyCost: cost ? Number(cost) : undefined,
  });
  revalidatePath("/", "layout");
  redirect(`/assets/${asset.id}`);
}

export async function importCsvAction(formData: FormData) {
  await guard("EDITOR", "asset.import_csv", formData, "/connectors");
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) redirect(`/connectors?error=${encodeURIComponent("Choose a CSV file first.")}#import`);
  const text = await file!.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const split = (l: string) => l.split(/[,;](?=(?:[^"]*"[^"]*")*[^"]*$)/).map((v) => v.trim().replace(/^"|"$/g, ""));
  const header = split(lines[0] ?? "").map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const col = (row: string[], ...names: string[]) => {
    const i = header.findIndex((h) => names.includes(h));
    return i >= 0 ? row[i] : undefined;
  };
  if (!header.includes("name")) redirect(`/connectors?error=${encodeURIComponent("The CSV needs at least a 'name' column.")}#import`);
  let count = 0;
  for (const line of lines.slice(1)) {
    const row = split(line);
    const name = col(row, "name");
    if (!name) continue;
    const cost = col(row, "monthlycost", "cost", "costmonth");
    await upsertManualAsset({
      name,
      vendor: col(row, "vendor", "provider"),
      type: col(row, "type"),
      model: col(row, "model"),
      ownerEmail: col(row, "owner", "owneremail", "email"),
      department: col(row, "department", "team"),
      monthlyCost: cost ? Number(cost.replace(/[^0-9.]/g, "")) : undefined,
    });
    count++;
  }
  revalidatePath("/", "layout");
  redirect(`/connectors?imported=${count}#import`);
}

export async function disconnectConnectorAction(formData: FormData) {
  await guard("ADMIN", "connector.disconnect", formData, "/connectors");
  const provider = formData.get("provider") as ConnectorProvider;
  await db.connector.updateMany({
    where: { organizationId: currentOrgId(), provider },
    data: { credentialsEncrypted: null, status: "DISCONNECTED", lastSyncError: null, lastSyncWarnings: [] },
  });
  revalidatePath("/connectors");
}

export async function setAssetOwnerAction(formData: FormData) {
  await guard("EDITOR", "asset.set_owner", formData, "/assets");
  const assetId = formData.get("assetId") as string;
  const ownerId = formData.get("ownerId") as string;
  await db.aiAsset.update({
    where: { id: assetId },
    data: { ownerId: ownerId || null },
  });
  await recomputeAssuranceFor(assetId);
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
  revalidatePath("/governance");
  revalidatePath("/changes");
  revalidatePath("/");
}

export async function setAssetStatusAction(formData: FormData) {
  await guard("EDITOR", "asset.set_status", formData, "/assets");
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
  revalidatePath("/governance");
  revalidatePath("/changes");
  revalidatePath("/");
}

export async function setAssetEuAiActTierAction(formData: FormData) {
  await guard("EDITOR", "asset.set_eu_ai_act", formData, "/assets");
  const assetId = formData.get("assetId") as string;
  const tier = formData.get("tier") as EuAiActTier;
  await db.aiAsset.update({
    where: { id: assetId },
    data: { euAiActTier: tier },
  });
  await recomputeAssuranceFor(assetId);
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
  revalidatePath("/governance");
  revalidatePath("/changes");
}

// Costo manuale — nessuna automazione, l'utente inserisce quello che sa e
// dichiara quanto ne è sicuro. "basis" resta sempre "manual" finché non
// esiste un vero connettore di billing.
export async function setAssetCostAction(formData: FormData) {
  await guard("EDITOR", "asset.set_cost", formData, "/assets");
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
  await guard("EDITOR", "asset.add_alternative", formData, "/assets");
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
  await guard("EDITOR", "asset.delete_alternative", formData, "/assets");
  const id = formData.get("alternativeId") as string;
  const assetId = formData.get("assetId") as string;
  await db.modelAlternative.delete({ where: { id } });
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/savings");
}

export async function createPolicyAction(formData: FormData) {
  await guard("ADMIN", "policy.create", formData, "/governance");
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const category = (formData.get("category") as string) || "other";
  if (!name || !description) return;
  const existing = await db.policy.findFirst({ where: { organizationId: currentOrgId(), name } });
  if (existing) {
    revalidatePath("/governance");
    return; // already exists under this name — never create a duplicate
  }
  await db.policy.create({
    data: { organizationId: currentOrgId(), name, description, category },
  });
  revalidatePath("/governance");
}

export async function addPolicyFromLibraryAction(formData: FormData) {
  await guard("ADMIN", "policy.add_from_library", formData, "/governance");
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const category = formData.get("category") as string;
  const existing = await db.policy.findFirst({ where: { organizationId: currentOrgId(), name } });
  if (existing) {
    revalidatePath("/governance");
    return; // already added — clicking "Add" again is a no-op, not a duplicate
  }
  await db.policy.create({
    data: { organizationId: currentOrgId(), name, description, category },
  });
  revalidatePath("/governance");
}

export async function togglePolicyAction(formData: FormData) {
  await guard("ADMIN", "policy.toggle", formData, "/governance");
  const policyId = formData.get("policyId") as string;
  const enabled = formData.get("enabled") === "true";
  await db.policy.update({
    where: { id: policyId },
    data: { enabled: !enabled },
  });
  revalidatePath("/governance");
}

export async function deletePolicyAction(formData: FormData) {
  await guard("ADMIN", "policy.delete", formData, "/governance");
  const policyId = formData.get("policyId") as string;
  await db.policy.delete({ where: { id: policyId } });
  revalidatePath("/governance");
}

export async function addUserAction(formData: FormData) {
  await guard("EDITOR", "people.add", formData, "/settings");
  const email = (formData.get("email") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const department = (formData.get("department") as string)?.trim();
  if (!email) return;
  await db.user.upsert({
    where: { organizationId_email: { organizationId: currentOrgId(), email } },
    update: { name: name || undefined, department: department || undefined },
    create: { organizationId: currentOrgId(), email, name: name || undefined, department: department || undefined },
  });
  revalidatePath("/people");
  revalidatePath("/settings");
  revalidatePath("/onboarding");
}

export async function updateOrganizationAction(formData: FormData) {
  await guard("ADMIN", "organization.update", formData, "/settings");
  const name = (formData.get("name") as string)?.trim();
  const country = (formData.get("country") as string)?.trim();
  if (!name) return;
  await db.organization.update({
    where: { id: currentOrgId() },
    data: { name, country: country || null },
  });
  revalidatePath("/settings");
  revalidatePath("/onboarding");
  revalidatePath("/");
}

export async function completeOnboardingAction() {
  await guard("ADMIN", "onboarding.complete", undefined, "/");
  await db.organization.update({
    where: { id: currentOrgId() },
    data: { onboardingCompletedAt: new Date() },
  });
  revalidatePath("/");
  revalidatePath("/settings");
  redirect("/");
}

export async function restartOnboardingAction() {
  await guard("ADMIN", "onboarding.restart", undefined, "/");
  await db.organization.update({
    where: { id: currentOrgId() },
    data: { onboardingCompletedAt: null },
  });
  revalidatePath("/settings");
  redirect("/onboarding?step=1");
}

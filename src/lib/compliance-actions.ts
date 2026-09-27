"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { EuAiActTier } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { assessAssetRisk } from "@/lib/risk-engine";
import { runAssuranceChecks } from "@/lib/assurance-engine";
import { loadComplianceAssets, suggestionFor, LITERACY_EVIDENCE, TIER_LABEL } from "@/lib/compliance";

const BACK = "/compliance";

function refresh(assetIds: string[]) {
  revalidatePath(BACK);
  revalidatePath("/assets");
  revalidatePath("/changes");
  revalidatePath("/governance");
  for (const id of assetIds.slice(0, 50)) revalidatePath(`/assets/${id}`);
}

// Stesso ricalcolo risk + assurance delle altre modifiche manuali (actions.ts),
// così la classificazione AI Act si riflette subito nei controlli.
async function recomputeAssurance(assetId: string) {
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
  const a = runAssuranceChecks(full, risk, orgHasActivePolicy);
  await db.assuranceReport.create({
    data: { aiAssetId: assetId, level: a.level, score: a.score, passedCount: a.passedCount, warningCount: a.warningCount, failedCount: a.failedCount, checks: a.checks as any },
  });
}

async function setTier(assetId: string, oldTier: EuAiActTier, tier: EuAiActTier) {
  await db.aiAsset.update({ where: { id: assetId }, data: { euAiActTier: tier } });
  await db.assetChange.create({ data: { aiAssetId: assetId, field: "AI Act tier", oldValue: TIER_LABEL[oldTier], newValue: TIER_LABEL[tier] } });
  await recomputeAssurance(assetId).catch((e) => console.error("[compliance] assurance recompute failed", e));
}

/** Applica il livello suggerito a una sola AI (sempre dell'azienda corrente). */
export async function applySuggestedTierAction(formData: FormData) {
  const s = await requireRole("EDITOR", BACK);
  const assetId = String(formData.get("assetId") ?? "");
  const asset = (await loadComplianceAssets(s.orgId)).find((a) => a.id === assetId);
  if (!asset) redirect(`${BACK}?error=${encodeURIComponent("AI not found in this workspace.")}`);
  const sug = suggestionFor(asset!);
  if (sug.tier !== asset!.euAiActTier) {
    await setTier(asset!.id, asset!.euAiActTier, sug.tier);
    await audit("asset.set_eu_ai_act", asset!.name, { tier: sug.tier, source: "suggestion" });
  }
  refresh([asset!.id]);
}

/**
 * Applica i suggerimenti alle AI non ancora classificate. Le classi già
 * impostate a mano non vengono toccate: si cambiano una per una.
 */
export async function applyAllSuggestionsAction() {
  const s = await requireRole("EDITOR", BACK);
  const assets = await loadComplianceAssets(s.orgId);
  const changed: string[] = [];
  for (const a of assets) {
    if (a.euAiActTier !== "UNCLASSIFIED") continue;
    const sug = suggestionFor(a);
    if (sug.tier === a.euAiActTier) continue;
    await setTier(a.id, a.euAiActTier, sug.tier);
    changed.push(a.id);
  }
  if (changed.length) await audit("asset.set_eu_ai_act_bulk", `${changed.length} AI`, { source: "suggestion" });
  refresh(changed);
  redirect(`${BACK}?applied=${changed.length}`);
}

/** Registra una formazione di AI literacy (Art. 4) come evidenza. */
export async function recordLiteracyAction(formData: FormData) {
  const s = await requireRole("EDITOR", BACK);
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  if (!note) redirect(`${BACK}?error=${encodeURIComponent("Describe the training, e.g. “All staff: 1h AI basics, March 2026”.")}`);
  await db.evidence.create({
    data: { organizationId: s.orgId, type: LITERACY_EVIDENCE, summary: note, payload: { recordedBy: s.email, recordedAt: new Date().toISOString() } },
  });
  await audit("compliance.ai_literacy", note);
  revalidatePath(BACK);
}

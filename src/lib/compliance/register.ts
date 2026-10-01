/**
 * Caricamento del registro AI Act & GDPR art. 30 dal database: una sola query,
 * poi le funzioni pure di ropa.ts / ai-act.ts. Usato dalla pagina, dalla card
 * della Governance e dall'export CSV.
 */
import { db } from "@/lib/db";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";
import { buildRopaRow, processesPersonalData, type RopaAsset, type RopaRow } from "@/lib/compliance/ropa";
import { AI_ACT_TIERS, type AiActTier } from "@/lib/compliance/ai-act";

export async function loadRegister(organizationId: string): Promise<{ rows: RopaRow[]; /** Classi AI Act di tutte le AI (non solo quelle del registro). */ tiers: Record<AiActTier, number>; toComplete: number }> {
  const [assets, mode] = await Promise.all([
    db.aiAsset.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        vendor: true,
        serviceId: true,
        model: true,
        department: true,
        euAiActTier: true,
        aiActTier: true,
        aiActNote: true,
        ropa: true,
        owner: { select: { name: true, email: true } },
        _count: { select: { usages: true } },
        dataAccess: { select: { dataAsset: { select: { name: true, sensitivity: true } } } },
        cost: { select: { planId: true, monthlyCostEstimate: true, basis: true } },
      },
      orderBy: { name: "asc" },
      take: 1000,
    }),
    orgPrivacyMode(organizationId),
  ]);
  const showPeople = showsPeople(mode);
  // Classe AI Act per ogni AI; nel registro GDPR solo quelle che trattano dati personali.
  const all = assets.map((a): { asset: RopaAsset; row: RopaRow } => {
    const asset: RopaAsset = { ...a, usageCount: a._count.usages, data: a.dataAccess.map((d) => d.dataAsset) };
    return { asset, row: buildRopaRow(asset, { showPeople }) };
  });
  const tiers = Object.fromEntries(AI_ACT_TIERS.map((t) => [t, 0])) as Record<AiActTier, number>;
  for (const x of all) tiers[x.row.aiAct.tier] += 1;
  const rows = all.filter((x) => processesPersonalData(x.asset)).map((x) => x.row);
  return { rows, tiers, toComplete: rows.filter((r) => r.todo > 0).length };
}

import { db } from "@/lib/db";
import { Insight } from "@/components/insight";
import { DIRECT_DEPLOYMENT } from "@/lib/pricing/catalog-data";
import { modelById, fmtDay } from "@/lib/pricing/service";
import { retirementKey, deprecationKey } from "@/lib/market/detect";

const DAY = 86_400_000;
/** Si avvisa per i modelli deprecati, ritirati o con un ritiro entro questi giorni. */
const SOON_DAYS = 180;

/**
 * Pagina dell'AI system: una riga sola se usa un modello deprecato o vicino al ritiro,
 * con i giorni che restano. Vale per l'API del fornitore (come l'impatto in market/impact.ts).
 */
export default async function ModelLifecycleNotice({ orgId, assetId }: { orgId: string; assetId: string }) {
  const uses = await db.aiAssetModelUse.findMany({ where: { organizationId: orgId, aiAssetId: assetId, status: { notIn: ["rejected", "stale"] }, modelId: { not: null } }, select: { modelId: true, deploymentId: true } });
  const now = Date.now();
  const hits = uses
    .map((u) => ({ u, m: modelById(u.modelId!) }))
    .filter(({ u, m }) => m && (!u.deploymentId || u.deploymentId === DIRECT_DEPLOYMENT[m.providerId]))
    .map(({ m }) => m!)
    .filter((m) => m.lifecycle === "deprecated" || m.lifecycle === "sunset" || m.lifecycle === "retired" || (m.retiresAt && m.retiresAt.getTime() - now <= SOON_DAYS * DAY))
    .sort((a, b) => (a.retiresAt?.getTime() ?? Infinity) - (b.retiresAt?.getTime() ?? Infinity));
  const m = hits[0];
  if (!m) return null;
  const days = m.retiresAt ? Math.ceil((m.retiresAt.getTime() - now) / DAY) : null;
  const repl = m.replacementId ? modelById(m.replacementId) : null;
  const change = await db.aiMarketChange.findFirst({ where: { key: { in: [retirementKey(m), deprecationKey(m)] } }, orderBy: { changeType: "desc" }, select: { id: true } });
  const when = days == null ? "is deprecated" : days > 0 ? `retires in ${days} day${days === 1 ? "" : "s"} (${fmtDay(m.retiresAt!)})` : days === 0 ? "retires today" : `was retired on ${fmtDay(m.retiresAt!)}`;
  return (
    <Insight tone={days != null && days <= 30 ? "alarm" : "signal"} href={change ? `/market/${change.id}` : "/market"} cta="Details">
      {m.name} {when}.{repl ? ` Replacement: ${repl.name}.` : ""}
    </Insight>
  );
}

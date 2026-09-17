/**
 * Evidence — PRD §7.9. Snapshot periodico dell'inventario, generato
 * automaticamente dopo ogni sync riuscito. Serve a rispondere a "cosa è
 * cambiato dall'ultima volta" senza dover ricostruire lo storico dai log
 * grezzi. Come per il resto del prodotto: il contenuto è calcolato da
 * query dirette sul database, non da un riassunto generato da un LLM.
 */
import { db } from "@/lib/db";

export async function recordInventorySnapshot(organizationId: string) {
  const [total, byType, byStatus, highRisk] = await Promise.all([
    db.aiAsset.count({ where: { organizationId, deletedAt: null } }),
    db.aiAsset.groupBy({
      by: ["type"],
      where: { organizationId, deletedAt: null },
      _count: { _all: true },
    }),
    db.aiAsset.groupBy({
      by: ["status"],
      where: { organizationId, deletedAt: null },
      _count: { _all: true },
    }),
    db.riskAssessment.groupBy({
      by: ["aiAssetId"],
      where: { aiAsset: { organizationId }, level: { in: ["HIGH", "CRITICAL"] } },
      _max: { createdAt: true },
    }),
  ]);

  const payload = {
    total,
    byType: Object.fromEntries(byType.map((t) => [t.type, t._count._all])),
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    highRiskCount: highRisk.length,
  };

  const previous = await db.evidence.findFirst({
    where: { organizationId, type: "inventory_snapshot" },
    orderBy: { createdAt: "desc" },
  });

  // Se nulla e' cambiato rispetto all'ultimo snapshot, non aggiungerne uno
  // nuovo: un audit trail con una riga identica ogni volta che gira un sync
  // senza novita' e' rumore, non evidenza. Si registra solo un vero cambiamento.
  if (previous) {
    const prevPayload = previous.payload as typeof payload;
    const unchanged =
      prevPayload.total === payload.total &&
      prevPayload.highRiskCount === payload.highRiskCount &&
      JSON.stringify(prevPayload.byType) === JSON.stringify(payload.byType) &&
      JSON.stringify(prevPayload.byStatus) === JSON.stringify(payload.byStatus);
    if (unchanged) return previous;
  }

  const previousTotal = previous ? (previous.payload as { total?: number }).total ?? 0 : null;
  const delta = previousTotal === null ? null : total - previousTotal;
  const summary =
    delta === null
      ? `${total} AI assets on record.`
      : delta > 0
        ? `${total} AI assets on record, ${delta} new since last snapshot.`
        : `${total} AI assets on record, ${Math.abs(delta)} removed since last snapshot.`;

  return db.evidence.create({
    data: { organizationId, type: "inventory_snapshot", summary, payload },
  });
}

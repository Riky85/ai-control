import { db } from "@/lib/db";
import { authenticateApi, apiJson } from "@/lib/api-keys";
import { showsPeople, maskCount } from "@/lib/privacy";
import { monthlyOf, loadAssets } from "@/lib/savings";
import { vendorRiskFor, RESIDENCY_LABEL } from "@/lib/vendor-risk";

export const dynamic = "force-dynamic";

/** GET /api/v1/ai — inventario AI dell'azienda della chiave. Owner per nome solo con privacy "per persona". */
export async function GET(req: Request) {
  const ctx = await authenticateApi(req);
  if (ctx instanceof Response) return ctx;
  const people = showsPeople(ctx.mode);
  const [assets, costs] = await Promise.all([
    db.aiAsset.findMany({
      where: { organizationId: ctx.orgId, deletedAt: null },
      include: { owner: { select: { name: true, email: true, department: true } }, _count: { select: { usages: true } }, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1, select: { level: true } } },
      orderBy: { name: "asc" },
      take: 5000,
    }),
    loadAssets(ctx.orgId, { includeRejected: true }),
  ]);
  const cost = new Map(costs.map((a) => [a.id, monthlyOf(a)]));
  return apiJson({
    data: assets.map((a) => {
      const m = cost.get(a.id);
      const v = vendorRiskFor(a);
      return {
        id: a.id,
        name: a.name,
        vendor: a.vendor,
        serviceId: a.serviceId,
        type: a.type,
        status: a.status,
        euAiActTier: a.euAiActTier,
        riskLevel: a.riskAssessments[0]?.level ?? null,
        owner: a.owner ? (people ? { name: a.owner.name, email: a.owner.email } : null) : null,
        department: a.department ?? a.owner?.department ?? null,
        users: people ? a._count.usages : maskCount(a._count.usages),
        monthlyCostEur: m ? Math.round(m.eur * 100) / 100 : null,
        costEstimated: m ? m.estimated : null,
        vendorHq: v?.hq ?? null,
        vendorEuResidency: v ? RESIDENCY_LABEL[v.euResidency] : null,
        firstSeen: a.firstSeenAt.toISOString(),
        lastSeen: a.lastSeenAt?.toISOString() ?? null,
      };
    }),
    privacyMode: ctx.mode,
  });
}

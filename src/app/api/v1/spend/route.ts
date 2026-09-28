import { db } from "@/lib/db";
import { authenticateApi, apiJson } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

/** GET /api/v1/spend?months=12 — spesa AI mensile (addebiti riconosciuti da banca e fatture). */
export async function GET(req: Request) {
  const ctx = await authenticateApi(req);
  if (ctx instanceof Response) return ctx;
  const months = Math.min(36, Math.max(1, Number(new URL(req.url).searchParams.get("months")) || 12));
  const from = new Date();
  from.setUTCDate(1);
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCMonth(from.getUTCMonth() - (months - 1));
  const rows = await db.spendRecord.findMany({ where: { organizationId: ctx.orgId, date: { gte: from } }, select: { date: true, amountEur: true, service: true, source: true }, take: 100_000 });
  const byMonth = new Map<string, { month: string; totalEur: number; byService: Map<string, number> }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(from);
    d.setUTCMonth(from.getUTCMonth() + i);
    const k = d.toISOString().slice(0, 7);
    byMonth.set(k, { month: k, totalEur: 0, byService: new Map() });
  }
  for (const r of rows) {
    const m = byMonth.get(r.date.toISOString().slice(0, 7));
    if (!m) continue;
    m.totalEur += r.amountEur;
    m.byService.set(r.service, (m.byService.get(r.service) ?? 0) + r.amountEur);
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return apiJson({
    currency: "EUR",
    data: [...byMonth.values()].map((m) => ({ month: m.month, totalEur: r2(m.totalEur), services: [...m.byService].map(([service, eur]) => ({ service, eur: r2(eur) })).sort((a, b) => b.eur - a.eur) })),
  });
}

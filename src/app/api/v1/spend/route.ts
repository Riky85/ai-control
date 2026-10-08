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
  // Somme per mese e servizio fatte dal database (prima: fino a 100.000 righe lette e sommate qui).
  // "date" è timestamp senza fuso, salvato in UTC: date_trunc dà il mese UTC, come prima.
  const rows = await db.$queryRaw<{ month: string; service: string; eur: number }[]>`
    SELECT to_char(date_trunc('month', "date"), 'YYYY-MM') AS month, "service", SUM("amountEur")::float8 AS eur
    FROM "SpendRecord"
    WHERE "organizationId" = ${ctx.orgId} AND "date" >= ${from}
    GROUP BY 1, 2`;
  const byMonth = new Map<string, { month: string; totalEur: number; byService: Map<string, number> }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(from);
    d.setUTCMonth(from.getUTCMonth() + i);
    const k = d.toISOString().slice(0, 7);
    byMonth.set(k, { month: k, totalEur: 0, byService: new Map() });
  }
  for (const r of rows) {
    const m = byMonth.get(r.month);
    if (!m) continue;
    const eur = Number(r.eur) || 0;
    m.totalEur += eur;
    m.byService.set(r.service, (m.byService.get(r.service) ?? 0) + eur);
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return apiJson({
    currency: "EUR",
    data: [...byMonth.values()].map((m) => ({ month: m.month, totalEur: r2(m.totalEur), services: [...m.byService].map(([service, eur]) => ({ service, eur: r2(eur) })).sort((a, b) => b.eur - a.eur) })),
  });
}

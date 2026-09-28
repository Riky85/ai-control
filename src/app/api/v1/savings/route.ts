import { authenticateApi, apiJson } from "@/lib/api-keys";
import { computeSavings } from "@/lib/savings";
import { showsPeople } from "@/lib/privacy";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export const dynamic = "force-dynamic";

/** GET /api/v1/savings — suggerimenti di risparmio correnti (€/mese). */
export async function GET(req: Request) {
  const ctx = await authenticateApi(req);
  if (ctx instanceof Response) return ctx;
  const { items, totalMonthly } = await computeSavings(ctx.orgId);
  const scrub = (t: string) => (showsPeople(ctx.mode) ? t : t.replace(EMAIL_RE, "[hidden]"));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return apiJson({
    currency: "EUR",
    totalMonthlyEur: r2(totalMonthly),
    data: items.map((i) => ({ key: i.key, kind: i.kind, title: scrub(i.title), detail: scrub(i.detail), monthlyEur: r2(i.monthlyEur), yearlyEur: r2(i.monthlyEur * 12), confidence: i.confidence, ai: i.assets.map((a) => ({ id: a.id, name: a.name, vendor: a.vendor })) })),
  });
}

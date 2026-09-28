import { db } from "@/lib/db";
import { authenticateApi, apiJson } from "@/lib/api-keys";
import { showsPeople } from "@/lib/privacy";

export const dynamic = "force-dynamic";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** GET /api/v1/alerts?since=ISO&limit=100 — avvisi recenti. Senza privacy "per persona" le email vengono nascoste. */
export async function GET(req: Request) {
  const ctx = await authenticateApi(req);
  if (ctx instanceof Response) return ctx;
  const q = new URL(req.url).searchParams;
  const limit = Math.min(500, Math.max(1, Number(q.get("limit")) || 100));
  const since = q.get("since") ? new Date(q.get("since")!) : null;
  const rows = await db.alert.findMany({
    where: { organizationId: ctx.orgId, ...(since && !isNaN(since.getTime()) ? { createdAt: { gte: since } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const people = showsPeople(ctx.mode);
  const scrub = (t: string) => (people ? t : t.replace(/\s+—\s+used by .*$/i, "").replace(EMAIL_RE, "[hidden]"));
  return apiJson({
    data: rows.map((a) => ({ id: a.id, kind: a.kind, severity: a.severity, title: scrub(a.title), body: scrub(a.body), href: a.href, createdAt: a.createdAt.toISOString(), read: !!a.readAt })),
  });
}

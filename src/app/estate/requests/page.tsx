import { currentSession } from "@/lib/auth";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/alerts";
import { previewRequests } from "@/lib/requests/preview";
import { notAllowedInUse } from "@/lib/access";
import RequestsView, { type RequestsTab } from "@/components/requests/RequestsView";

export const dynamic = "force-dynamic";

// Richieste di nuove AI: coda con anteprima per admin e owner, le proprie richieste per tutti.
export default async function RequestsPage({ searchParams }: { searchParams: { tab?: string; error?: string; sent?: string; decided?: string } }) {
  const orgId = currentOrgId();
  const s = currentSession();
  const email = (s?.email ?? "").toLowerCase();
  const isAdmin = s?.role === "ADMIN" || s?.role === "OWNER";
  const tab: RequestsTab = !isAdmin ? "mine" : searchParams.tab === "decided" || searchParams.tab === "mine" ? searchParams.tab : "waiting";

  const where =
    tab === "waiting"
      ? { organizationId: orgId, status: { in: ["REQUESTED", "NEEDS_INFO"] } }
      : tab === "decided"
        ? { organizationId: orgId, status: { in: ["APPROVED", "REJECTED"] } }
        : { organizationId: orgId, requesterEmail: email };
  const since = new Date(Date.now() - 30 * 86400000);
  const [rows, waiting, needsInfo, approved30, mine] = await Promise.all([
    db.aiRequest.findMany({ where, orderBy: tab === "waiting" ? { createdAt: "asc" } : { updatedAt: "desc" }, take: 200 }),
    isAdmin ? db.aiRequest.count({ where: { organizationId: orgId, status: "REQUESTED" } }) : 0,
    isAdmin ? db.aiRequest.count({ where: { organizationId: orgId, status: "NEEDS_INFO" } }) : 0,
    isAdmin ? db.aiRequest.count({ where: { organizationId: orgId, status: "APPROVED", decidedAt: { gte: since } } }) : 0,
    db.aiRequest.count({ where: { organizationId: orgId, requesterEmail: email } }),
  ]);
  const previews = isAdmin && tab === "waiting" ? await previewRequests(orgId, rows) : new Map();
  const nudges = new Map<string, { users: number; nudgedAt: Date | null }>();
  if (isAdmin && tab === "waiting" && rows.length) for (const a of await notAllowedInUse(orgId)) nudges.set(a.id, { users: a.users, nudgedAt: a.nudgedAt });

  return (
    <RequestsView
      tab={tab}
      isAdmin={isAdmin}
      rows={rows}
      previews={previews}
      nudges={nudges}
      counts={{ waiting, needsInfo, approved30, mine }}
      shareUrl={`${appUrl()}/estate/requests/new`}
      error={searchParams.error?.slice(0, 300)}
      sent={searchParams.sent === "1"}
      decided={searchParams.decided?.slice(0, 30) ?? null}
    />
  );
}

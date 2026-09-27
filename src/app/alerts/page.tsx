import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { PageHeader } from "@/components/ui";
import { fmtAgo } from "@/lib/format";
import { markAllAlertsReadAction, openAlertAction } from "@/lib/alert-actions";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { renewal: "Renewal", budget: "Budget", policy: "Policy", seats: "Seats", new_ai: "New AI", info: "Info" };
const SEV: Record<string, string> = { critical: "bg-alarm", warning: "bg-signal", info: "bg-ink-400/60" };

// Centro avvisi: tutto ciò che angar ha notato e richiede una decisione.
export default async function AlertsPage() {
  const orgId = currentOrgId();
  const alerts = await db.alert.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 200 });
  const unread = alerts.filter((a) => !a.readAt).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Alerts"
        subtitle="Renewals coming up, budgets running out, AI that isn't allowed, seats to free — checked every day."
        action={
          unread > 0 ? (
            <form action={markAllAlertsReadAction}>
              <button className="btn btn-secondary">Mark all as read</button>
            </form>
          ) : undefined
        }
      />
      {alerts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center">
          <h2 className="text-base font-semibold text-ink-100">Nothing needs your attention</h2>
          <p className="text-sm text-ink-400 mt-1 max-w-lg mx-auto">angar checks every morning for renewals in the next 14 days, budgets over 80%, AI that isn&apos;t allowed being used, and seats nobody needs. Alerts appear here and, if you connect Slack or Teams in Settings, there too.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-panel divide-y divide-line overflow-hidden">
          {alerts.map((a) => (
            <form key={a.id} action={openAlertAction}>
              <input type="hidden" name="id" value={a.id} />
              <button className={`w-full text-left flex items-start gap-4 px-5 py-4 transition-colors hover:bg-ink-100/[0.03] ${a.readAt ? "" : "bg-accent/[0.04]"}`}>
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${SEV[a.severity] ?? SEV.info}`} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className={`text-sm ${a.readAt ? "text-ink-100" : "text-ink-100 font-semibold"}`}>{a.title}</span>
                    <span className="text-[11px] text-ink-400 border border-line rounded-full px-2 py-0.5 shrink-0">{KIND[a.kind] ?? a.kind}</span>
                  </span>
                  <span className="block text-sm text-ink-400 mt-0.5">{a.body}</span>
                </span>
                <span className="text-xs text-ink-400 shrink-0 tabular">{fmtAgo(a.createdAt)}</span>
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

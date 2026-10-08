import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { PageHeader, StatCard } from "@/components/ui";
import { Insight } from "@/components/insight";
import AnomalyList, { loadAnomalyList } from "@/components/engine/AnomalyList";
import { fmtAgo } from "@/lib/format";
import { markAllAlertsReadAction, openAlertAction } from "@/lib/alert-actions";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { renewal: "Renewal", budget: "Budget", policy: "Policy", seats: "Seats", new_ai: "New AI", anomaly: "Anomaly", autopilot: "Autopilot", info: "Info", secret: "Exposed key", market: "AI market" };
// Dove si risolve ogni tipo di avviso.
const KIND_HREF: Record<string, { href: string; cta: string; noun: string }> = {
  renewal: { href: "/opportunities?view=contracts", cta: "See contracts", noun: "renewals" },
  budget: { href: "/budgets", cta: "Open budgets", noun: "budget alerts" },
  policy: { href: "/governance", cta: "Open governance", noun: "policy alerts" },
  seats: { href: "/usage?view=cleanup", cta: "Clean up seats", noun: "seat alerts" },
  new_ai: { href: "/review", cta: "Review new AI", noun: "new AI" },
  anomaly: { href: "/spend", cta: "Open spend", noun: "anomalies" },
  secret: { href: "/governance#exposed-keys", cta: "See exposed keys", noun: "exposed AI keys" },
  market: { href: "/market", cta: "See market changes", noun: "AI market changes" },
};
const DAY = 86400000;
const SEV: Record<string, string> = { critical: "bg-alarm", warning: "bg-signal", info: "bg-ink-400/60" };

// Centro avvisi: tutto ciò che angar ha notato e richiede una decisione.
export default async function AlertsPage() {
  const orgId = currentOrgId();
  const alerts = await db.alert.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 200 });
  const unread = alerts.filter((a) => !a.readAt).length;
  const anomalies = alerts.length ? (await loadAnomalyList(orgId)).anomalies : [];
  const critical = alerts.filter((a) => a.severity === "critical" && !a.readAt).length;
  const thisWeek = alerts.filter((a) => a.createdAt.getTime() >= Date.now() - 7 * DAY).length;
  const lastWeek = alerts.filter((a) => a.createdAt.getTime() < Date.now() - 7 * DAY && a.createdAt.getTime() >= Date.now() - 14 * DAY).length;
  // Il tipo di avviso non letto più frequente: è lì che conviene agire.
  const kinds = new Map<string, number>();
  for (const a of alerts) if (!a.readAt) kinds.set(a.kind, (kinds.get(a.kind) ?? 0) + 1);
  const topKind = [...kinds.entries()].filter(([k]) => KIND_HREF[k]).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader subtitle="What needs attention"
        title="Alerts"
        action={
          unread > 0 ? (
            <form action={markAllAlertsReadAction}>
              <button className="btn btn-secondary">Mark all as read</button>
            </form>
          ) : undefined
        }
      />
      {alerts.length > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard label="Unread" value={String(unread)} hint={unread ? `of ${alerts.length} alerts` : "You're up to date"} tone={unread ? "warn" : undefined} />
            <StatCard label="Critical, unread" value={String(critical)} hint={critical ? "Decide these first" : "Nothing critical"} tone={critical ? "alarm" : undefined} />
            <StatCard label="This week" value={String(thisWeek)} hint={lastWeek ? `${lastWeek} the week before` : "New in the last 7 days"} />
            <StatCard label="Anomalies now" value={String(anomalies.length)} hint={anomalies.length ? "Spend or usage out of the ordinary" : "Nothing unusual"} tone={anomalies.some((x) => x.severity === "critical") ? "alarm" : anomalies.length ? "signal" : undefined} />
          </div>
          {topKind && topKind[1] >= 2 && (
            <Insight tone="signal" href={KIND_HREF[topKind[0]].href} cta={KIND_HREF[topKind[0]].cta}>
              {topKind[1]} of your {unread} unread alerts are {KIND_HREF[topKind[0]].noun} — deal with them in one go.
            </Insight>
          )}
          {anomalies.length > 0 && <AnomalyList anomalies={anomalies} limit={5} />}
        </>
      )}
      {alerts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-panel p-10 text-center">
          <h2 className="text-base font-bold text-ink-100">Nothing needs your attention</h2>
          <p className="text-sm text-ink-400 mt-1 max-w-lg mx-auto">angar checks every morning for renewals in the next 14 days, budgets over 80%, AI that isn&apos;t allowed being used, and seats nobody needs. Alerts appear here and, if you connect Slack or Teams in Settings, there too.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-panel divide-y divide-line overflow-hidden animate-rise">
          {/* Intestazione: tutti gli avvisi e quanti da leggere (senza fascia grigia). */}
          <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
            <h2 className="font-bold text-ink-100">All alerts</h2>
            <span className="text-xs text-ink-400 tabular">{unread ? `${unread} unread` : `${alerts.length} read`}</span>
          </div>
          {alerts.map((a) => (
            <form key={a.id} action={openAlertAction}>
              <input type="hidden" name="id" value={a.id} />
              <button className={`w-full text-left flex items-start gap-4 px-5 py-4 transition-colors hover:bg-ink-100/[0.03] ${a.readAt ? "" : "bg-ink-100/[0.025]"}`}>
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${SEV[a.severity] ?? SEV.info}`} />
                <span className="flex-1 min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`text-sm ${a.readAt ? "text-ink-100" : "text-ink-100 font-semibold"}`}>{a.title}</span>
                    <span className="text-[10px] text-ink-400 border border-line rounded-[2px] px-1.5 py-0.5 font-mono uppercase tracking-[0.05em] shrink-0">{KIND[a.kind] ?? a.kind}</span>
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

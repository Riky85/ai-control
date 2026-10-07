import { fmtAgo, fmtDateTime } from "@/lib/format";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import FilterBar from "@/components/FilterBar";
import { PageHeader, StatCard, Table, td } from "@/components/ui";
import { Insight, TrendPanel, dailySeries } from "@/components/insight";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.login_failed": "Failed sign-in",
  "auth.logout": "Signed out",
  "auth.signup": "Account created",
  "connector.connect": "Connected a provider",
  "connector.disconnect": "Disconnected a provider",
  "connector.sync": "Synced a provider",
  "member.invite": "Invited a member",
  "member.role_change": "Changed a member's role",
  "member.remove": "Removed a member",
  "share.create": "Created a shared dashboard",
  "share.revoke": "Revoked a shared dashboard",
  "workspace.create": "Created a workspace",
  "workspace.switch": "Switched workspace",
  "workspace.rename": "Renamed a workspace",
};

const DAY = 86400000;

export default async function AuditPage({ searchParams }: { searchParams: { q?: string } }) {
  const s = await requireRole("ADMIN", "/");
  const q = searchParams.q?.trim();
  const rows = await db.auditLog.findMany({
    where: {
      organizationId: s.orgId,
      ...(q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { actorEmail: { contains: q, mode: "insensitive" } }, { target: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  // Riepilogo degli ultimi 30 giorni, indipendente dalla ricerca (solo date, azioni e chi).
  const since = new Date(Date.now() - 30 * DAY);
  const recent = await db.auditLog.findMany({
    where: { organizationId: s.orgId, createdAt: { gte: since } },
    select: { createdAt: true, action: true, actorEmail: true, ip: true },
    take: 20000,
  });
  const failed = recent.filter((r) => r.action === "auth.login_failed");
  const failedWeek = failed.filter((r) => r.createdAt.getTime() >= Date.now() - 7 * DAY);
  const actors = new Set(recent.map((r) => r.actorEmail).filter(Boolean)).size;
  const changes = recent.filter((r) => /^(member\.|connector\.(connect|disconnect)|share\.|workspace\.rename)/.test(r.action)).length;
  // L'indirizzo con più tentativi falliti (se sono tanti è un segnale da guardare).
  const byIp = new Map<string, number>();
  for (const r of failedWeek) if (r.ip) byIp.set(r.ip, (byIp.get(r.ip) ?? 0) + 1);
  const topIp = [...byIp.entries()].sort((a, b) => b[1] - a[1])[0];
  const { values, labels } = dailySeries(recent.map((r) => r.createdAt));
  const latest = rows[0] && !q ? rows[0] : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Audit log" subtitle="Entries can't be edited." />
      {recent.length > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Entries, 30 days" value={recent.length.toLocaleString("en-GB")} hint={latest ? `Latest ${fmtAgo(latest.createdAt)}` : "Everything recorded"} tone="accent" />
            <StatCard label="People active" value={String(actors)} hint="Signed in or changed something" />
            <StatCard label="Access changes" value={String(changes)} hint="Members, connections, shared links" />
            <StatCard label="Failed sign-ins" value={String(failed.length)} hint={failedWeek.length ? `${failedWeek.length} in the last 7 days` : "None this week"} tone={failedWeek.length >= 5 ? "alarm" : failedWeek.length ? "signal" : undefined} href="/audit?q=login_failed" />
          </div>
          <TrendPanel title="Entries each day" note="Last 30 days" values={values} labels={labels} unit=" entries" />
          {failedWeek.length >= 5 ? (
            <Insight tone="alarm" href="/account/security" cta="Review sign-in security">
              {failedWeek.length} failed sign-ins this week{topIp && topIp[1] >= 3 ? `, ${topIp[1]} from ${topIp[0]}` : ""} — consider two-step sign-in for every member.
            </Insight>
          ) : (
            <Insight tone="steady" href="/compliance/evidence" cta="Evidence pack">
              The log is chained with SHA-256 — any edit or deletion breaks the chain and shows up in the evidence pack.
            </Insight>
          )}
        </>
      )}
      <FilterBar search={{ placeholder: "Search action, person or target" }} right={`${rows.length} entries`} />
      <Table columns={["When", "Who", "What", "Target", "IP"]} empty={rows.length === 0 ? "Nothing recorded yet." : false}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className={`${td} tabular text-ink-400 whitespace-nowrap`}>{fmtDateTime(r.createdAt)}</td>
            <td className={`${td} text-ink-100`}>{r.actorEmail ?? "—"}</td>
            <td className={td}>
              <span className="text-ink-100">{LABEL[r.action] ?? r.action}</span>
              {!LABEL[r.action] && null}
              <span className="block text-xs text-ink-400 font-mono">{r.action}</span>
            </td>
            <td className={`${td} text-ink-400 max-w-[260px] truncate`}>{r.target ?? "—"}</td>
            <td className={`${td} text-ink-400 font-mono text-xs`}>{r.ip ?? "—"}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

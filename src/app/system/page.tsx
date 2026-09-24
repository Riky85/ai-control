import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { PageHeader, Panel, Table, td } from "@/components/ui";
import Badge from "@/components/Badge";
import { emailEnabled } from "@/lib/mail";
import { stripeEnabled } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  await requirePlatformAdmin();
  let dbOk = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  const [errors, backups, errors24h] = await Promise.all([
    db.errorEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.backupRun.findMany({ orderBy: { startedAt: "desc" }, take: 14 }),
    db.errorEvent.count({ where: { createdAt: { gt: new Date(Date.now() - 86400_000) } } }),
  ]);
  const lastOkBackup = backups.find((b) => b.status === "ok");
  const backupFresh = lastOkBackup && lastOkBackup.startedAt > new Date(Date.now() - 36 * 3600_000);

  const checks: [string, boolean, string][] = [
    ["Database", dbOk, dbOk ? "Reachable" : "Unreachable"],
    ["Sign-in sessions", Boolean(process.env.SESSION_SECRET), process.env.SESSION_SECRET ? "Signed sessions active" : "SESSION_SECRET missing"],
    ["Connector key encryption", Boolean(process.env.CREDENTIALS_SECRET), process.env.CREDENTIALS_SECRET ? "AES-256 at rest" : "CREDENTIALS_SECRET missing"],
    ["Backups", Boolean(backupFresh), lastOkBackup ? `Last good backup ${lastOkBackup.startedAt.toLocaleString()}` : "No successful backup yet"],
    ["Email (invites, password reset)", emailEnabled(), emailEnabled() ? "Sending via Resend" : "Not set up — needs RESEND_API_KEY and EMAIL_FROM"],
    ["Payments", stripeEnabled(), stripeEnabled() ? "Stripe connected" : "Not set up — needs Stripe keys"],
    ["Error tracking", true, `${errors24h} error${errors24h === 1 ? "" : "s"} in the last 24 h`],
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="System" subtitle="Health of the whole platform: configuration, backups and recorded errors. Platform administrator only." />

      <Panel title="Status">
        <div className="divide-y divide-line -mx-5 border-t border-line">
          {checks.map(([label, ok, detail]) => (
            <div key={label} className="flex items-center gap-4 px-5 py-3 text-sm">
              <span className="w-56 text-ink-100">{label}</span>
              <Badge>{ok ? "OK_STATUS" : "NEEDS_SETUP"}</Badge>
              <span className="text-ink-400">{detail}</span>
            </div>
          ))}
        </div>
      </Panel>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-ink-100">Backups</h2>
            <p className="text-sm text-ink-400">Full export of every table. It contains all workspaces' data — keep downloaded files somewhere safe.</p>
          </div>
          <a href="/api/backup/download" className="btn btn-secondary">Download full backup</a>
        </div>
        <Table columns={["Started", "Status", "Tables", "Rows", "Size", "Location"]} empty={backups.length === 0 ? "No backups have run yet." : false}>
          {backups.map((b) => (
            <tr key={b.id}>
              <td className={`${td} tabular text-ink-400`}>{b.startedAt.toLocaleString()}</td>
              <td className={td}><Badge>{b.status === "ok" ? "OK_STATUS" : b.status === "running" ? "RUNNING" : "FAILED_STATUS"}</Badge></td>
              <td className={`${td} tabular`}>{b.tables}</td>
              <td className={`${td} tabular`}>{b.rows.toLocaleString()}</td>
              <td className={`${td} tabular`}>{(b.bytes / 1024).toFixed(0)} KB</td>
              <td className={`${td} text-ink-400 font-mono text-xs truncate max-w-[260px]`}>{b.error ?? b.location ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </div>

      <div>
        <h2 className="text-base font-semibold text-ink-100 mb-3">Recent errors</h2>
        <Table columns={["When", "Where", "Message", "Page", "Reference"]} empty={errors.length === 0 ? "No errors recorded." : false}>
          {errors.map((e) => (
            <tr key={e.id}>
              <td className={`${td} tabular text-ink-400 whitespace-nowrap`}>{e.createdAt.toLocaleString()}</td>
              <td className={td}><Badge>{e.source === "server" ? "SERVER" : "BROWSER"}</Badge></td>
              <td className={`${td} text-ink-100 max-w-[420px]`}>
                <span className="block truncate" title={e.message}>{e.message}</span>
              </td>
              <td className={`${td} text-ink-400 font-mono text-xs`}>{e.path ?? "—"}</td>
              <td className={`${td} text-ink-400 font-mono text-xs`}>{e.digest ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}

import { fmtDateTime, fmtEur } from "@/lib/format";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { PageHeader, Panel, Table, td } from "@/components/ui";
import Badge from "@/components/Badge";
import { emailEnabled } from "@/lib/mail";
import { stripeEnabled } from "@/lib/stripe";
import { MODEL_LABEL, DEVICE_STATUSES } from "@/lib/edge/device-id";
import { setDeviceStatusAction } from "@/lib/edge-actions";
import DeviceBatchForm from "./DeviceBatchForm";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  await requirePlatformAdmin();
  let dbOk = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  const [errors, backups, errors24h, leads, jobs, deviceCounts, devices] = await Promise.all([
    db.errorEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.backupRun.findMany({ orderBy: { startedAt: "desc" }, take: 14 }),
    db.errorEvent.count({ where: { createdAt: { gt: new Date(Date.now() - 86400_000) } } }),
    db.lead.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.jobRun.findMany({ orderBy: { ranAt: "desc" }, take: 5 }),
    db.edgeDevice.groupBy({ by: ["status"], _count: { _all: true } }),
    db.edgeDevice.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, serial: true, model: true, status: true, batch: true, claimedAt: true, organization: { select: { name: true } }, sensor: { select: { name: true } } },
    }),
  ]);
  const devCount = (st: string) => deviceCounts.find((c) => c.status === st)?._count._all ?? 0;
  const lastOkBackup = backups.find((b) => b.status === "ok");
  const backupFresh = lastOkBackup && lastOkBackup.startedAt > new Date(Date.now() - 36 * 3600_000);

  const checks: [string, boolean, string][] = [
    ["Database", dbOk, dbOk ? "Reachable" : "Unreachable"],
    ["Sign-in sessions", Boolean(process.env.SESSION_SECRET), process.env.SESSION_SECRET ? "Signed sessions active" : "SESSION_SECRET missing"],
    ["Connector key encryption", Boolean(process.env.CREDENTIALS_SECRET), process.env.CREDENTIALS_SECRET ? "AES-256 at rest" : "CREDENTIALS_SECRET missing"],
    ["Backups", Boolean(backupFresh), lastOkBackup ? `Last good backup ${fmtDateTime(lastOkBackup.startedAt)}` : "No successful backup yet"],
    ["Email (invites, password reset)", emailEnabled(), emailEnabled() ? "Sending via Resend" : "Not set up — needs RESEND_API_KEY and EMAIL_FROM"],
    ["Payments", stripeEnabled(), stripeEnabled() ? "Stripe connected" : "Not set up — needs Stripe keys"],
    ["Microsoft / Google sign-in", Boolean(process.env.AUTH_MICROSOFT_CLIENT_ID || process.env.MS365_CLIENT_ID || process.env.AUTH_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID), process.env.AUTH_MICROSOFT_CLIENT_ID || process.env.MS365_CLIENT_ID || process.env.AUTH_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID ? "Buttons shown on sign-in" : "Hidden — needs AUTH_MICROSOFT_* or AUTH_GOOGLE_* keys"],
    ["Slack one-click buttons", Boolean(process.env.SLACK_SIGNING_SECRET && process.env.SLACK_BOT_TOKEN), process.env.SLACK_SIGNING_SECRET && process.env.SLACK_BOT_TOKEN ? "Active" : "Optional — links used instead (SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN)"],
    ["Error tracking", true, `${errors24h} error${errors24h === 1 ? "" : "s"} in the last 24 h`],
    ["Scheduler (alerts, costs, reports)", jobs.length > 0, jobs[0] ? `Last run: ${jobs[0].name} ${jobs[0].key} at ${fmtDateTime(jobs[0].ranAt)}` : "Waiting for the first daily run (after 7:00 Rome time)"],
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
              <td className={`${td} tabular text-ink-400`}>{fmtDateTime(b.startedAt)}</td>
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
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-semibold text-ink-100">angar devices</h2>
            <p className="text-sm text-ink-400">
              {DEVICE_STATUSES.map((st) => `${devCount(st)} ${st}`).join(" · ")}
              {process.env.EDGE_FACTORY_TOKEN ? " · factory API on" : " · factory API off (EDGE_FACTORY_TOKEN)"}
            </p>
          </div>
          <DeviceBatchForm />
        </div>
        <Table columns={["Serial", "Model", "Status", "Workspace", "Sensor", "Claimed", { label: "", className: "w-[1%]" }]} empty={devices.length === 0 ? "No devices yet — create a batch for the next shipment." : false}>
          {devices.map((d) => (
            <tr key={d.id}>
              <td className={`${td} font-mono text-ink-100 whitespace-nowrap`}>
                {d.serial}
                {d.batch && <div className="font-sans text-xs text-ink-400">{d.batch}</div>}
              </td>
              <td className={`${td} text-ink-400`}>{MODEL_LABEL[d.model] ?? d.model}</td>
              <td className={`${td} ${d.status === "claimed" ? "text-steady" : d.status === "retired" ? "text-alarm" : "text-ink-400"}`}>{d.status}</td>
              <td className={`${td} text-ink-100`}>{d.organization?.name ?? "—"}</td>
              <td className={`${td} text-ink-400`}>{d.sensor?.name ?? "—"}</td>
              <td className={`${td} tabular text-ink-400 whitespace-nowrap`}>{d.claimedAt ? fmtDateTime(d.claimedAt) : "—"}</td>
              <td className={`${td} whitespace-nowrap`}>
                <div className="flex gap-1">
                  {(d.status === "returned"
                    ? [["stock", "Restock"], ["retired", "Retire"]]
                    : d.status === "claimed"
                      ? [["returned", "Mark returned"], ["retired", "Retire"]]
                      : d.status === "stock"
                        ? [["retired", "Retire"]]
                        : []
                  ).map(([st, label]) => (
                    <form key={st} action={setDeviceStatusAction}>
                      <input type="hidden" name="deviceId" value={d.id} />
                      <input type="hidden" name="status" value={st} />
                      <button className={`btn btn-ghost btn-sm ${st === "retired" ? "text-alarm" : ""}`}>{label}</button>
                    </form>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </div>

      <div>
        <h2 className="text-base font-semibold text-ink-100 mb-3">Leads from the free AI spend check</h2>
        <Table columns={["When", "Email", "Company", { label: "AI", className: "text-right" }, { label: "Yearly spend", className: "text-right" }, { label: "Yearly savings", className: "text-right" }]} empty={leads.length === 0 ? "No leads yet — share /check." : false}>
          {leads.map((l) => (
            <tr key={l.id}>
              <td className={`${td} tabular text-ink-400 whitespace-nowrap`}>{fmtDateTime(l.createdAt)}</td>
              <td className={`${td} text-ink-100`}><a href={`mailto:${l.email}`} className="hover:underline">{l.email}</a></td>
              <td className={`${td} text-ink-400`}>{l.company ?? "—"}</td>
              <td className={`${td} text-right tabular`}>{l.aiCount ?? "—"}</td>
              <td className={`${td} text-right tabular`}>{l.annualSpend != null ? fmtEur(l.annualSpend) : "—"}</td>
              <td className={`${td} text-right tabular text-accent`}>{l.savings != null ? fmtEur(l.savings) : "—"}</td>
            </tr>
          ))}
        </Table>
      </div>

      <div>
        <h2 className="text-base font-semibold text-ink-100 mb-3">Recent errors</h2>
        <Table columns={["When", "Where", "Message", "Page", "Reference"]} empty={errors.length === 0 ? "No errors recorded." : false}>
          {errors.map((e) => (
            <tr key={e.id}>
              <td className={`${td} tabular text-ink-400 whitespace-nowrap`}>{fmtDateTime(e.createdAt)}</td>
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

import { fmtAgo, fmtDateTime, fmtEur } from "@/lib/format";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { PageHeader, Panel, StatCard, Table, Tabs, td } from "@/components/ui";
import { Insight } from "@/components/insight";
import Badge from "@/components/Badge";
import { emailEnabled, emailTransport } from "@/lib/mail";
import { euOnlyDeployment } from "@/lib/eu-only";
import { stripeEnabled } from "@/lib/stripe";
import { MODEL_LABEL, DEVICE_STATUSES } from "@/lib/edge/device-id";
import { setDeviceStatusAction } from "@/lib/edge-actions";
import DeviceBatchForm from "./DeviceBatchForm";

export const dynamic = "force-dynamic";

const LEAD_KINDS = [
  { key: "check", label: "Spend Check" },
  { key: "partner", label: "Partners" },
  { key: "pilot", label: "Pilot" },
] as const;
type LeadKind = (typeof LEAD_KINDS)[number]["key"];

export default async function SystemPage({ searchParams }: { searchParams: { leads?: string } }) {
  const leadKind: LeadKind = LEAD_KINDS.some((k) => k.key === searchParams.leads) ? (searchParams.leads as LeadKind) : "check";
  await requirePlatformAdmin();
  let dbOk = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  const [errors, backups, errors24h, leads, leadCounts, leads7, jobs, deviceCounts, devices] = await Promise.all([
    db.errorEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.backupRun.findMany({ orderBy: { startedAt: "desc" }, take: 14 }),
    db.errorEvent.count({ where: { createdAt: { gt: new Date(Date.now() - 86400_000) } } }),
    db.lead.findMany({ where: { kind: leadKind }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.lead.groupBy({ by: ["kind"], _count: { _all: true } }),
    db.lead.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } } }),
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
    ["Email (invites, password reset)", emailEnabled(), emailTransport() === "smtp" ? "Sending via SMTP (SMTP_URL)" : emailTransport() === "resend" ? "Sending via Resend" : euOnlyDeployment() ? "Not set up — EU-only mode needs SMTP_URL and EMAIL_FROM" : "Not set up — needs SMTP_URL or RESEND_API_KEY, and EMAIL_FROM"],
    ["EU-only mode", euOnlyDeployment(), euOnlyDeployment() ? "On — no AI answers, no Resend" : "Off — set ANGAR_EU_ONLY=1 and SMTP_URL to turn it on"],
    ["Payments", stripeEnabled(), stripeEnabled() ? "Stripe connected" : "Not set up — needs Stripe keys"],
    ["Microsoft / Google sign-in", Boolean(process.env.AUTH_MICROSOFT_CLIENT_ID || process.env.MS365_CLIENT_ID || process.env.AUTH_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID), process.env.AUTH_MICROSOFT_CLIENT_ID || process.env.MS365_CLIENT_ID || process.env.AUTH_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID ? "Buttons shown on sign-in" : "Hidden — needs AUTH_MICROSOFT_* or AUTH_GOOGLE_* keys"],
    ["Slack one-click buttons", Boolean(process.env.SLACK_SIGNING_SECRET && process.env.SLACK_BOT_TOKEN), process.env.SLACK_SIGNING_SECRET && process.env.SLACK_BOT_TOKEN ? "Active" : "Optional — links used instead (SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN)"],
    ["Error tracking", true, `${errors24h} error${errors24h === 1 ? "" : "s"} in the last 24 h`],
    ["Scheduler (alerts, costs, reports)", jobs.length > 0, jobs[0] ? `Last run: ${jobs[0].name} ${jobs[0].key} at ${fmtDateTime(jobs[0].ranAt)}` : "Waiting for the first daily run (after 7:00 Rome time)"],
  ];

  const okCount = checks.filter(([, ok]) => ok).length;
  // I controlli davvero critici (database, sessioni, cifratura, backup) prima di quelli opzionali.
  const critical = checks.slice(0, 4).find(([, ok]) => !ok);
  const leadCount = (k: string) => leadCounts.find((c) => c.kind === k)?._count._all ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="System" subtitle="Platform admins only." action={<a href="/system/catalog" className="btn btn-ghost btn-sm btn-go">Catalog freshness</a>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Checks passing" value={`${okCount}/${checks.length}`} hint={okCount === checks.length ? "Everything set up" : `${checks.length - okCount} need setup`} tone={critical ? "alarm" : okCount < checks.length ? "signal" : undefined} />
        <StatCard label="Errors, 24 h" value={String(errors24h)} hint={errors[0] ? `Last ${fmtAgo(errors[0].createdAt)}` : "None recorded"} tone={errors24h >= 10 ? "alarm" : errors24h ? "signal" : undefined} />
        <StatCard label="Last good backup" value={lastOkBackup ? fmtAgo(lastOkBackup.startedAt) : "—"} hint={lastOkBackup ? `${lastOkBackup.rows.toLocaleString()} rows` : "No successful backup yet"} tone={backupFresh ? undefined : "alarm"} />
        <StatCard label="Leads, 7 days" value={String(leads7)} hint={LEAD_KINDS.map((k) => `${leadCount(k.key)} ${k.label.toLowerCase()}`).join(" · ")} />
      </div>
      {critical ? (
        <Insight tone="alarm">
          <b className="font-medium">{critical[0]}</b>: {critical[2]}.
        </Insight>
      ) : errors24h >= 10 && errors[0] ? (
        <Insight tone="signal">
          {errors24h} errors in 24 h — latest on {errors[0].path ?? "an unknown page"}: {errors[0].message.slice(0, 120)}
        </Insight>
      ) : null}

      <Panel flush title="Status">
        <div className="divide-y divide-line">
          {checks.map(([label, ok, detail]) => (
            <div key={label} className="flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
              <span className="sm:w-56 shrink-0 text-ink-100">{label}</span>
              <Badge>{ok ? "OK_STATUS" : "NEEDS_SETUP"}</Badge>
              <span className="text-ink-400 min-w-0 w-full sm:w-auto">{detail}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Table title="Backups" note="Full export of every table. It contains all workspaces' data — keep downloaded files somewhere safe." action={<a href="/api/backup/download" className="btn btn-secondary btn-sm">Download full backup</a>} columns={["Started", "Status", "Tables", "Rows", "Size", "Location"]} empty={backups.length === 0 ? "No backups have run yet." : false}>
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

      <Table title="angar devices" note={`${DEVICE_STATUSES.map((st) => `${devCount(st)} ${st}`).join(" · ")}${process.env.EDGE_FACTORY_TOKEN ? " · factory API on" : " · factory API off (EDGE_FACTORY_TOKEN)"}`} action={<DeviceBatchForm />} columns={["Serial", "Model", "Status", "Workspace", "Sensor", "Claimed", { label: "", className: "w-[1%]" }]} empty={devices.length === 0 ? "No devices yet — create a batch for the next shipment." : false}>
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

      <Table
        id="leads"
        title="Leads"
        note={leadKind === "check" ? "From the free AI Spend Check (/check)." : leadKind === "partner" ? "Applications from /partners — accountants, tax advisers, MSPs." : "Applications from /pilot — companies for the 60-day pilot."}
        action={<Tabs active={leadKind} items={LEAD_KINDS.map((k) => ({ key: k.key, label: k.label, count: leadCount(k.key), href: `/system?leads=${k.key}#leads` }))} />}
        columns={
          leadKind === "check"
            ? ["When", "Email", "Company", { label: "AI", className: "text-right" }, { label: "Yearly spend", className: "text-right" }, { label: "Yearly savings", className: "text-right" }]
            : ["When", "Name", leadKind === "partner" ? "Firm" : "Company", "Email", "Country", ...(leadKind === "partner" ? [{ label: "Clients", className: "text-right" }] : []), "Phone", "Message"]
        }
        empty={leads.length === 0 ? (leadKind === "check" ? "No leads yet — share /check." : `No applications yet — share /${leadKind === "partner" ? "partners" : "pilot"}.`) : false}
      >
          {leads.map((l) =>
            leadKind === "check" ? (
              <tr key={l.id}>
                <td className={`${td} tabular text-ink-400 whitespace-nowrap`}>{fmtDateTime(l.createdAt)}</td>
                <td className={`${td} text-ink-100`}><a href={`mailto:${l.email}`} className="hover:underline">{l.email}</a></td>
                <td className={`${td} text-ink-400`}>{l.company ?? "—"}</td>
                <td className={`${td} text-right tabular`}>{l.aiCount ?? "—"}</td>
                <td className={`${td} text-right tabular`}>{l.annualSpend != null ? fmtEur(l.annualSpend) : "—"}</td>
                <td className={`${td} text-right tabular text-steady`}>{l.savings != null ? fmtEur(l.savings) : "—"}</td>
              </tr>
            ) : (
              <tr key={l.id}>
                <td className={`${td} tabular text-ink-400 whitespace-nowrap`}>{fmtDateTime(l.createdAt)}</td>
                <td className={`${td} text-ink-100 whitespace-nowrap`}>{l.name ?? "—"}</td>
                <td className={`${td} text-ink-100`}>{l.company ?? "—"}</td>
                <td className={td}><a href={`mailto:${l.email}`} className="text-ink-100 hover:underline">{l.email}</a></td>
                <td className={`${td} text-ink-400 font-mono text-xs`}>{l.country ?? "—"}</td>
                {leadKind === "partner" && <td className={`${td} text-right tabular`}>{l.clients ?? "—"}</td>}
                <td className={`${td} text-ink-400 whitespace-nowrap`}>{l.phone ? <a href={`tel:${l.phone}`} className="hover:underline">{l.phone}</a> : "—"}</td>
                <td className={`${td} text-ink-400 max-w-[320px]`}>
                  <span className="block truncate" title={l.message ?? undefined}>{l.message?.replace(/\n/g, " · ") ?? "—"}</span>
                </td>
              </tr>
            )
          )}
        </Table>

      <Table title="Recent errors" columns={["When", "Where", "Message", "Page", "Reference"]} empty={errors.length === 0 ? "No errors recorded." : false}>
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
  );
}

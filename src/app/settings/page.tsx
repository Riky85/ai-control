import { fmtDate } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import { resetWorkspaceDataAction, loadDemoDataAction } from "@/lib/test-data-actions";
import Badge from "@/components/Badge";
import Link from "next/link";
import { addUserAction } from "@/lib/actions";
import { setEmployeesAction } from "@/lib/spend-actions";
import { setIndustryAction, setChatWebhookAction, setPrivacyModeAction } from "@/lib/settings-actions";
import { erasePastNamesAction } from "@/lib/discovery/privacy-actions";
import { PRIVACY_MODES, privacyModeOf, showsPeople, MIN_GROUP } from "@/lib/privacy";
import { currentSession } from "@/lib/auth";
import { INDUSTRIES } from "@/lib/industries";
import { Notice } from "@/components/ui";
import { Panel, PageHeader } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";
import ThemeSelect from "@/components/ThemeSelect";
import SignInSecurityPanel from "@/components/SignInSecurityPanel";
import DevelopersPanel from "@/components/DevelopersPanel";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

const input = "field w-full";
const button = "btn btn-secondary btn-sm";

export default async function SettingsPage({ searchParams }: { searchParams: { error?: string; reset?: string; chat?: string; privacy?: string; signin?: string; webhook?: string } }) {
  const [org, users, connectors] = await Promise.all([
    db.organization.findUnique({ where: { id: currentOrgId() } }),
    db.user.findMany({ where: { organizationId: currentOrgId() }, orderBy: { name: "asc" } }),
    db.connector.findMany({ where: { organizationId: currentOrgId(), status: "CONNECTED" } }),
  ]);
  const encryptionOn = Boolean(process.env.CREDENTIALS_SECRET);
  const privacy = privacyModeOf(org);
  const role = currentSession()?.role;
  const canSetPrivacy = role === "ADMIN" || role === "OWNER";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" subtitle="Your organization, team and connections." />

      <div className="grid grid-cols-3 gap-4 items-start">
        <div className="col-span-2 flex flex-col gap-4">
          <Panel title="People" subtitle={`${users.length} ${users.length === 1 ? "person" : "people"} — added automatically from company accounts and provider keys`}>
            {!showsPeople(privacy) ? (
              <div className="mb-4">
                <Notice>
                  Names are hidden: employee privacy is set to <b>{PRIVACY_MODES.find((m) => m.id === privacy)!.label.toLowerCase()}</b>. <a href="#privacy" className="underline">Change it below</a>.
                </Notice>
              </div>
            ) : (
            <div className="divide-y divide-line -mx-5 border-y border-line mb-4">
              {users.map((u) => (
                <Link key={u.id} href={`/people/${u.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-ink-100/[0.02] transition-colors">
                  <span className="h-7 w-7 rounded-full bg-accent-soft text-accent text-xs font-semibold flex items-center justify-center shrink-0">
                    {(u.name ?? u.email).charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-ink-100 truncate">{u.name ?? u.email}</span>
                    <span className="block text-xs text-ink-400 truncate">{u.email}</span>
                  </span>
                  <span className="text-xs text-ink-400">{u.department ?? ""}</span>
                </Link>
              ))}
              {users.length === 0 && <p className="px-5 py-3 text-sm text-ink-400">No people yet.</p>}
            </div>
            )}
            <details>
              <summary className="cursor-pointer list-none text-sm text-ink-400 hover:text-ink-100 select-none">Add someone by hand (optional)</summary>
              <form action={addUserAction} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 mt-3">
                <input name="email" type="email" required placeholder="Email" className={input} />
                <input name="name" placeholder="Name" className={input} />
                <input name="department" placeholder="Department" className={input} />
                <button className="btn btn-secondary btn-sm">Add</button>
              </form>
            </details>
          </Panel>

          <div id="privacy" className="scroll-mt-6">
            <Panel
              title="Employee privacy"
              subtitle="How much angar shows about the people who use AI. Built for Statuto dei lavoratori art. 4 (Italy), works councils (§87 BetrVG, Germany) and GDPR."
              action={<Link href="/compliance/employee-notice" className={button}>Employee notice</Link>}
            >
              {searchParams.privacy === "ok" && <div className="mb-3"><Notice tone="success">Privacy mode changed — every page, export and report now follows it.</Notice></div>}
              <form action={setPrivacyModeAction} className="flex flex-col gap-3">
                <fieldset disabled={!canSetPrivacy} className="flex flex-col gap-2">
                  {PRIVACY_MODES.map((m) => (
                    <label key={m.id} className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${privacy === m.id ? "border-accent bg-accent/[0.04]" : "border-line hover:border-ink-400"}`}>
                      <input type="radio" name="mode" value={m.id} defaultChecked={privacy === m.id} className="mt-1 accent-accent" />
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-ink-100">{m.label}{m.id === "individual" && <span className="ml-2 text-xs font-normal text-ink-400">default</span>}</span>
                        <span className="block text-xs text-ink-400 mt-0.5">{PRIVACY_DETAIL[m.id]}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <div className="flex items-center gap-3">
                  <button className="btn btn-primary btn-sm" disabled={!canSetPrivacy}>Save privacy mode</button>
                  <span className="text-xs text-ink-400">{canSetPrivacy ? "Changes are recorded in the audit log." : "Only admins and owners can change this."}</span>
                </div>
              </form>
              <p className="text-xs text-ink-400 mt-3">
                angar never records what people type, read or generate in an AI tool — only which AI tools are used, when and how much. Hand out the <Link href="/compliance/employee-notice" className="underline hover:text-ink-100">employee notice</Link> before you start.
              </p>
              <p className="text-xs text-ink-400 mt-2">
                Outside per-person mode, new data is stored without emails or names (only a pseudonym, and the department in per-department mode). A change applies from now on — data already collected keeps its names until you erase them.
              </p>
              {searchParams.privacy === "erased" && <div className="mt-3"><Notice tone="success">Names and emails were removed from past data.</Notice></div>}
              {!showsPeople(privacy) && role === "OWNER" && (
                <form action={erasePastNamesAction} className="mt-3 flex items-center gap-3 border-t border-line pt-3">
                  <button className="btn btn-secondary btn-sm">Erase names from past data</button>
                  <span className="text-xs text-ink-400">Replaces emails and names in past activity with pseudonyms. Workspace members and AI owners stay. Can&apos;t be undone.</span>
                </form>
              )}
            </Panel>
          </div>

          <Panel
            title="Sources"
            subtitle={connectors.length ? `${connectors.length} provider${connectors.length === 1 ? "" : "s"} connected` : "Nothing connected yet"}
            action={<Link href="/sources" className={button}>Manage</Link>}
          >
            <div className="flex flex-wrap gap-2">
              {connectors.map((c) => (
                <span key={c.id} className="flex items-center gap-2 border border-line rounded-lg pl-1 pr-3 py-1 text-xs text-ink-100">
                  <VendorBadge vendor={c.provider} size={24} />
                  {c.provider.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase())}
                </span>
              ))}
              {connectors.length === 0 && <p className="text-sm text-ink-400">Connect a provider to start discovering your AI.</p>}
            </div>
          </Panel>

          <DevelopersPanel orgId={currentOrgId()} canEdit={canSetPrivacy} webhookStatus={searchParams.webhook} />
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Appearance" subtitle="Light, dark, or follow your system">
            <ThemeSelect initial={parseTheme(cookies().get(THEME_COOKIE)?.value)} />
          </Panel>

          <Panel title="Organization">
            <dl className="text-sm flex flex-col gap-2.5">
              <Row label="Name" value={org?.name ?? "—"} />
              <Row label="Country" value={org?.country ?? "—"} />
              <Row label="Created" value={org ? fmtDate(org.createdAt) : "—"} />
            </dl>
            <form action={setEmployeesAction} className="flex items-end gap-2 mt-4 pt-4 border-t border-line">
              <label className="flex-1 flex flex-col gap-1.5 text-sm text-ink-400">
                Employees
                <input id="employees" name="employees" type="number" min="1" defaultValue={org?.employees ?? ""} placeholder="e.g. 120" className={input} />
              </label>
              <button className={button}>Save</button>
            </form>
            <form action={setIndustryAction} className="flex items-end gap-2 mt-3">
              <label className="flex-1 flex flex-col gap-1.5 text-sm text-ink-400">
                Industry
                <select name="industry" defaultValue={org?.industry ?? ""} className={input}>
                  <option value="">Not set</option>
                  {INDUSTRIES.map((i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
              </label>
              <button className={button}>Save</button>
            </form>
            <p className="text-xs text-ink-400 mt-2">Employees and industry power AI spend per employee and the anonymous benchmark with similar companies.</p>
          </Panel>

          <Panel title="Slack or Microsoft Teams" subtitle={org?.chatWebhookEncrypted ? "Connected — weekly summary on Mondays + alerts" : "Get the weekly summary and alerts in your team chat"}>
            {searchParams.chat === "ok" && <div className="mb-3"><Notice tone="success">Connected — a test message was sent.</Notice></div>}
            <form action={setChatWebhookAction} className="flex flex-col gap-2">
              <input name="url" type="url" placeholder={org?.chatWebhookEncrypted ? "Connected — paste a new URL to change it" : "https://hooks.slack.com/services/…"} className={input} />
              <div className="flex items-center gap-2">
                <button className={button}>{org?.chatWebhookEncrypted ? "Update" : "Connect"}</button>
                {org?.chatWebhookEncrypted && (
                  <button name="url" value="" className="btn btn-ghost btn-sm">Disconnect</button>
                )}
              </div>
            </form>
            <p className="text-xs text-ink-400 mt-2">Slack: Apps → Incoming Webhooks → Add to a channel. Teams: channel → Workflows → &ldquo;Post to a channel when a webhook request is received&rdquo;. Paste the URL here.</p>
            <details className="mt-2">
              <summary className="cursor-pointer list-none text-xs text-ink-400 hover:text-ink-100 select-none">Approve / Keep buttons in Slack and Teams</summary>
              <div className="text-xs text-ink-400 mt-2 flex flex-col gap-1.5">
                <p><b className="text-ink-100">Teams:</b> &ldquo;New AI found&rdquo; cards have Approve / Not allowed buttons. They open angar, where you confirm signed in (editor or higher). Links expire in 7 days. Nothing to set up.</p>
                <p><b className="text-ink-100">Slack:</b> without the angar Slack app, buttons work the same way as in Teams. For one-click buttons inside Slack, the platform admin creates a Slack app: Interactivity → Request URL <span className="font-mono">{process.env.APP_URL ?? ""}/api/slack/interactions</span>; bot scopes <span className="font-mono">users:read</span>, <span className="font-mono">users:read.email</span>, <span className="font-mono">chat:write</span>; sets <span className="font-mono">SLACK_SIGNING_SECRET</span> and <span className="font-mono">SLACK_BOT_TOKEN</span>; then you add the incoming webhook of that app here. Slack users are matched to angar members by email. The bot also asks inactive people &ldquo;Do you still need your seat?&rdquo; in a direct message.</p>
                <p>Status: {process.env.SLACK_SIGNING_SECRET ? "Slack interactivity on" : "Slack interactivity off (link buttons)"}{process.env.SLACK_BOT_TOKEN ? " · Slack bot on" : ""}.</p>
              </div>
            </details>
          </Panel>

          <Panel title="Security">
            <dl className="text-sm flex flex-col gap-2.5">
              <Row label="Connector keys" badge={encryptionOn ? "ENCRYPTED" : "NOT_CONFIGURED"} />
              <Row label="Access" badge="READ_ONLY" />
              <Row label="Sign-in" badge="PASSWORD_AUTH" />
              <Row label="Audit log" badge="AUDIT_ON" />
            </dl>
          </Panel>

          <SignInSecurityPanel message={searchParams.signin} />

        </div>
      </div>

      <div id="test-data" className="rounded-xl border border-alarm/30 bg-panel p-5 scroll-mt-6">
        <h2 className="text-base font-semibold text-ink-100">Test data</h2>
        <p className="text-sm text-ink-400 mt-0.5 mb-4">
          Start this workspace from scratch to try the platform with your own AI, or load the sample data. Owners only.
        </p>
        {searchParams.reset && <p className="text-sm text-steady mb-4">Workspace data reset — it's empty now. Drop a bank statement on Overview to start.</p>}
        <div className="grid grid-cols-2 gap-6">
          <form action={resetWorkspaceDataAction} className="flex flex-col gap-2">
            <div className="text-sm font-medium text-ink-100">Reset workspace data</div>
            <p className="text-xs text-ink-400">
              Deletes AI systems (with costs, alternatives, risk, activity and changes), people, data sources, policies, evidence and connections with their saved keys. Accounts, members, plan and audit log stay. This can't be undone.
            </p>
            <div className="flex gap-2 mt-1">
              <input name="confirm" required autoComplete="off" placeholder={`Type "${org?.name ?? ""}" to confirm`} className="field flex-1 min-w-0 focus:border-alarm" />
              <button className="btn btn-danger">Reset</button>
            </div>
          </form>
          <form action={loadDemoDataAction} className="flex flex-col gap-2">
            <div className="text-sm font-medium text-ink-100">Load demo data</div>
            <p className="text-xs text-ink-400">
              Adds the Demo Manufacturing example: 4 AI systems, people, data sources, a cost, a model change and an alternative — useful to see every page filled in.
            </p>
            <button className="btn btn-secondary self-start mt-1">Load demo data</button>
          </form>
        </div>
      </div>
    </div>
  );
}

const PRIVACY_DETAIL: Record<string, string> = {
  individual: "Names, emails and devices of the people using each AI. Needed for seat clean-up (asking inactive people if they still need a paid seat). In Italy and Germany use it only with a works-council / union agreement or after the employee notice.",
  department: `Usage only as totals per department, and only for groups of at least ${MIN_GROUP} people — smaller teams are merged into "Other (small teams)". No names, emails or devices anywhere, including exports and reports. Seat reminders are switched off.`,
  anonymous: "Only company-wide totals: how many people use AI and which tools. No names, no devices, no departments. The strictest option — good while an agreement with the works council is pending.",
};

function Row({ label, value, badge }: { label: string; value?: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-400">{label}</dt>
      <dd className="text-ink-100">{badge ? <Badge>{badge}</Badge> : value}</dd>
    </div>
  );
}

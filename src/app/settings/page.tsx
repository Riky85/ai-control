import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { currentSession } from "@/lib/auth";
import Link from "next/link";
import { resetWorkspaceDataAction, loadDemoDataAction } from "@/lib/test-data-actions";
import { addUserAction } from "@/lib/actions";
import { setEmployeesAction } from "@/lib/spend-actions";
import { setIndustryAction, setChatWebhookAction, setPrivacyModeAction } from "@/lib/settings-actions";
import { saveJiraAction, saveServiceNowAction, disconnectTicketingAction, testTicketAction } from "@/lib/ticketing-actions";
import { decryptJson } from "@/lib/crypto";
import type { JiraConfig, ServiceNowConfig } from "@/lib/ticketing";
import { fmtAgo } from "@/lib/format";
import { erasePastNamesAction } from "@/lib/discovery/privacy-actions";
import { PRIVACY_MODES, privacyModeOf, showsPeople } from "@/lib/privacy";
import { INDUSTRIES } from "@/lib/industries";
import { Notice, PageHeader, Tabs } from "@/components/ui";
import { Row, Section, Status } from "@/components/SettingsRows";
import { VendorBadge } from "@/components/VendorIcon";
import ThemeSelect from "@/components/ThemeSelect";
import SignInSecurityPanel from "@/components/SignInSecurityPanel";
import DevelopersPanel from "@/components/DevelopersPanel";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import VoiceSetting from "@/components/VoiceSetting";
import { VOICE_COOKIE, parseVoiceMode } from "@/lib/voice";

export const dynamic = "force-dynamic";

type Tab = "general" | "privacy" | "security" | "integrations" | "data";
const TABS: { key: Tab; label: string }[] = [
  { key: "general", label: "General" },
  { key: "privacy", label: "Privacy" },
  { key: "security", label: "Security" },
  { key: "integrations", label: "Integrations" },
  { key: "data", label: "Data" },
];

// Impostazioni a schede: ogni scheda è una colonna di righe "etichetta · controllo",
// poche parole, un blocco per argomento.
export default async function SettingsPage({ searchParams }: { searchParams: { tab?: string; reset?: string; chat?: string; privacy?: string; signin?: string; webhook?: string; error?: string; ticket?: string; key?: string } }) {
  const orgId = currentOrgId();
  // Vecchi link senza scheda: si apre quella giusta dal parametro.
  const tab: Tab = (TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab : searchParams.privacy ? "privacy" : searchParams.signin ? "security" : searchParams.chat || searchParams.webhook || searchParams.ticket ? "integrations" : searchParams.reset ? "data" : "general") as Tab;
  const [org, userCount, allConnectors] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    db.user.count({ where: { organizationId: orgId } }),
    db.connector.findMany({ where: { organizationId: orgId, status: "CONNECTED" } }),
  ]);
  // Jira / ServiceNow sono destinazioni dei ticket, non fonti di dati.
  const connectors = allConnectors.filter((c) => c.provider !== "JIRA" && c.provider !== "SERVICENOW");
  const jiraRow = allConnectors.find((c) => c.provider === "JIRA" && c.credentialsEncrypted);
  const snowRow = allConnectors.find((c) => c.provider === "SERVICENOW" && c.credentialsEncrypted);
  const privacy = privacyModeOf(org);
  const role = currentSession()?.role;
  const isAdmin = role === "ADMIN" || role === "OWNER";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" />
      <Tabs active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/settings?tab=${t.key}` }))} />

      {tab === "general" && (
        <>
          <Section title="Company">
            <Row title="Organization" hint={org?.country ? `Country: ${org.country}` : undefined}>
              <span className="text-sm text-ink-100">{org?.name ?? "—"}</span>
            </Row>
            <Row title="Employees" hint="To show AI spend for each employee." id="employees">
              <form action={setEmployeesAction} className="flex gap-2">
                <input name="employees" type="number" min="1" defaultValue={org?.employees ?? ""} placeholder="e.g. 120" aria-label="Employees" className="field w-32" />
                <button className="btn btn-secondary btn-sm">Save</button>
              </form>
            </Row>
            <Row title="Industry" hint="Compares you with similar companies.">
              <form action={setIndustryAction} className="flex gap-2 w-full max-w-xs md:w-auto">
                <select name="industry" defaultValue={org?.industry ?? ""} aria-label="Industry" className="field flex-1 min-w-0 md:w-56">
                  <option value="">Not set</option>
                  {INDUSTRIES.map((i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
                <button className="btn btn-secondary btn-sm">Save</button>
              </form>
            </Row>
            <Row title="People" hint="Added from company accounts and provider keys.">
              <Link href="/people" className="btn btn-secondary btn-sm">{userCount} {userCount === 1 ? "person" : "people"} →</Link>
              <details className="relative">
                <summary className="btn btn-secondary btn-sm list-none cursor-pointer">Add by hand</summary>
                <form action={addUserAction} className="absolute left-0 md:left-auto md:right-0 z-20 mt-2 w-72 max-w-[calc(100vw-3rem)] rounded-xl border border-line bg-panel p-3 shadow-card flex flex-col gap-2">
                  <input name="email" type="email" required placeholder="Email" className="field" />
                  <input name="name" placeholder="Name" className="field" />
                  <input name="department" placeholder="Department" className="field" />
                  <button className="btn btn-primary btn-sm">Add</button>
                </form>
              </details>
            </Row>
          </Section>
          <Section title="Preferences">
            <Row title="Appearance">
              <ThemeSelect initial={parseTheme(cookies().get(THEME_COOKIE)?.value)} />
            </Row>
            {/* Comandi vocali in pausa: la riga torna solo con NEXT_PUBLIC_ANGAR_VOICE=1. */}
            {process.env.NEXT_PUBLIC_ANGAR_VOICE === "1" && (
              <Row title="Voice" hint="Speak to angar anywhere in the platform.">
                <VoiceSetting initial={parseVoiceMode(cookies().get(VOICE_COOKIE)?.value)} />
              </Row>
            )}
          </Section>
        </>
      )}

      {tab === "privacy" && (
        <>
          {searchParams.privacy === "ok" && <Notice tone="success">Privacy mode changed — pages, exports and reports follow it from now on.</Notice>}
          {searchParams.privacy === "erased" && <Notice tone="success">Names and emails were removed from past data.</Notice>}
          <Section title="Privacy" action={!isAdmin ? "Admins only" : undefined}>
            <Row title="Employee privacy" hint="What angar shows about people. Never what they type." id="privacy">
              <form action={setPrivacyModeAction} className="flex flex-col gap-2 w-full max-w-md">
                <fieldset disabled={!isAdmin} className="flex flex-col gap-1.5">
                  {PRIVACY_MODES.map((m) => (
                    <label key={m.id} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${privacy === m.id ? "border-ink-400 bg-ink-100/[0.04]" : "border-line hover:border-ink-400"}`}>
                      <input type="radio" name="mode" value={m.id} defaultChecked={privacy === m.id} className="mt-1 accent-accent" />
                      <span>
                        <span className="block text-sm text-ink-100">{m.label}</span>
                        <span className="block text-xs text-ink-400">{m.description}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <p className="text-xs text-ink-400 leading-relaxed">
                  New workspaces start <span className="text-ink-100">By department</span>. Before switching to <span className="text-ink-100">By person</span>, give staff the employee notice — and in Italy, Germany, France and Spain, agree it with the works council or unions first (templates in the{" "}
                  <Link href="/trust#documents" className="underline hover:text-ink-100">Trust Center</Link>).
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button className="btn btn-secondary btn-sm" disabled={!isAdmin}>Save</button>
                </div>
              </form>
            </Row>
            <Row title="Employee notice" hint="Hand it out before you start (EN · IT · DE · FR · ES).">
              <Link href="/compliance/employee-notice" className="btn btn-secondary btn-sm">Open →</Link>
            </Row>
            <Row title="Trust Center" hint="Where data lives, sub-processors, DPA and agreement templates.">
              <Link href="/trust" className="btn btn-secondary btn-sm">How we protect your data →</Link>
            </Row>
            {!showsPeople(privacy) && role === "OWNER" && (
              <Row title="Past data" hint="Swap names already collected for pseudonyms. Can't be undone.">
                <form action={erasePastNamesAction}>
                  <button className="btn btn-danger btn-sm">Erase names</button>
                </form>
              </Row>
            )}
          </Section>
        </>
      )}

      {tab === "security" && (
        <>
          <SignInSecurityPanel message={searchParams.signin} />
          <Section title="Data protection">
            <Row title="Connector keys">
              <Status on={Boolean(process.env.CREDENTIALS_SECRET)} yes="Encrypted" no="Not configured" />
            </Row>
            <Row title="Access to your tools" hint="Except seat removals you start.">
              <Status on yes="Read-only" />
            </Row>
            <Row title="Audit log" hint="Every change, tamper-evident.">
              <Link href="/audit" className="btn btn-secondary btn-sm">Open →</Link>
            </Row>
          </Section>
        </>
      )}

      {tab === "integrations" && (
        <>
          {searchParams.chat === "ok" && <Notice tone="success">Connected — a test message was sent.</Notice>}
          {searchParams.chat === "off" && <Notice tone="success">Slack or Teams disconnected.</Notice>}
          {searchParams.ticket === "jira-connected" && <Notice tone="success">Jira connected — send a test ticket to check where it lands.</Notice>}
          {searchParams.ticket === "servicenow-connected" && <Notice tone="success">ServiceNow connected — send a test ticket to check where it lands.</Notice>}
          {searchParams.ticket === "test" && <Notice tone="success">Test ticket {searchParams.key ? <b className="font-medium">{searchParams.key}</b> : null} created.</Notice>}
          {searchParams.ticket === "off" && <Notice tone="success">Ticketing disconnected.</Notice>}
          <Section title="Connections">
            <Row title="Sources" hint={connectors.length ? `${connectors.length} connected` : "Nothing connected yet"}>
              {connectors.slice(0, 6).map((c) => (
                <span key={c.id} title={c.provider} className="rounded-lg border border-line p-1">
                  <VendorBadge vendor={c.provider} size={22} />
                </span>
              ))}
              <Link href="/sources" className="btn btn-secondary btn-sm">{connectors.length ? "Manage →" : "Connect →"}</Link>
            </Row>
            <Row
              title="Slack or Teams"
              hint={
                <details>
                  <summary className="cursor-pointer list-none hover:text-ink-100 select-none">{org?.chatWebhookEncrypted ? "Weekly summary on Mondays + alerts." : "Weekly summary and alerts."} <span className="underline">How?</span></summary>
                  <div className="mt-2 flex flex-col gap-1.5">
                    <p><b className="text-ink-100">Slack:</b> Apps → Incoming Webhooks → Add to a channel.</p>
                    <p><b className="text-ink-100">Teams:</b> channel → Workflows → &ldquo;Post to a channel when a webhook request is received&rdquo;.</p>
                    <p>Buttons inside Slack need the angar Slack app: Interactivity URL <span className="font-mono break-all">{process.env.APP_URL ?? ""}/api/slack/interactions</span>, <span className="font-mono">SLACK_SIGNING_SECRET</span>, <span className="font-mono">SLACK_BOT_TOKEN</span>.</p>
                  </div>
                </details>
              }
            >
              <form action={setChatWebhookAction} className="flex gap-2 w-full max-w-md">
                <input name="url" type="url" aria-label="Webhook URL" placeholder={org?.chatWebhookEncrypted ? "Connected — paste a new URL" : "Incoming webhook URL"} className="field flex-1 min-w-0" />
                <button className="btn btn-secondary btn-sm">{org?.chatWebhookEncrypted ? "Update" : "Connect"}</button>
                {org?.chatWebhookEncrypted && <button name="url" value="" formNoValidate className="btn btn-secondary btn-sm">Disconnect</button>}
              </form>
            </Row>
          </Section>
          <TicketsSection
            isAdmin={isAdmin}
            jira={jiraRow ? { cfg: decryptJson<JiraConfig>(jiraRow.credentialsEncrypted), lastSyncedAt: jiraRow.lastSyncedAt, lastSyncError: jiraRow.lastSyncError } : null}
            snow={snowRow ? { cfg: decryptJson<ServiceNowConfig>(snowRow.credentialsEncrypted), lastSyncedAt: snowRow.lastSyncedAt, lastSyncError: snowRow.lastSyncError } : null}
          />
          <DevelopersPanel orgId={orgId} canEdit={isAdmin} webhookStatus={searchParams.webhook} />
        </>
      )}

      {tab === "data" && (
        <>
          {searchParams.reset && <Notice tone="success">Workspace data reset — drop a bank statement on Overview to start again.</Notice>}
          <Section title="Workspace data" id="test-data">
            <Row title="Demo data" hint="Fills every page with an example company. Owners only.">
              <form action={loadDemoDataAction}>
                <button className="btn btn-secondary btn-sm">Load demo data</button>
              </form>
            </Row>
            <Row title="Reset workspace" hint="Keeps only members, plan and audit log. Owners only.">
              <form action={resetWorkspaceDataAction} className="flex gap-2 w-full max-w-md">
                <input name="confirm" required autoComplete="off" aria-label="Organization name" placeholder={`Type "${org?.name ?? ""}"`} className="field flex-1 min-w-0 focus:border-alarm" />
                <button className="btn btn-danger btn-sm">Reset</button>
              </form>
            </Row>
          </Section>
        </>
      )}
    </div>
  );
}

type TicketRow<T> = { cfg: T | null; lastSyncedAt: Date | null; lastSyncError: string | null } | null;

/** Ticket in Jira / ServiceNow: stato, modulo di collegamento (a scomparsa), prova, scollega. */
function TicketsSection({ isAdmin, jira, snow }: { isAdmin: boolean; jira: TicketRow<JiraConfig>; snow: TicketRow<ServiceNowConfig> }) {
  const status = (r: TicketRow<unknown>, where: string) =>
    r ? (r.lastSyncError ? <span className="text-alarm">Last ticket failed: {r.lastSyncError}</span> : r.lastSyncedAt ? `Connected · last ticket ${fmtAgo(r.lastSyncedAt)}` : `Connected · ${where}`) : "Not connected";
  const pill = (on: boolean) => (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${on ? "text-steady bg-steady/10" : "text-ink-400 bg-ink-100/[0.06]"}`}>{on ? "On" : "Off"}</span>
  );
  const actions = (provider: "JIRA" | "SERVICENOW") => (
    <>
      <form action={testTicketAction}>
        <input type="hidden" name="provider" value={provider} />
        <button className="btn btn-secondary btn-sm" disabled={!isAdmin}>Send test ticket</button>
      </form>
      <form action={disconnectTicketingAction}>
        <input type="hidden" name="provider" value={provider} />
        <button className="btn btn-secondary btn-sm" disabled={!isAdmin}>Disconnect</button>
      </form>
    </>
  );
  const panel = "absolute left-0 md:left-auto md:right-0 z-20 mt-2 w-80 max-w-[calc(100vw-3rem)] rounded-xl border border-line bg-panel p-3 shadow-card flex flex-col gap-2";
  return (
    <Section title="Tickets" id="tickets" action={!isAdmin ? "Admins only" : undefined}>
      <Row title="What opens a ticket" hint="One ticket for each alert, never twice.">
        <span className="text-xs text-ink-400 md:text-right">AI not allowed but in use · spend anomalies · leaked AI keys — warning or critical</span>
      </Row>
      <Row title={<span className="inline-flex items-center gap-2">Jira {pill(!!jira)}</span>} hint={jira?.cfg ? <>{status(jira, `project ${jira.cfg.projectKey}`)}</> : "Jira Cloud · REST API"}>
        <details className="relative">
          <summary className="btn btn-secondary btn-sm list-none cursor-pointer">{jira ? "Edit" : "Connect"}</summary>
          <form action={saveJiraAction} className={panel}>
            <fieldset disabled={!isAdmin} className="flex flex-col gap-2">
              <input name="site" required defaultValue={jira?.cfg?.site ?? ""} placeholder="https://yourcompany.atlassian.net" aria-label="Jira site" className="field" />
              <input name="email" type="email" required defaultValue={jira?.cfg?.email ?? ""} placeholder="Email of the Jira user" aria-label="Jira user email" className="field" />
              <input name="apiToken" type="password" autoComplete="off" required={!jira} placeholder={jira ? "API token — leave empty to keep" : "API token"} aria-label="Jira API token" className="field" />
              <div className="flex gap-2">
                <input name="projectKey" required defaultValue={jira?.cfg?.projectKey ?? ""} placeholder="Project key, e.g. IT" aria-label="Jira project key" className="field flex-1 min-w-0 uppercase" />
                <input name="issueType" defaultValue={jira?.cfg?.issueType ?? "Task"} placeholder="Task" aria-label="Issue type" className="field w-24" />
              </div>
              <button className="btn btn-primary btn-sm">{jira ? "Save" : "Connect"}</button>
              <p className="text-[11px] text-ink-400">Token from id.atlassian.com → Security → API tokens. angar checks it before saving and stores it encrypted.</p>
            </fieldset>
          </form>
        </details>
        {/* Prima il modulo: su mobile il menu si apre da sinistra senza uscire dallo schermo */}
        {jira && actions("JIRA")}
      </Row>
      <Row title={<span className="inline-flex items-center gap-2">ServiceNow {pill(!!snow)}</span>} hint={snow?.cfg ? <>{status(snow, snow.cfg.assignmentGroup ? `group ${snow.cfg.assignmentGroup}` : "incidents")}</> : "Incidents · Table API"}>
        <details className="relative">
          <summary className="btn btn-secondary btn-sm list-none cursor-pointer">{snow ? "Edit" : "Connect"}</summary>
          <form action={saveServiceNowAction} className={panel}>
            <fieldset disabled={!isAdmin} className="flex flex-col gap-2">
              <input name="instance" required defaultValue={snow?.cfg?.instance ?? ""} placeholder="https://yourcompany.service-now.com" aria-label="ServiceNow instance" className="field" />
              <input name="user" defaultValue={snow?.cfg?.user ?? ""} placeholder="Integration user (empty for a token)" aria-label="ServiceNow user" className="field" />
              <input name="secret" type="password" autoComplete="off" required={!snow} placeholder={snow ? "Password or token — leave empty to keep" : "Password or token"} aria-label="ServiceNow password or token" className="field" />
              <input name="assignmentGroup" defaultValue={snow?.cfg?.assignmentGroup ?? ""} placeholder="Assignment group (optional)" aria-label="Assignment group" className="field" />
              <button className="btn btn-primary btn-sm">{snow ? "Save" : "Connect"}</button>
              <p className="text-[11px] text-ink-400">The user needs the itil role to create incidents. angar checks access before saving and stores it encrypted.</p>
            </fieldset>
          </form>
        </details>
        {/* Prima il modulo: su mobile il menu si apre da sinistra senza uscire dallo schermo */}
        {snow && actions("SERVICENOW")}
      </Row>
    </Section>
  );
}

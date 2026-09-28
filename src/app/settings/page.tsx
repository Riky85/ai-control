import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { currentSession } from "@/lib/auth";
import Link from "next/link";
import { resetWorkspaceDataAction, loadDemoDataAction } from "@/lib/test-data-actions";
import { addUserAction } from "@/lib/actions";
import { setEmployeesAction } from "@/lib/spend-actions";
import { setIndustryAction, setChatWebhookAction, setPrivacyModeAction } from "@/lib/settings-actions";
import { erasePastNamesAction } from "@/lib/discovery/privacy-actions";
import { PRIVACY_MODES, privacyModeOf, showsPeople } from "@/lib/privacy";
import { INDUSTRIES } from "@/lib/industries";
import { Notice, PageHeader, Tabs } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";
import ThemeSelect from "@/components/ThemeSelect";
import SignInSecurityPanel from "@/components/SignInSecurityPanel";
import DevelopersPanel from "@/components/DevelopersPanel";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

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
export default async function SettingsPage({ searchParams }: { searchParams: { tab?: string; reset?: string; chat?: string; privacy?: string; signin?: string; webhook?: string } }) {
  const orgId = currentOrgId();
  // Vecchi link senza scheda: si apre quella giusta dal parametro.
  const tab: Tab = (TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab : searchParams.privacy ? "privacy" : searchParams.signin ? "security" : searchParams.chat || searchParams.webhook ? "integrations" : searchParams.reset ? "data" : "general") as Tab;
  const [org, userCount, connectors] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    db.user.count({ where: { organizationId: orgId } }),
    db.connector.findMany({ where: { organizationId: orgId, status: "CONNECTED" } }),
  ]);
  const privacy = privacyModeOf(org);
  const role = currentSession()?.role;
  const isAdmin = role === "ADMIN" || role === "OWNER";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" subtitle="Your organization, privacy, security and integrations." />
      <Tabs active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/settings?tab=${t.key}` }))} />

      {tab === "general" && (
        <Section>
          <Row title="Organization" hint={org?.country ? `Country: ${org.country}` : undefined}>
            <span className="text-sm text-ink-100">{org?.name ?? "—"}</span>
          </Row>
          <Row title="Employees" hint="For AI spend for each employee and the benchmark." id="employees">
            <form action={setEmployeesAction} className="flex gap-2">
              <input name="employees" type="number" min="1" defaultValue={org?.employees ?? ""} placeholder="e.g. 120" className="field w-32" />
              <button className="btn btn-secondary btn-sm">Save</button>
            </form>
          </Row>
          <Row title="Industry" hint="Compares you with similar companies.">
            <form action={setIndustryAction} className="flex gap-2">
              <select name="industry" defaultValue={org?.industry ?? ""} className="field w-56">
                <option value="">Not set</option>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
              <button className="btn btn-secondary btn-sm">Save</button>
            </form>
          </Row>
          <Row title="Appearance">
            <ThemeSelect initial={parseTheme(cookies().get(THEME_COOKIE)?.value)} />
          </Row>
          <Row title="People" hint="Added automatically from company accounts and provider keys.">
            <div className="flex items-center gap-3">
              <Link href="/people" className="btn btn-secondary btn-sm">{userCount} {userCount === 1 ? "person" : "people"} →</Link>
              <details className="relative">
                <summary className="btn btn-ghost btn-sm list-none cursor-pointer">Add by hand</summary>
                <form action={addUserAction} className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-line bg-panel p-3 shadow-card flex flex-col gap-2">
                  <input name="email" type="email" required placeholder="Email" className="field" />
                  <input name="name" placeholder="Name" className="field" />
                  <input name="department" placeholder="Department" className="field" />
                  <button className="btn btn-primary btn-sm">Add</button>
                </form>
              </details>
            </div>
          </Row>
        </Section>
      )}

      {tab === "privacy" && (
        <>
          {searchParams.privacy === "ok" && <Notice tone="success">Privacy mode changed — pages, exports and reports follow it from now on.</Notice>}
          {searchParams.privacy === "erased" && <Notice tone="success">Names and emails were removed from past data.</Notice>}
          <Section>
            <Row title="Employee privacy" hint="What angar shows about the people who use AI.">
              <form action={setPrivacyModeAction} className="flex flex-col gap-2 w-full max-w-md">
                <fieldset disabled={!isAdmin} className="flex flex-col gap-1.5">
                  {PRIVACY_MODES.map((m) => (
                    <label key={m.id} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${privacy === m.id ? "border-accent/60 bg-accent/[0.05]" : "border-line hover:border-ink-400"}`}>
                      <input type="radio" name="mode" value={m.id} defaultChecked={privacy === m.id} className="mt-1 accent-accent" />
                      <span>
                        <span className="block text-sm text-ink-100">{m.label}</span>
                        <span className="block text-xs text-ink-400">{m.description}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <div className="flex items-center gap-3">
                  <button className="btn btn-primary btn-sm" disabled={!isAdmin}>Save</button>
                  {!isAdmin && <span className="text-xs text-ink-400">Admins only.</span>}
                </div>
              </form>
            </Row>
            <Row title="Employee notice" hint="Hand it out before you start (EN · IT · DE).">
              <Link href="/compliance/employee-notice" className="btn btn-secondary btn-sm">Open notice →</Link>
            </Row>
            {!showsPeople(privacy) && role === "OWNER" && (
              <Row title="Past data" hint="Replace names and emails already collected with pseudonyms. Can't be undone.">
                <form action={erasePastNamesAction}>
                  <button className="btn btn-secondary btn-sm">Erase names</button>
                </form>
              </Row>
            )}
          </Section>
          <p className="text-xs text-ink-400">angar never records what people type, read or generate in an AI tool — only which tools are used, when and how much. A new mode applies from now on.</p>
        </>
      )}

      {tab === "security" && (
        <>
          <SignInSecurityPanel message={searchParams.signin} />
          <Section>
            <Row title="Connector keys">
              <Status on={Boolean(process.env.CREDENTIALS_SECRET)} yes="Encrypted" no="Not configured" />
            </Row>
            <Row title="Access to your tools">
              <Status on yes="Read-only (except seat removal you start)" />
            </Row>
            <Row title="Audit log" hint="Tamper-evident, every change is recorded.">
              <Link href="/audit" className="btn btn-secondary btn-sm">Open →</Link>
            </Row>
          </Section>
        </>
      )}

      {tab === "integrations" && (
        <>
          {searchParams.chat === "ok" && <Notice tone="success">Connected — a test message was sent.</Notice>}
          <Section>
            <Row title="Sources" hint={connectors.length ? `${connectors.length} connected` : "Nothing connected yet"}>
              <div className="flex flex-wrap items-center gap-2 justify-end">
                {connectors.slice(0, 6).map((c) => (
                  <span key={c.id} title={c.provider} className="rounded-lg border border-line p-1">
                    <VendorBadge vendor={c.provider} size={22} />
                  </span>
                ))}
                <Link href="/sources" className="btn btn-secondary btn-sm">Manage →</Link>
              </div>
            </Row>
            <Row title="Slack or Teams" hint={org?.chatWebhookEncrypted ? "Weekly summary on Mondays + alerts." : "Weekly summary and alerts in your team chat."}>
              <form action={setChatWebhookAction} className="flex gap-2 w-full max-w-md">
                <input name="url" type="url" placeholder={org?.chatWebhookEncrypted ? "Connected — paste a new URL to change" : "Incoming webhook URL"} className="field flex-1 min-w-0" />
                <button className="btn btn-secondary btn-sm">{org?.chatWebhookEncrypted ? "Update" : "Connect"}</button>
                {org?.chatWebhookEncrypted && <button name="url" value="" className="btn btn-ghost btn-sm">Disconnect</button>}
              </form>
            </Row>
          </Section>
          <details className="text-xs text-ink-400 -mt-2">
            <summary className="cursor-pointer list-none hover:text-ink-100 select-none">How to get the Slack / Teams URL and one-click buttons</summary>
            <div className="mt-2 flex flex-col gap-1.5 max-w-3xl">
              <p><b className="text-ink-100">Slack:</b> Apps → Incoming Webhooks → Add to a channel. <b className="text-ink-100">Teams:</b> channel → Workflows → &ldquo;Post to a channel when a webhook request is received&rdquo;.</p>
              <p>Approve / Keep buttons open angar to confirm. For buttons that work inside Slack, the platform admin sets up the angar Slack app (Interactivity URL <span className="font-mono">{process.env.APP_URL ?? ""}/api/slack/interactions</span>, <span className="font-mono">SLACK_SIGNING_SECRET</span>, <span className="font-mono">SLACK_BOT_TOKEN</span>).</p>
            </div>
          </details>
          <DevelopersPanel orgId={orgId} canEdit={isAdmin} webhookStatus={searchParams.webhook} />
        </>
      )}

      {tab === "data" && (
        <>
          {searchParams.reset && <Notice tone="success">Workspace data reset — drop a bank statement on Overview to start again.</Notice>}
          <Section>
            <Row title="Demo data" hint="Adds an example company so every page is filled in.">
              <form action={loadDemoDataAction}>
                <button className="btn btn-secondary btn-sm">Load demo data</button>
              </form>
            </Row>
            <Row title="Reset workspace" hint="Deletes AI, costs, people, sources and keys. Members, plan and audit log stay. Owners only.">
              <form action={resetWorkspaceDataAction} className="flex gap-2 w-full max-w-md">
                <input name="confirm" required autoComplete="off" placeholder={`Type "${org?.name ?? ""}"`} className="field flex-1 min-w-0 focus:border-alarm" />
                <button className="btn btn-danger btn-sm">Reset</button>
              </form>
            </Row>
          </Section>
        </>
      )}
    </div>
  );
}

/** Blocco unico con righe separate da una linea: niente riquadri che si impastano. */
function Section({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl border border-line bg-panel divide-y divide-line">{children}</section>;
}

function Row({ title, hint, id, children }: { title: string; hint?: string; id?: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-6 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3 md:gap-8 items-start md:items-center px-5 py-4">
      <div>
        <div className="text-sm font-medium text-ink-100">{title}</div>
        {hint && <div className="text-xs text-ink-400 mt-0.5">{hint}</div>}
      </div>
      <div className="flex md:justify-end min-w-0">{children}</div>
    </div>
  );
}

function Status({ on, yes, no }: { on: boolean; yes: string; no?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-100">
      <span className={`h-2 w-2 rounded-full ${on ? "bg-steady" : "bg-signal"}`} />
      {on ? yes : no}
    </span>
  );
}

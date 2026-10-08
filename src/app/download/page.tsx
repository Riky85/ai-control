import { desktopServerTag } from "@/lib/edition";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { PageHeader, Panel, Tabs } from "@/components/ui";
import ComputersView from "./ComputersView";
import { redirect } from "next/navigation";
import CopyButton from "@/components/CopyButton";
import { ensureWorkspaceToken } from "@/lib/discovery/ingest";
import { DESKTOP_OS_LABEL, DESKTOP_VERSION, osFromUserAgent, type DesktopOs } from "@/lib/desktop";

export const dynamic = "force-dynamic";

// Area download: il download per questo computer, il link per tutti e
// (chiuso) l'installazione silenziosa per l'IT.
const VIEWS = [
  { key: "download", label: "Download" },
  { key: "computers", label: "Computers" },
] as const;

// Area "Desktop app": download e computer collegati (prima /download e /computers).
// Gli altri modi di trovare le AI (prima ?view=other) sono in Connect → /connect/other.
export default async function DownloadPage({ searchParams }: { searchParams: { view?: string; error?: string } }) {
  if (searchParams.view === "other") redirect(`/connect/other${searchParams.error ? `?error=${encodeURIComponent(searchParams.error)}` : ""}`);
  const s = currentSession()!;
  const view = VIEWS.some((v) => v.key === searchParams.view) ? searchParams.view! : "download";
  const h = headers();
  const base = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const org = await db.organization.findUnique({ where: { id: s.orgId }, select: { name: true } });
  const company = org?.name ?? "your company";
  const { joinCode, token } = await ensureWorkspaceToken(s.orgId);
  const joinUrl = `${base}/join/${joinCode}`;
  const detected = osFromUserAgent(h.get("user-agent"));
  const others = (["windows", "mac", "linux"] as DesktopOs[]).filter((o) => o !== detected);
  const href = (o: DesktopOs) => `/api/discovery/desktop/download/${joinCode}?os=${o}`;
  const firstRun: Record<DesktopOs, string> = {
    windows: "If Windows warns, click More info → Run anyway",
    mac: "Unzip, then right-click → Open the first time",
    linux: "chmod +x, then run it",
  };
  // On-premises: il nome del file porta anche il server; per sicurezza lo passiamo pure come opzione.
  const tag = `${joinCode}${desktopServerTag()}`;
  const srv = desktopServerTag() ? ` --server ${base}` : "";
  const it = [
    { os: "Windows", cmd: `angar-${tag}.exe --silent --email-domain yourcompany.com${srv}` },
    { os: "macOS", cmd: `"angar-${tag}.app/Contents/MacOS/angar" --join ${joinCode} --silent --email-domain yourcompany.com${srv}` },
    { os: "Linux", cmd: `./angar-${tag} --silent --email-domain yourcompany.com${srv}` },
  ];

  const header = (
    <>
      <PageHeader
        crumbs={[{ label: "Connect", href: "/connect" }]}
        title="Desktop app"
        subtitle="Which AI people use, never pages or prompts"
      />
      <Tabs active={view} items={VIEWS.map((v) => ({ key: v.key, label: v.label, href: v.key === "download" ? "/download" : `/download?view=${v.key}` }))} />
    </>
  );
  if (view === "computers")
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ComputersView orgId={s.orgId} />
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      {header}

      {/* Download principale: un pannello semplice, il sistema rilevato per primo. */}
      <Panel title={`angar for ${DESKTOP_OS_LABEL[detected]}`} subtitle={`v${DESKTOP_VERSION} · linked to ${company}`} footer={<span className="text-xs text-ink-400">{firstRun[detected]}. Windows 10+, macOS 12+, Linux x64.</span>}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-400">Install once, type your work email, done.</p>
          <div className="flex flex-wrap items-center gap-2">
            <a href={href(detected)} className="btn btn-primary">
              <OsIcon os={detected} />
              Download for {DESKTOP_OS_LABEL[detected]}
            </a>
            {others.map((o) => (
              <a key={o} href={href(o)} className="btn btn-secondary">
                <OsIcon os={o} />
                {DESKTOP_OS_LABEL[o]}
              </a>
            ))}
          </div>
        </div>
      </Panel>

      {/* Tutta l'azienda: un link da mandare a tutti */}
      <Panel title="Send the link to everyone">
        <div className="flex flex-wrap sm:flex-nowrap min-w-0 items-center gap-2">
          <code className="basis-full sm:basis-auto flex-1 min-w-0 truncate rounded-lg border border-line bg-ink px-3 py-2 text-xs text-ink-100">{joinUrl}</code>
          <CopyButton text={joinUrl} label="Copy link" />
          <CopyButton
            text={`Hi! We use angar to see which AI tools we use and stop paying for seats nobody needs. It takes a minute: open ${joinUrl}, download the app and type your work email. Only the names of AI tools and the time spent are shared — never pages, prompts or anything you write. Thanks!`}
            label="Copy message"
            className="btn btn-ghost btn-sm shrink-0"
          />
        </div>
      </Panel>

      <details className="group">
        <summary className="cursor-pointer list-none text-sm text-ink-400 hover:text-ink-100 inline-flex items-center gap-1.5 select-none">
          <span className="transition-transform group-open:rotate-90">›</span> For IT (silent install)
        </summary>
        <div className="mt-3 rounded-xl border border-line bg-panel p-5 flex flex-col gap-2">
          <p className="text-xs text-ink-400">Intune, Jamf, GPO or scripts. Run as the signed-in user.</p>
          {it.map((x) => (
            <div key={x.os} className="flex items-center gap-2">
              <span className="w-16 shrink-0 eyebrow">{x.os}</span>
              <code className="flex-1 min-w-0 truncate rounded-lg border border-line bg-ink px-2.5 py-1.5 text-[11px] text-ink-100" title={x.cmd}>{x.cmd}</code>
              <CopyButton text={x.cmd} label="Copy" className="btn btn-ghost btn-sm" />
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function OsIcon({ os }: { os: DesktopOs }) {
  if (os === "windows")
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
        <rect x="0" y="0" width="6.3" height="6.3" rx="0.6" /><rect x="7.7" y="0" width="6.3" height="6.3" rx="0.6" />
        <rect x="0" y="7.7" width="6.3" height="6.3" rx="0.6" /><rect x="7.7" y="7.7" width="6.3" height="6.3" rx="0.6" />
      </svg>
    );
  if (os === "mac")
    return (
      <svg width="15" height="14" viewBox="0 0 15 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
        <rect x="2" y="1" width="11" height="8" rx="1.2" /><path d="M0.75 12.25h13.5" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg width="15" height="14" viewBox="0 0 15 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <rect x="0.75" y="0.75" width="13.5" height="12.5" rx="1.5" /><path d="M3.5 5l2 2-2 2M7.5 9.5h3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

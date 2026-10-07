import { desktopServerTag } from "@/lib/edition";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { PageHeader, Tabs } from "@/components/ui";
import ComputersView from "./ComputersView";
import OtherWaysView from "./OtherWaysView";
import CopyButton from "@/components/CopyButton";
import { Wordmark } from "@/components/Logo";
import { ensureWorkspaceToken } from "@/lib/discovery/ingest";
import { DESKTOP_OS_LABEL, DESKTOP_VERSION, osFromUserAgent, type DesktopOs } from "@/lib/desktop";

export const dynamic = "force-dynamic";

// Area download: il download per questo computer, il link per tutti e
// (chiuso) l'installazione silenziosa per l'IT.
const VIEWS = [
  { key: "download", label: "Download" },
  { key: "computers", label: "Computers" },
  { key: "other", label: "Other ways" },
] as const;

// Area "Desktop app": download, computer collegati e altri modi di trovare le AI
// (prima tre pagine: /download, /computers, /discover).
export default async function DownloadPage({ searchParams }: { searchParams: { view?: string } }) {
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
        subtitle="Never pages or prompts."
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
  if (view === "other")
    return (
      <div className="flex flex-col gap-6">
        {header}
        <OtherWaysView orgId={s.orgId} base={base} token={token} joinUrl={joinUrl} canEdit={s.role !== "VIEWER"} canAdmin={s.role === "ADMIN" || s.role === "OWNER"} />
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      {header}

      {/* Download principale + anteprima dell'app */}
      <section className="relative overflow-hidden rounded-2xl border border-line bg-panel grid grid-cols-1 lg:grid-cols-[1fr_auto]">
        <div className="relative p-5 sm:p-7 lg:p-9 flex flex-col gap-5 min-w-0">
          <div className="flex items-center gap-2 text-xs text-ink-400">
            <span className="rounded-full border border-line px-2 py-0.5 text-ink-100 tabular">v{DESKTOP_VERSION}</span>
            <span>Linked to {company} automatically</span>
          </div>
          <div>
            <h2 className="font-display text-[30px] leading-tight font-semibold tracking-tight text-ink-100">angar for {DESKTOP_OS_LABEL[detected]}</h2>
            <p className="text-sm text-ink-400 mt-1.5 max-w-md">Install once, type your work email, done.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href={href(detected)} className="btn btn-primary h-11 px-5 text-[15px]">
              <OsIcon os={detected} />
              Download for {DESKTOP_OS_LABEL[detected]}
            </a>
            {others.map((o) => (
              <a key={o} href={href(o)} className="btn btn-secondary h-11">
                <OsIcon os={o} />
                {DESKTOP_OS_LABEL[o]}
              </a>
            ))}
          </div>
        </div>
        <div className="relative hidden lg:flex items-end justify-center px-9 pt-8">
          <AppPreview company={company} email={s.email} />
        </div>
        {/* Barra grigia in basso: primo avvio e requisiti. */}
        <p className="relative lg:col-span-2 bg-ink border-t border-line rounded-b-2xl px-5 py-3 text-xs text-ink-400 bar-foot">{firstRun[detected]}. Windows 10+, macOS 12+, Linux x64.</p>
      </section>

      {/* Tutta l'azienda: un link da mandare a tutti */}
      <section className="rounded-xl border border-line bg-panel flex flex-col animate-rise">
        <h2 className="bg-ink border-b border-line rounded-t-xl px-5 py-3 text-sm font-bold text-ink-100 bar-head">Send the link to everyone</h2>
        <div className="flex flex-wrap sm:flex-nowrap min-w-0 items-center gap-2 px-5 py-4">
          <code className="basis-full sm:basis-auto flex-1 min-w-0 truncate rounded-lg border border-line bg-ink px-3 py-2 text-xs text-ink-100">{joinUrl}</code>
          <CopyButton text={joinUrl} label="Copy" />
          <CopyButton
            text={`Hi! We use angar to see which AI tools we use and stop paying for seats nobody needs. It takes a minute: open ${joinUrl}, download the app and type your work email. Only the names of AI tools and the time spent are shared — never pages, prompts or anything you write. Thanks!`}
            label="Copy message"
            className="btn btn-ghost btn-sm shrink-0"
          />
        </div>
      </section>

      <details className="group">
        <summary className="cursor-pointer list-none text-sm text-ink-400 hover:text-ink-100 inline-flex items-center gap-1.5 select-none">
          <span className="transition-transform group-open:rotate-90">›</span> For IT (silent install)
        </summary>
        <div className="mt-3 rounded-xl border border-line bg-panel p-5 flex flex-col gap-2">
          <p className="text-xs text-ink-400">Intune, Jamf, GPO or scripts — run as the signed-in user.</p>
          {it.map((x) => (
            <div key={x.os} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-ink-400">{x.os}</span>
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

/** Anteprima dell'app desktop (stessa grafica della finestra vera, schermata "You're all set"). */
function AppPreview({ company, email }: { company: string; email: string }) {
  return (
    <div className="force-dark w-[300px] rounded-t-xl border border-b-0 border-[#34383D] bg-[#1A1C1D] shadow-[0_-8px_32px_rgba(20,20,24,0.12)] dark:shadow-[0_-10px_60px_rgba(0,0,0,0.45)] text-[#EDEDEF] select-none" aria-hidden>
      <div className="flex items-center h-10 px-4 border-b border-[#34383D]">
        <Wordmark size={13} />
        <span className="ml-auto text-[#9CA0A8] text-sm leading-none">×</span>
      </div>
      <div className="px-5 pt-5 pb-6 flex flex-col gap-3">
        <span className="h-10 w-10 rounded-full border border-[#3FB67A]/50 bg-[#3FB67A]/15 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#3FB67A" strokeWidth="2"><path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <div>
          <div className="text-[17px] font-semibold">You&apos;re all set</div>
          <div className="text-[11px] text-[#9CA0A8] mt-1 leading-snug">angar is on and runs quietly in the background. It starts by itself — there&apos;s nothing else to do.</div>
        </div>
        <div className="rounded-lg border border-[#23232A] bg-[#0B0B10] px-3 py-2 flex flex-col gap-1.5 text-[11px]">
          {[
            ["Company", company],
            ["Email", email],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="w-14 shrink-0 text-[#9CA0A8]">{k}</span>
              <span className="truncate font-medium">{v}</span>
            </div>
          ))}
          <div className="flex gap-2 items-center">
            <span className="w-14 shrink-0 text-[#9CA0A8]">Status</span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#3FB67A]" />
            <span className="font-medium">Running in the background</span>
          </div>
        </div>
        <div className="mt-2 h-8 rounded-lg bg-accent text-white text-[12px] font-semibold flex items-center justify-center">Done</div>
      </div>
    </div>
  );
}

import { headers } from "next/headers";
import Link from "next/link";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import CopyButton from "@/components/CopyButton";
import { Wordmark } from "@/components/Logo";
import { ensureWorkspaceToken } from "@/lib/discovery/ingest";
import { DESKTOP_OS_LABEL, DESKTOP_VERSION, osFromUserAgent, type DesktopOs } from "@/lib/desktop";

export const dynamic = "force-dynamic";

// Area download, in una schermata: a sinistra il download per questo computer
// (sistema rilevato) con l'anteprima dell'app; sotto tre schede compatte —
// tutta l'azienda, IT (installazione silenziosa), telefono e rete.
export default async function DownloadPage() {
  const s = currentSession()!;
  const h = headers();
  const base = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const org = await db.organization.findUnique({ where: { id: s.orgId }, select: { name: true } });
  const company = org?.name ?? "your company";
  const { joinCode } = await ensureWorkspaceToken(s.orgId);
  const joinUrl = `${base}/join/${joinCode}`;
  const detected = osFromUserAgent(h.get("user-agent"));
  const others = (["windows", "mac", "linux"] as DesktopOs[]).filter((o) => o !== detected);
  const href = (o: DesktopOs) => `/api/discovery/desktop/download/${joinCode}?os=${o}`;
  const firstRun: Record<DesktopOs, string> = {
    windows: "If Windows warns, click More info → Run anyway",
    mac: "Unzip, then right-click → Open the first time",
    linux: "chmod +x, then run it",
  };
  const it = [
    { os: "Windows", cmd: `angar-${joinCode}.exe --silent --email-domain yourcompany.com` },
    { os: "macOS", cmd: `"angar-${joinCode}.app/Contents/MacOS/angar" --join ${joinCode} --silent --email-domain yourcompany.com` },
    { os: "Linux", cmd: `./angar-${joinCode} --silent --email-domain yourcompany.com` },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Download angar"
        subtitle="The desktop app shows which AI tools are used at work and for how long — never pages, prompts or anything anyone writes."
        action={<Link href="/computers" className="btn btn-secondary">Connected computers</Link>}
      />

      {/* Download principale + anteprima dell'app */}
      <section className="relative overflow-hidden rounded-2xl border border-line bg-panel grid grid-cols-1 lg:grid-cols-[1fr_auto]">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative p-7 lg:p-9 flex flex-col gap-5 min-w-0">
          <div className="flex items-center gap-2 text-xs text-ink-400">
            <span className="rounded-full border border-line px-2 py-0.5 text-ink-100 tabular">v{DESKTOP_VERSION}</span>
            <span>Linked to {company} automatically</span>
          </div>
          <div>
            <h2 className="font-display text-[30px] leading-tight font-semibold tracking-tight text-ink-100">angar for {DESKTOP_OS_LABEL[detected]}</h2>
            <p className="text-sm text-ink-400 mt-1.5 max-w-md">Install once, type your work email, and forget about it. It starts with the computer and uses almost no resources.</p>
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
          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
            {[
              ["Open the file", firstRun[detected]],
              ["Type your work email", "Only once — on company PCs it's read from Windows"],
              ["Done", "Runs quietly in the background, no admin rights"],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-2.5">
                <span className="h-6 w-6 shrink-0 rounded-full border border-line text-xs font-medium text-ink-100 flex items-center justify-center">{i + 1}</span>
                <span className="text-sm leading-snug">
                  <span className="block text-ink-100 font-medium">{t}</span>
                  <span className="text-ink-400">{d}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink-400">Windows 10 and 11 · macOS 12 or later (Intel and Apple silicon) · Linux x64 · Shares only AI tool names and time spent.</p>
        </div>
        <div className="relative hidden lg:flex items-end justify-center px-9 pt-8">
          <AppPreview company={company} email={s.email} />
        </div>
      </section>

      {/* Tutta l'azienda · IT · telefono e rete */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-3">
          <CardTitle title="Roll it out to everyone" hint="Each person downloads from this link" />
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded-lg border border-line bg-ink px-3 py-2 text-xs text-ink-100">{joinUrl}</code>
            <CopyButton text={joinUrl} label="Copy" />
          </div>
          <CopyButton
            text={`Hi! We use angar to see which AI tools we use and stop paying for seats nobody needs. It takes a minute: open ${joinUrl}, download the app and type your work email. Only the names of AI tools and the time spent are shared — never pages, prompts or anything you write. Thanks!`}
            label="Copy invitation message"
            className="btn btn-secondary btn-sm self-start mt-auto"
          />
        </section>

        <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-3">
          <CardTitle title="For IT: silent install" hint="Intune, Jamf, GPO or scripts — run as the signed-in user" />
          <div className="flex flex-col gap-2">
            {it.map((x) => (
              <div key={x.os} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs text-ink-400">{x.os}</span>
                <code className="flex-1 min-w-0 truncate rounded-lg border border-line bg-ink px-2.5 py-1.5 text-[11px] text-ink-100" title={x.cmd}>{x.cmd}</code>
                <CopyButton text={x.cmd} label="Copy" className="btn btn-ghost btn-sm" />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-3">
          <CardTitle title="More ways" hint="Phones and whole networks" />
          <Link href="/edge" className="group flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 hover:bg-ink-100/[0.04] transition-colors">
            <span className="h-8 w-8 shrink-0 rounded-lg border border-line flex items-center justify-center text-accent">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="5" width="13" height="6.5" rx="1.5" /><path d="M4.5 8.25h.01M7 8.25h.01" strokeLinecap="round" strokeWidth="2" /></svg>
            </span>
            <span className="text-sm leading-snug min-w-0">
              <span className="block text-ink-100 font-medium">angar Edge</span>
              <span className="text-ink-400">Every device on the network, nothing to install</span>
            </span>
            <span className="ml-auto text-ink-400 group-hover:text-ink-100">→</span>
          </Link>
          <div className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
            <span className="h-8 w-8 shrink-0 rounded-lg border border-line flex items-center justify-center text-ink-100">
              <svg width="14" height="16" viewBox="0 0 14 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="0.75" width="11" height="14.5" rx="2" /><path d="M5.5 12.5h3" strokeLinecap="round" /></svg>
            </span>
            <span className="text-sm leading-snug">
              <span className="block text-ink-100 font-medium">angar on your phone</span>
              <span className="text-ink-400">Open angar in the browser → Share → Add to Home Screen</span>
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

function CardTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <div className="text-sm font-semibold text-ink-100">{title}</div>
      <div className="text-xs text-ink-400 mt-0.5">{hint}</div>
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
    <div className="force-dark w-[300px] rounded-t-xl border border-b-0 border-[#34383D] bg-[#1A1C1D] shadow-[0_-10px_60px_rgba(0,0,0,0.45)] text-[#EDEDEF] select-none" aria-hidden>
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
        <div className="rounded-lg border border-[#34383D] bg-[#202327] px-3 py-2 flex flex-col gap-1.5 text-[11px]">
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

import { headers } from "next/headers";
import Link from "next/link";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { Wordmark } from "@/components/Logo";
import CopyButton from "@/components/CopyButton";
import { ensureWorkspaceToken } from "@/lib/discovery/ingest";
import { DESKTOP_OS_LABEL, osFromUserAgent, type DesktopOs } from "@/lib/desktop";

export const dynamic = "force-dynamic";

// Area download dedicata (stile pagina download di un'app): sistema rilevato in
// grande, gli altri sotto, link aziendale e istruzioni IT. Il file è già
// collegato all'azienda dal nome.
export default async function DownloadPage() {
  const s = currentSession()!;
  const h = headers();
  const base = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const org = await db.organization.findUnique({ where: { id: s.orgId }, select: { name: true } });
  const { joinCode } = await ensureWorkspaceToken(s.orgId);
  const joinUrl = `${base}/join/${joinCode}`;
  const detected = osFromUserAgent(h.get("user-agent"));
  const all: DesktopOs[] = ["windows", "mac", "linux"];
  const ordered = [detected, ...all.filter((o) => o !== detected)];
  const href = (o: DesktopOs) => `/api/discovery/desktop/download/${joinCode}?os=${o}`;

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto">
      <div className="text-center flex flex-col items-center gap-4 pt-4">
        <div className="text-ink-100"><Wordmark size={24} /></div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Get the angar desktop app</h1>
          <p className="text-sm text-ink-400 mt-1.5 max-w-lg">
            Already linked to {org?.name}. Install it, type your work email once, and it quietly reports which AI tools are used and for how long — never pages, prompts or anything you write.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 w-full">
          <a href={href(ordered[0])} className="btn btn-primary !h-11 !px-6 text-[15px]">Download for {DESKTOP_OS_LABEL[ordered[0]]}</a>
          <div className="flex items-center gap-4 text-sm text-ink-400">
            {ordered.slice(1).map((o) => (
              <a key={o} href={href(o)} className="underline hover:text-ink-100">{DESKTOP_OS_LABEL[o]}</a>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { n: "1", t: "Download & open", d: detected === "mac" ? "Unzip, then right-click → Open the first time." : "If Windows warns, click More info → Run anyway." },
          { n: "2", t: "Type your work email", d: "So your usage is counted for you." },
          { n: "3", t: "Done", d: "It runs in the background and starts at login." },
        ].map((x) => (
          <div key={x.n} className="rounded-xl border border-line bg-panel p-4">
            <div className="h-7 w-7 rounded-full border border-line text-sm font-medium text-ink-100 flex items-center justify-center mb-2">{x.n}</div>
            <div className="text-sm font-medium text-ink-100">{x.t}</div>
            <div className="text-xs text-ink-400 mt-0.5">{x.d}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-3">
        <div className="text-sm font-semibold text-ink-100">Roll it out to the whole company</div>
        <p className="text-sm text-ink-400">Send this link — each person downloads from it and types their email; it links to {org?.name} by itself.</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate rounded-lg border border-line bg-ink px-3 py-2 text-xs text-ink-100">{joinUrl}</code>
          <CopyButton text={joinUrl} label="Copy link" />
        </div>
        <div className="flex gap-2">
          <CopyButton
            text={`Hi! We use angar to see which AI tools we use and stop paying for seats nobody needs. It takes a minute: open ${joinUrl}, download the app and type your work email. Only the names of AI tools and the time spent are shared — never pages, prompts or anything you write. Thanks!`}
            label="Copy invitation message"
            className="btn btn-secondary btn-sm self-start"
          />
          <Link href="/discover" className="btn btn-secondary btn-sm">Other ways to find AI</Link>
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer list-none text-ink-400 hover:text-ink-100 select-none">For IT: silent install (Intune, Jamf, scripts)</summary>
        <div className="mt-3 flex flex-col gap-3 text-ink-400">
          <p>Run as the signed-in user (not SYSTEM/root). On Entra ID / AD computers the work email is read from Windows; otherwise pass your email domain.</p>
          {[
            { label: "Windows", cmd: `angar-${joinCode}.exe --silent --email-domain yourcompany.com` },
            { label: "macOS", cmd: `"angar-${joinCode}.app/Contents/MacOS/angar" --join ${joinCode} --silent --email-domain yourcompany.com` },
            { label: "Linux", cmd: `./angar-${joinCode} --silent --email-domain yourcompany.com` },
          ].map((x) => (
            <div key={x.label} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-ink-100">{x.label}</span>
              <code className="flex-1 min-w-0 truncate rounded-lg border border-line bg-ink px-3 py-2 text-xs text-ink-100">{x.cmd}</code>
              <CopyButton text={x.cmd} />
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

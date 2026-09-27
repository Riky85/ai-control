import { headers } from "next/headers";
import Link from "next/link";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import CopyButton from "@/components/CopyButton";
import { ensureWorkspaceToken } from "@/lib/discovery/ingest";
import { DESKTOP_OS_LABEL, osFromUserAgent, type DesktopOs } from "@/lib/desktop";

export const dynamic = "force-dynamic";

// Area download: tutto in una schermata. A sinistra questo computer (sistema
// rilevato in evidenza), a destra il link per tutta l'azienda; i comandi IT
// restano chiusi sotto.
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
  const steps = [
    detected === "mac" ? "Unzip it, then right-click → Open the first time." : "Open it. If Windows warns, click More info → Run anyway.",
    "Type your work email once.",
    "Done — it runs in the background and starts at login.",
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        crumbs={[{ label: "Sources", href: "/sources" }]}
        title="Get the desktop app"
        subtitle={`Already linked to ${org?.name ?? "your company"}. It reports which AI tools are used and for how long — never pages, prompts or anything you write.`}
        action={<Link href="/computers" className="btn btn-secondary">Connected computers</Link>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border border-accent/50 bg-panel p-5 flex flex-col gap-4">
          <div className="text-base font-semibold text-ink-100">This computer</div>
          <div className="flex flex-wrap items-center gap-3">
            <a href={href(ordered[0])} className="btn btn-primary">Download for {DESKTOP_OS_LABEL[ordered[0]]}</a>
            {ordered.slice(1).map((o) => (
              <a key={o} href={href(o)} className="text-sm text-ink-400 hover:text-ink-100 underline">{DESKTOP_OS_LABEL[o]}</a>
            ))}
          </div>
          <ol className="flex flex-col gap-2">
            {steps.map((t, i) => (
              <li key={t} className="flex items-center gap-3 text-sm text-ink-400">
                <span className="h-6 w-6 shrink-0 rounded-full border border-line text-xs font-medium text-ink-100 flex items-center justify-center">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-3">
          <div className="text-base font-semibold text-ink-100">The whole company</div>
          <p className="text-sm text-ink-400">Send this link: each person downloads from it and types their email. It links to {org?.name ?? "your company"} by itself.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded-lg border border-line bg-ink px-3 py-2 text-xs text-ink-100">{joinUrl}</code>
            <CopyButton text={joinUrl} label="Copy link" />
          </div>
          <CopyButton
            text={`Hi! We use angar to see which AI tools we use and stop paying for seats nobody needs. It takes a minute: open ${joinUrl}, download the app and type your work email. Only the names of AI tools and the time spent are shared — never pages, prompts or anything you write. Thanks!`}
            label="Copy invitation message"
            className="btn btn-secondary btn-sm self-start mt-auto"
          />
        </section>
      </div>

      <details className="rounded-xl border border-line bg-panel px-5 py-3 text-sm">
        <summary className="cursor-pointer list-none text-ink-400 hover:text-ink-100 select-none">For IT: silent install on every computer (Intune, Jamf, scripts)</summary>
        <div className="mt-3 flex flex-col gap-2.5 text-ink-400">
          <p>Run as the signed-in user (not SYSTEM/root). On Entra ID / AD computers the email is read from Windows; otherwise pass your email domain.</p>
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

      <p className="text-xs text-ink-400">
        Can&apos;t install apps? <Link href="/discover" className="underline hover:text-ink-100">Other ways to find AI</Link> · Prefer nothing on computers? <Link href="/edge" className="underline hover:text-ink-100">angar Edge</Link>
      </p>
    </div>
  );
}

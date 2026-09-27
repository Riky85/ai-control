import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { Wordmark } from "@/components/Logo";
import JoinConnect from "@/components/JoinConnect";
import { DESKTOP_OS_LABEL, osFromUserAgent, type DesktopOs } from "@/lib/desktop";

export const dynamic = "force-dynamic";

// Link aziendale da mandare ai colleghi: scaricano l'app (già collegata
// all'azienda dal nome del file) e scrivono l'email di lavoro. Fatto.
// L'estensione del browser resta come alternativa.
export default async function JoinPage({ params, searchParams }: { params: { code: string }; searchParams: { email?: string } }) {
  const org = await db.organization.findUnique({ where: { joinCode: params.code } });
  const token = decryptJson<{ token: string }>(org?.discoveryTokenEncrypted)?.token;
  if (!org || !token) notFound();
  const os = osFromUserAgent(headers().get("user-agent"));
  const other: DesktopOs = os === "mac" ? "windows" : "mac";
  const href = (o: DesktopOs) => `/api/discovery/desktop/download/${params.code}?os=${o}`;

  return (
    <div className="min-h-screen bg-panel flex flex-col items-center justify-center px-6 py-12 gap-6">
      <div className="text-ink-100 mb-2"><Wordmark size={20} /></div>
      <div className="w-full max-w-md rounded-xl border border-line bg-panel p-7 flex flex-col gap-6 shadow-card">
        <div>
          <h1 className="text-xl font-semibold text-ink-100">Join {org.name} on angar</h1>
          <p className="text-sm text-ink-400 mt-1">
            Your company uses angar to see which AI tools are used at work, so it pays only for the seats people need. Only the names of AI tools and the time spent are shared — never pages, prompts or anything you write.
          </p>
        </div>
        <ol className="flex flex-col gap-4 text-sm">
          <li className="flex gap-3">
            <Num n={1} />
            <div className="flex-1 flex flex-col gap-2">
              <span className="font-medium text-ink-100">Download the angar app</span>
              <div className="flex flex-wrap items-center gap-2">
                <a href={href(os)} className="btn btn-primary">Download for {DESKTOP_OS_LABEL[os]}</a>
                <a href={href(other)} className="text-xs text-ink-400 hover:text-ink-100 underline">{DESKTOP_OS_LABEL[other]}</a>
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <Num n={2} />
            <div className="flex-1">
              <span className="font-medium text-ink-100">Open it and type your work email</span>
              <p className="text-ink-400 mt-1">
                {os === "mac" ? (
                  <>Unzip it, then <span className="text-ink-100">right-click → Open</span> the first time (or System Settings → Privacy &amp; Security → Open Anyway).</>
                ) : (
                  <>If Windows shows a blue box, click <span className="text-ink-100">More info → Run anyway</span>.</>
                )}{" "}
                It then runs quietly in the background.
              </p>
            </div>
          </li>
        </ol>
      </div>

      <details className="w-full max-w-md text-sm">
        <summary className="cursor-pointer list-none text-center text-ink-400 hover:text-ink-100 select-none">Can't install apps? Use the browser extension instead</summary>
        <div className="mt-4">
          <JoinConnect
            company={org.name}
            token={token}
            defaultEmail={searchParams.email ?? ""}
            chromeUrl={process.env.CHROME_EXTENSION_URL ?? null}
            edgeUrl={process.env.EDGE_EXTENSION_URL ?? null}
          />
        </div>
      </details>
    </div>
  );
}

function Num({ n }: { n: number }) {
  return <span className="h-7 w-7 shrink-0 rounded-full border border-line text-sm font-medium text-ink-100 flex items-center justify-center">{n}</span>;
}

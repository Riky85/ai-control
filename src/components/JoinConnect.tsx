"use client";

import { useEffect, useState } from "react";

// Collega l'estensione al workspace: la pagina parla con l'estensione
// (content script) tramite window.postMessage. Niente token da copiare.
export default function JoinConnect({ company, token, defaultEmail, chromeUrl, edgeUrl }: { company: string; token: string; defaultEmail: string; chromeUrl: string | null; edgeUrl: string | null }) {
  const [installed, setInstalled] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const check = () => setInstalled(document.documentElement.dataset.angarExtension === "1");
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window) return;
      if (e.data?.type === "angar-extension-ready") setInstalled(true);
      if (e.data?.type === "angar-connected") setDone(true);
    };
    window.addEventListener("message", onMsg);
    check();
    const t = setInterval(check, 1000);
    return () => {
      window.removeEventListener("message", onMsg);
      clearInterval(t);
    };
  }, []);

  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  return (
    <div className="w-full max-w-md rounded-xl border border-line bg-panel p-7 flex flex-col gap-6 shadow-card">
      <div>
        <h1 className="text-xl font-semibold text-ink-100">Connect this browser to {company}</h1>
        <p className="text-sm text-ink-400 mt-1">Your company uses angar to see which AI tools are used at work, so it pays only for the seats people need. Only the names of AI websites are shared — never pages, prompts or other browsing.</p>
      </div>

      {done ? (
        <div className="rounded-lg bg-steady/10 text-steady px-4 py-3 text-sm font-medium">Done — this browser is connected. You can close this page.</div>
      ) : (
        <>
          <Step n={1} title="Add the angar extension" done={installed}>
            {installed ? (
              <p className="text-sm text-steady">Installed.</p>
            ) : chromeUrl || edgeUrl ? (
              <div className="flex gap-2">
                {chromeUrl && <a href={chromeUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">Add to Chrome</a>}
                {edgeUrl && <a href={edgeUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">Add to Edge</a>}
              </div>
            ) : (
              <p className="text-sm text-ink-400">Ask your IT team to install it, or install it from the file they sent you. This page updates by itself once it's there.</p>
            )}
          </Step>
          <Step n={2} title="Your work email" done={false}>
            <div className="flex gap-2">
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" type="email" className="field flex-1" />
              <button
                type="button"
                disabled={!installed || !valid}
                onClick={() => window.postMessage({ type: "angar-connect", token, email: email.trim().toLowerCase() }, window.location.origin)}
                className="btn btn-primary disabled:opacity-50"
              >
                Connect
              </button>
            </div>
          </Step>
        </>
      )}
    </div>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className={`h-7 w-7 shrink-0 rounded-full border text-sm font-medium flex items-center justify-center ${done ? "border-steady text-steady" : "border-line text-ink-100"}`}>{done ? "✓" : n}</span>
      <div className="flex-1 flex flex-col gap-2">
        <div className="text-sm font-medium text-ink-100">{title}</div>
        {children}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Msg = { tone: "error" | "success"; text: string };

/**
 * Messaggi dall'URL (?error=… dai controlli di ruolo e dalle azioni, ?notice=…
 * per le conferme), mostrati allo stesso modo in ogni pagina: un avviso in alto
 * che si chiude. Il parametro si toglie subito dall'URL, così ricaricando o
 * condividendo il link il messaggio non ricompare.
 * Una pagina che mostra l'errore nel suo contesto (es. sotto il campo giusto)
 * mette data-keeps-url-error su quell'elemento: allora qui non si fa nulla.
 */
export default function UrlNotice() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [msg, setMsg] = useState<Msg | null>(null);

  useEffect(() => {
    if (!params) return;
    const error = params.get("error");
    const notice = params.get("notice");
    if (!error && !notice) return;
    if (document.querySelector("[data-keeps-url-error]")) return;
    setMsg(error ? { tone: "error", text: error.slice(0, 400) } : { tone: "success", text: notice!.slice(0, 400) });
    const next = new URLSearchParams(params.toString());
    next.delete("error");
    next.delete("notice");
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}${window.location.hash}`, { scroll: false });
  }, [params, pathname, router]);

  // Le conferme spariscono da sole; gli errori restano finché non si chiudono.
  useEffect(() => {
    if (msg?.tone !== "success") return;
    const t = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(t);
  }, [msg]);

  useEffect(() => {
    if (!msg) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMsg(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [msg]);

  if (!msg) return null;
  const error = msg.tone === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className={`fixed top-3 left-1/2 -translate-x-1/2 z-[60] w-[min(560px,calc(100%-2rem))] flex items-start gap-3 rounded-xl border bg-panel px-4 py-3 text-sm shadow-card print:hidden ${
        error ? "border-alarm/40 text-alarm" : "border-steady/40 text-steady"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="mt-0.5 shrink-0">
        {error ? (
          <>
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 4.5v4M8 11h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </>
        ) : (
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      <span className="flex-1 min-w-0 break-words">{msg.text}</span>
      <button type="button" onClick={() => setMsg(null)} aria-label="Dismiss" className="shrink-0 -mr-1 rounded p-0.5 text-ink-400 hover:text-ink-100">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { VendorBadge } from "./VendorIcon";
import type { SearchHit } from "@/app/api/search/route";
import { MicButton, useVoice, VOICE_ENABLED } from "./Voice";
import CommandReply, { type CommandReplyData } from "./CommandReply";

// Frasi che sono domande o istruzioni: "Chiedi ad angar" diventa la prima riga.
const QUESTION = /(\?\s*$)|^(how|what|who|which|where|when|why|show|open|go|approve|block|allow|ban|list|quanto|quanti|quante|quali|quale|chi|come|dove|perche|mostra|apri|vai|approva|blocca|vieta|consenti|installa|dammi|fammi|portami|ci sono|abbiamo|spendiamo)\b/i;

const GROUP_LABEL: Record<SearchHit["type"], string> = { ai: "AI systems", person: "People", page: "Pages" };
const GROUP_ORDER: SearchHit["type"][] = ["ai", "person", "page"];

// Ricerca globale (Ctrl/Cmd-K, o click sulla barra della sidebar): istantanea,
// fuzzy, raggruppata, navigabile da tastiera.
export default function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const [reply, setReply] = useState<CommandReplyData | null>(null);
  const [asking, setAsking] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setHits([]);
    setActive(0);
    setReply(null);
  }, []);

  // Domanda o istruzione ad angar (scritta o a voce).
  const ask = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      setAsking(true);
      setReply(null);
      try {
        const r = await fetch("/api/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t }) });
        const data = await r.json();
        if (data.go && data.href) {
          close();
          router.push(data.href);
          return;
        }
        setReply({ answer: data.answer || "I didn't get that — try other words.", href: data.href, hrefLabel: data.hrefLabel, confirm: data.confirm, sources: data.sources });
      } catch {
        setReply({ answer: "Something went wrong — try again." });
      } finally {
        setAsking(false);
      }
    },
    [router, close]
  );
  const voice = useVoice((t) => {
    setQ(t);
    ask(t);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") close();
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("angar:search-open", onOpen as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("angar:search-open", onOpen as EventListener);
    };
  }, [close]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  // Ricerca con debounce; scarta le risposte fuori ordine.
  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (!query) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await r.json();
        if (id === seq.current) {
          setHits(Array.isArray(data.hits) ? data.hits : []);
          setActive(0);
        }
      } catch {
        if (id === seq.current) setHits([]);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = useCallback(
    (h: SearchHit | undefined) => {
      if (!h) return;
      close();
      router.push(h.href);
    },
    [router, close]
  );

  if (!open) return null;

  const query = q.trim();
  const askFirst = QUESTION.test(query);
  // Righe navigabili: "Chiedi ad angar" (prima se è una domanda, altrimenti ultima) + risultati.
  const askIdx = !query ? -1 : askFirst ? 0 : hits.length;
  const hitAt = (i: number) => hits[askFirst && query ? i - 1 : i];
  const rows = hits.length + (query ? 1 : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/20 dark:bg-black/50 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-xl rounded-2xl border border-sb-ink/10 bg-pop shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-sb-ink/10">
          <svg width="17" height="17" viewBox="0 0 14 14" fill="none" className="shrink-0 text-sb-muted">
            <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9.2 9.2L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setReply(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, rows - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (active === askIdx) ask(query);
                else go(hitAt(active));
              }
            }}
            placeholder={voice.listening ? voice.interim || "Listening…" : "Search, or ask — “how much do we spend on ChatGPT?”"}
            className="flex-1 bg-transparent py-3.5 text-[15px] text-sb-ink placeholder:text-sb-faint outline-none"
          />
          <MicButton voice={voice} />
          <kbd className="text-[10px] text-sb-muted border border-sb-ink/15 rounded px-1.5 py-0.5 shrink-0">Esc</kbd>
        </div>

        {(reply || asking || voice.error) && (
          <div className="px-4 py-3 border-b border-sb-ink/10 bg-sb-ink/[0.03]">
            {asking ? <p className="text-sm text-sb-muted">Thinking…</p> : reply ? <CommandReply reply={reply} onNavigate={close} /> : <p className="text-sm text-sb-muted">{voice.error}</p>}
          </div>
        )}
        <div className="max-h-[52vh] overflow-y-auto py-2">
          {!query && (
            <div className="px-4 py-5 text-sm text-sb-muted flex flex-col gap-2">
              <p>Search your AI, people and pages — or ask{VOICE_ENABLED && voice.supported ? " (or press the mic and speak)" : ""}:</p>
              <div className="flex flex-wrap gap-1.5">
                {["How much do we spend on AI?", "Where can we save?", "Unused seats", "What's new this month?", "What needs review?"].map((x) => (
                  <button key={x} onClick={() => { setQ(x); ask(x); }} className="text-xs rounded-full border border-sb-ink/15 px-2.5 py-1 text-sb-text hover:text-sb-ink hover:bg-sb-ink/[0.06]">
                    {x}
                  </button>
                ))}
              </div>
            </div>
          )}
          {query && askFirst && <AskRow q={query} active={active === askIdx} onHover={() => setActive(askIdx)} onClick={() => ask(query)} />}
          {GROUP_ORDER.map((type) => {
            const group = hits.filter((h) => h.type === type);
            if (group.length === 0) return null;
            return (
              <div key={type} className="mb-1">
                <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-sb-faint">{GROUP_LABEL[type]}</div>
                {group.map((h) => {
                  const idx = hits.indexOf(h) + (askFirst && query ? 1 : 0);
                  return (
                    <button
                      key={h.href + h.label}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(h)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${idx === active ? "bg-sb-ink/[0.08]" : "hover:bg-sb-ink/[0.04]"}`}
                    >
                      {h.type === "ai" ? (
                        <VendorBadge vendor={h.vendor ?? ""} name={h.label} size={26} />
                      ) : (
                        <span className="h-[26px] w-[26px] shrink-0 rounded-lg bg-sb-ink/[0.06] flex items-center justify-center text-sb-text">
                          {h.type === "person" ? <PersonGlyph /> : <PageGlyph />}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-sb-ink truncate">{h.label}</span>
                        {h.sub && <span className="block text-xs text-sb-muted truncate">{h.sub}</span>}
                      </span>
                      {idx === active && <span className="text-[11px] text-sb-muted shrink-0">↵</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {query && !askFirst && <AskRow q={query} active={active === askIdx} onHover={() => setActive(askIdx)} onClick={() => ask(query)} />}
        </div>
      </div>
    </div>
  );
}

function AskRow({ q, active, onHover, onClick }: { q: string; active: boolean; onHover: () => void; onClick: () => void }) {
  return (
    <button onMouseEnter={onHover} onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${active ? "bg-sb-ink/[0.08]" : "hover:bg-sb-ink/[0.04]"}`}>
      <span className="h-[26px] w-[26px] shrink-0 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z" /></svg>
      </span>
      <span className="min-w-0 flex-1 text-sm text-sb-ink truncate">
        Ask angar: <span className="text-sb-text">“{q}”</span>
      </span>
      {active && <span className="text-[11px] text-sb-muted shrink-0">↵</span>}
    </button>
  );
}

function PersonGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="6" r="2.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.5 15c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function PageGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
      <rect x="3.5" y="2.5" width="11" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.5 6h5M6.5 9h5M6.5 12h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

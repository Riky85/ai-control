"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { VendorBadge } from "./VendorIcon";
import type { SearchHit } from "@/app/api/search/route";

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

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setHits([]);
    setActive(0);
  }, []);

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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-xl rounded-2xl border border-white/10 bg-[#25282B] shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-white/10">
          <svg width="17" height="17" viewBox="0 0 14 14" fill="none" className="shrink-0 text-[#A3A19C]">
            <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9.2 9.2L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(hits[active]);
              }
            }}
            placeholder="Search AI, people, pages…"
            className="flex-1 bg-transparent py-3.5 text-[15px] text-white placeholder:text-[#8A8884] outline-none"
          />
          <kbd className="text-[10px] text-[#A3A19C] border border-white/15 rounded px-1.5 py-0.5 shrink-0">Esc</kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-2">
          {q.trim() && !loading && hits.length === 0 && <p className="px-4 py-6 text-center text-sm text-[#A3A19C]">No matches for "{q}".</p>}
          {!q.trim() && <p className="px-4 py-6 text-center text-sm text-[#A3A19C]">Type to search across your AI, people and pages.</p>}
          {GROUP_ORDER.map((type) => {
            const group = hits.filter((h) => h.type === type);
            if (group.length === 0) return null;
            return (
              <div key={type} className="mb-1">
                <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#8A8884]">{GROUP_LABEL[type]}</div>
                {group.map((h) => {
                  const idx = hits.indexOf(h);
                  return (
                    <button
                      key={h.href + h.label}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(h)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${idx === active ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"}`}
                    >
                      {h.type === "ai" ? (
                        <VendorBadge vendor={h.vendor ?? ""} name={h.label} size={26} />
                      ) : (
                        <span className="h-[26px] w-[26px] shrink-0 rounded-lg bg-white/[0.06] flex items-center justify-center text-[#C8C6C1]">
                          {h.type === "person" ? <PersonGlyph /> : <PageGlyph />}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-white truncate">{h.label}</span>
                        {h.sub && <span className="block text-xs text-[#A3A19C] truncate">{h.sub}</span>}
                      </span>
                      {idx === active && <span className="text-[11px] text-[#A3A19C] shrink-0">↵</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
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

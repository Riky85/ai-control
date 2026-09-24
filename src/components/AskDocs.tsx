"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: { slug: string; title: string }[];
}
interface DocLink {
  slug: string;
  title: string;
  section: string;
  summary: string;
}

const SUGGESTIONS = ["How do I connect Claude?", "How do I import a CSV?", "How do I share a dashboard?", "What do the plans include?"];

// Widget in basso a destra: "Ask docs" — assistente + elenco guide.
export default function AskDocs({ docs }: { docs: DocLink[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"ask" | "docs">("ask");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, loading]);
  if (pathname.startsWith("/share")) return null;

  async function ask(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, history }) });
      const json = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: json.answer, sources: json.sources }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Something went wrong — try again, or browse the Docs tab." }]);
    } finally {
      setLoading(false);
    }
  }

  const shown = docs.filter((d) => `${d.title} ${d.summary}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="fixed bottom-5 right-5 z-40 print:hidden">
      {open && (
        <div className="mb-3 w-[380px] h-[540px] rounded-2xl border border-line bg-panel shadow-2xl flex flex-col overflow-hidden animate-rise">
          <div className="px-4 pt-4 pb-3 border-b border-line">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-ink-100">Angar help</div>
                <div className="text-xs text-ink-400">Answers from the Angar documentation</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="h-7 w-7 rounded-lg text-ink-400 hover:text-ink-100 hover:bg-black/[0.04] flex items-center justify-center">
                ✕
              </button>
            </div>
            <div className="inline-flex gap-1 bg-ink rounded-lg p-1 mt-3">
              {(["ask", "docs"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`text-xs px-3 py-1 rounded-md transition-colors ${tab === t ? "bg-panel text-ink-100 font-medium shadow-card" : "text-ink-400 hover:text-ink-100"}`}>
                  {t === "ask" ? "Ask" : "Docs"}
                </button>
              ))}
            </div>
          </div>

          {tab === "ask" ? (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
                {messages.length === 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-ink-400">Hi! Ask how to do something in Angar.</p>
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => ask(s)} className="text-left text-sm text-ink-100 border border-line rounded-lg px-3 py-2 hover:bg-black/[0.03] transition-colors">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "self-end max-w-[85%]" : "self-start max-w-[92%]"}>
                    <div className={`text-sm rounded-2xl px-3.5 py-2 whitespace-pre-line ${m.role === "user" ? "bg-ink-100 text-white rounded-br-md" : "bg-ink text-ink-100 rounded-bl-md"}`}>{m.content}</div>
                    {m.sources && m.sources.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {m.sources.map((s) => (
                          <Link key={s.slug} href={`/docs/${s.slug}`} className="text-xs text-ink-400 border border-line rounded-full px-2 py-0.5 hover:text-ink-100 hover:border-ink-400 transition-colors">
                            {s.title} →
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {loading && <div className="self-start text-sm text-ink-400 bg-ink rounded-2xl px-3.5 py-2">…</div>}
                <div ref={endRef} />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(input);
                }}
                className="p-3 border-t border-line flex gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question…"
                  className="flex-1 min-w-0 border border-line rounded-lg px-3 py-2 text-sm text-ink-100 placeholder:text-ink-400 outline-none focus:border-ink-400"
                />
                <button disabled={loading || !input.trim()} className="btn btn-primary disabled:opacity-50">Send</button>
              </form>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="p-3 border-b border-line">
                <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search the docs" className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink-100 placeholder:text-ink-400 outline-none focus:border-ink-400" />
              </div>
              <div className="divide-y divide-line">
                {shown.map((d) => (
                  <Link key={d.slug} href={`/docs/${d.slug}`} onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-black/[0.02] transition-colors">
                    <div className="text-[11px] text-ink-400">{d.section}</div>
                    <div className="text-sm font-medium text-ink-100">{d.title}</div>
                    <div className="text-xs text-ink-400 line-clamp-2">{d.summary}</div>
                  </Link>
                ))}
              </div>
              <Link href="/docs" onClick={() => setOpen(false)} className="block text-center text-sm text-ink-100 font-medium py-3 border-t border-line hover:bg-black/[0.02]">
                Open full documentation
              </Link>
            </div>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="ml-auto flex items-center gap-2 rounded-full bg-ink-100 text-white pl-3.5 pr-4 py-2.5 text-sm font-medium shadow-lg hover:bg-black transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 2.5h6.5L13 6v7.5H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M9.5 2.5V6H13M5.5 9h5M5.5 11.5h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {open ? "Close" : "Ask docs"}
      </button>
    </div>
  );
}

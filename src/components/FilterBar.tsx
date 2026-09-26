"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface FilterDef {
  param: string;
  label: string;
  options: { value: string; label: string }[];
}

/**
 * Barra filtri unica per tutta la piattaforma: ricerca + menu a tendina
 * (stessa altezza dei pulsanti), applicazione immediata tramite URL,
 * filtri attivi evidenziati e azzerabili con un clic.
 */
export default function FilterBar({
  search,
  filters = [],
  right,
}: {
  search?: { param?: string; placeholder: string };
  filters?: FilterDef[];
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const sp = search?.param ?? "q";
  const [q, setQ] = useState(params.get(sp) ?? "");
  const first = useRef(true);

  const push = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Ricerca "mentre scrivi", con una piccola attesa.
  useEffect(() => {
    if (!search) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      if ((params.get(sp) ?? "") !== q.trim()) push({ [sp]: q.trim() || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = filters.filter((f) => params.get(f.param));
  const any = active.length > 0 || Boolean(params.get(sp));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {search && (
        <label className="flex items-center gap-2 h-9 w-72 border border-line rounded-lg bg-panel px-3 focus-within:border-ink-400 transition-colors">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-ink-400 shrink-0" aria-hidden>
            <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9.2 9.2L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={search.placeholder}
            className="flex-1 min-w-0 bg-transparent text-sm text-ink-100 placeholder:text-ink-400 outline-none"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="text-ink-400 hover:text-ink-100 text-xs">
              ✕
            </button>
          )}
        </label>
      )}
      {filters.map((f) => (
        <FilterMenu key={f.param} def={f} value={params.get(f.param)} onChange={(v) => push({ [f.param]: v })} />
      ))}
      {any && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            push(Object.fromEntries([sp, ...filters.map((f) => f.param)].map((k) => [k, null])));
          }}
          className="h-9 px-2 text-sm text-ink-400 hover:text-ink-100 transition-colors"
        >
          Clear all
        </button>
      )}
      {right && <div className="ml-auto text-sm text-ink-400">{right}</div>}
    </div>
  );
}

function FilterMenu({ def, value, onChange }: { def: FilterDef; value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  const current = def.options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <div
        className={`h-9 inline-flex items-center rounded-lg border text-sm transition-colors ${
          current ? "border-accent/50 bg-accent-soft text-ink-100" : "border-line bg-panel text-ink-100 hover:border-ink-400"
        }`}
      >
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="h-full inline-flex items-center gap-1.5 pl-3 pr-2.5">
          <span className="text-ink-400">{def.label}</span>
          <span className="font-medium">{current?.label ?? "All"}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
            <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
        {current && (
          <button type="button" onClick={() => onChange(null)} aria-label={`Remove ${def.label} filter`} className="h-full pr-2.5 text-xs text-ink-400 hover:text-ink-100">
            ✕
          </button>
        )}
      </div>
      {open && (
        <div role="listbox" className="absolute z-30 mt-1.5 min-w-[200px] rounded-xl border border-line bg-panel shadow-xl p-1.5 animate-rise">
          {[{ value: "", label: "All" }, ...def.options].map((o) => {
            const on = (value ?? "") === o.value;
            return (
              <button
                key={o.value || "all"}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(o.value || null);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors ${on ? "bg-ink text-ink-100 font-medium" : "text-ink-100 hover:bg-ink-100/[0.04]"}`}
              >
                {o.label}
                {on && (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-accent" aria-hidden>
                    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

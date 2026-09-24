"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Pulsante Export: Excel (file .xlsx generato dal server con i dati reali)
 * e PDF (stampa della pagina con il layout di stampa → "Salva come PDF").
 */
export default function ExportMenu({ dataset, label = "Export" }: { dataset?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative print:hidden">
      <button onClick={() => setOpen((v) => !v)} className="btn btn-secondary">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M8 2v8m0 0L5 7m3 3l3-3M3 12v1.5h10V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-56 z-30 rounded-xl border border-line bg-panel shadow-lg p-1.5 text-sm">
          {dataset && (
            <a href={`/api/export/${dataset}`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-ink-100 hover:bg-black/[0.04] transition-colors">
              <span className="h-6 w-6 rounded-md bg-[#1F7244] text-white text-[10px] font-bold flex items-center justify-center">XLS</span>
              <span>
                <span className="block">Excel</span>
                <span className="block text-xs text-ink-400">All rows, ready to filter</span>
              </span>
            </a>
          )}
          <button
            onClick={() => {
              setOpen(false);
              setTimeout(() => window.print(), 50);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-ink-100 hover:bg-black/[0.04] transition-colors"
          >
            <span className="h-6 w-6 rounded-md bg-[#C4433B] text-white text-[10px] font-bold flex items-center justify-center">PDF</span>
            <span>
              <span className="block">PDF</span>
              <span className="block text-xs text-ink-400">This page, print-ready</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

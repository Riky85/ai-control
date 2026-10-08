"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Pulsante Export: Excel (file .xlsx generato dal server con i dati reali)
 * e PDF (stampa della pagina con il layout di stampa → "Salva come PDF").
 */
export default function ExportMenu({ dataset, csv, label = "Export" }: { dataset?: string; /** Link a un export CSV (opzionale). */ csv?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative print:hidden">
      <button onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className="btn btn-secondary">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M8 2v8m0 0L5 7m3 3l3-3M3 12v1.5h10V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </button>
      {open && (
        <div role="menu" className="menu absolute left-0 lg:left-auto lg:right-0 mt-1.5 w-56 z-30">
          {dataset && (
            <a href={`/api/export/${dataset}`} onClick={() => setOpen(false)} role="menuitem" className="menu-item">
              <span className="h-6 w-6 rounded-md bg-steady text-white text-[10px] font-bold flex items-center justify-center">XLS</span>
              <span>
                <span className="block">Excel</span>
                <span className="block text-xs text-ink-400">All rows, ready to filter</span>
              </span>
            </a>
          )}
          {csv && (
            <a href={csv} onClick={() => setOpen(false)} role="menuitem" className="menu-item">
              <span className="h-6 w-6 rounded-md bg-ink-100 text-panel text-[10px] font-bold flex items-center justify-center">CSV</span>
              <span>
                <span className="block">CSV</span>
                <span className="block text-xs text-ink-400">Plain table, any tool</span>
              </span>
            </a>
          )}
          <button
            onClick={() => {
              setOpen(false);
              setTimeout(() => window.print(), 50);
            }}
            role="menuitem"
            className="menu-item"
          >
            <span className="h-6 w-6 rounded-md bg-alarm text-white text-[10px] font-bold flex items-center justify-center">PDF</span>
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

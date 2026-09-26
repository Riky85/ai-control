"use client";

import { useState } from "react";

// Area di caricamento: clic o trascinamento del file; mostra il nome scelto.
export default function CsvDropzone({ accept = ".csv,text/csv", label = "Choose a CSV file or drag it here", multiple = false }: { accept?: string; label?: string; multiple?: boolean }) {
  const [name, setName] = useState<string | null>(null);
  return (
    <label className="relative flex items-center gap-3 rounded-lg border border-dashed border-line bg-ink px-4 py-3 cursor-pointer hover:border-ink-400 transition-colors">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-ink-400 shrink-0">
        <path d="M9 12V3M5.5 6.5L9 3l3.5 3.5M3 12.5v1A1.5 1.5 0 004.5 15h9a1.5 1.5 0 001.5-1.5v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-sm truncate">
        {name ? <span className="text-ink-100 font-medium">{name}</span> : <span className="text-ink-400">{label}</span>}
      </span>
      <input
        name="file"
        type="file"
        accept={accept}
        required
        multiple={multiple}
        onChange={(e) => {
          const f = e.target.files;
          setName(!f || f.length === 0 ? null : f.length === 1 ? f[0].name : `${f.length} files`);
        }}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
    </label>
  );
}

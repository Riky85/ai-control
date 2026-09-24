"use client";

import { useState } from "react";

export default function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={value} className="flex-1 min-w-0 border border-line rounded-lg px-3 py-2 text-sm text-ink-400 bg-ink font-mono" onFocus={(e) => e.target.select()} />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="btn btn-secondary btn-sm"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <a href={value} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Open</a>
    </div>
  );
}

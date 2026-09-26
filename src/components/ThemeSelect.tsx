"use client";

import { useState } from "react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

const OPTIONS: { id: Theme; label: string; icon: JSX.Element }[] = [
  {
    id: "light",
    label: "Light",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "dark",
    label: "Dark",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "system",
    label: "System",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5.5 14h5M8 11.5V14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
];

let mql: MediaQueryList | null = null;
const onSystemChange = () => document.documentElement.classList.toggle("dark", !!mql?.matches);

function apply(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  mql = mql ?? window.matchMedia("(prefers-color-scheme: dark)");
  mql.removeEventListener("change", onSystemChange);
  if (theme === "system") {
    mql.addEventListener("change", onSystemChange);
    onSystemChange();
  } else {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
}

// Scelta del tema (chiaro, scuro, di sistema): si applica subito, senza
// ricaricare, ed è ricordata in un cookie così il server disegna già il tema giusto.
export default function ThemeSelect({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
      {OPTIONS.map((o) => {
        const on = theme === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              setTheme(o.id);
              apply(o.id);
            }}
            className={`btn btn-sm ${on ? "border border-accent text-ink-100 bg-accent-soft" : "btn-secondary text-ink-400"}`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

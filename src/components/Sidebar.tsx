"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "Overview", short: "Ov" },
  { href: "/assets", label: "AI assets", short: "As" },
  { href: "/approvals", label: "Approvals", short: "Ap" },
  { href: "/policies", label: "Policies", short: "Po" },
  { href: "/people", label: "People", short: "Pe" },
  { href: "/data", label: "Data registry", short: "Da" },
  { href: "/activity", label: "Activity", short: "Ac" },
  { href: "/connectors", label: "Connectors", short: "Co" },
  { href: "/evidence", label: "Evidence", short: "Ev" },
  { href: "/settings", label: "Settings", short: "Se" },
];

const STORAGE_KEY = "ai-control:sidebar-collapsed";

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // localStorage non disponibile (es. privacy mode): resta espansa.
    }
    setReady(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // best-effort: la preferenza semplicemente non persiste.
      }
      return next;
    });
  }

  return (
    <aside
      className={`shrink-0 border-r border-line bg-panel min-h-screen py-6 flex flex-col transition-[width] duration-150 ${
        collapsed ? "w-[68px] px-3" : "w-60 px-5"
      } ${ready ? "" : "invisible"}`}
    >
      <div className={`flex items-center mb-8 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && (
          <span className="font-semibold text-[15px] tracking-tight text-ink-100">AI Control</span>
        )}
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="h-7 w-7 flex items-center justify-center rounded text-ink-400 hover:text-ink-100 hover:bg-white/[0.05] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d={collapsed ? "M4 2 L9 7 L4 12" : "M9 2 L4 7 L9 12"}
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`rounded text-sm transition-colors ${
                collapsed ? "px-0 py-2 text-center" : "px-3 py-2"
              } ${
                active
                  ? "text-ink-100 bg-white/[0.05]"
                  : "text-ink-400 hover:text-ink-100 hover:bg-white/[0.03]"
              }`}
            >
              {collapsed ? item.short : item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

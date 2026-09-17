"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "./Logo";

// Icone minimali, un solo stroke-width, coerenti tra loro — niente set di
// icone eterogeneo preso da librerie diverse.
function Icon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 18 18", fill: "none" as const };
  const stroke = { stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "home":
      return <svg {...common}><path {...stroke} d="M2.5 8 9 2.5 15.5 8" /><path {...stroke} d="M4 6.8V15h10V6.8" /></svg>;
    case "assets":
      return <svg {...common}><rect {...stroke} x="2.5" y="2.5" width="5.5" height="5.5" rx="1" /><rect {...stroke} x="10" y="2.5" width="5.5" height="5.5" rx="1" /><rect {...stroke} x="2.5" y="10" width="5.5" height="5.5" rx="1" /><rect {...stroke} x="10" y="10" width="5.5" height="5.5" rx="1" /></svg>;
    case "people":
      return <svg {...common}><circle {...stroke} cx="7" cy="6" r="2.3" /><path {...stroke} d="M2.5 15c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" /><circle {...stroke} cx="13" cy="5.5" r="1.8" /><path {...stroke} d="M11.5 8.2c1.9.3 3 1.5 3 3.8" /></svg>;
    case "data":
      return <svg {...common}><ellipse {...stroke} cx="9" cy="4" rx="5.5" ry="1.8" /><path {...stroke} d="M3.5 4v10c0 1 2.5 1.8 5.5 1.8s5.5-.8 5.5-1.8V4" /><path {...stroke} d="M3.5 9c0 1 2.5 1.8 5.5 1.8s5.5-.8 5.5-1.8" /></svg>;
    case "approvals":
      return <svg {...common}><rect {...stroke} x="3" y="2.5" width="12" height="13" rx="1.5" /><path {...stroke} d="M6 9l2 2 4-4.5" /></svg>;
    case "policies":
      return <svg {...common}><path {...stroke} d="M9 2.5l6 2v4c0 4-2.5 6.7-6 8-3.5-1.3-6-4-6-8v-4l6-2z" /></svg>;
    case "activity":
      return <svg {...common}><path {...stroke} d="M2.5 10h3l1.5-4 2.5 7 1.5-3h4" /></svg>;
    case "evidence":
      return <svg {...common}><rect {...stroke} x="3.5" y="2" width="11" height="14" rx="1.2" /><path {...stroke} d="M6.5 6h5M6.5 9h5M6.5 12h3" /></svg>;
    case "connectors":
      return <svg {...common}><circle {...stroke} cx="4.5" cy="9" r="2" /><circle {...stroke} cx="13.5" cy="9" r="2" /><path {...stroke} d="M6.5 9h5" /></svg>;
    case "settings":
      return <svg {...common}><circle {...stroke} cx="9" cy="9" r="2.6" /><path {...stroke} d="M9 2.8v2M9 13.2v2M14.2 9h2M1.8 9h2M12.7 5.3l1.4-1.4M3.9 14.1l1.4-1.4M12.7 12.7l1.4 1.4M3.9 3.9l1.4 1.4" /></svg>;
    case "onboarding":
      return <svg {...common}><circle {...stroke} cx="9" cy="9" r="6.5" /><path {...stroke} d="M9 5.5v4l2.5 1.5" /></svg>;
    default:
      return null;
  }
}

function PanelToggleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 2.5V13.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

const NAV_GROUPS: { label: string | null; items: { href: string; label: string; icon: string }[] }[] = [
  { label: null, items: [{ href: "/", label: "Overview", icon: "home" }] },
  {
    label: "Inventory",
    items: [
      { href: "/assets", label: "AI Assets", icon: "assets" },
      { href: "/people", label: "People", icon: "people" },
      { href: "/data", label: "Data Exposure", icon: "data" },
    ],
  },
  {
    label: "Governance",
    items: [
      { href: "/approvals", label: "Reviews", icon: "approvals" },
      { href: "/policies", label: "Policies", icon: "policies" },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { href: "/activity", label: "Activity", icon: "activity" },
      { href: "/evidence", label: "Evidence", icon: "evidence" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/connectors", label: "Connections", icon: "connectors" },
      { href: "/settings", label: "Settings", icon: "settings" },
    ],
  },
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
      // localStorage non disponibile: resta espansa.
    }
    setReady(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // best-effort
      }
      return next;
    });
  }

  return (
    <aside
      className={`shrink-0 bg-[#0A0A0B] min-h-screen py-6 flex flex-col transition-[width] duration-150 ${
        collapsed ? "w-[64px] px-3" : "w-60 px-4"
      } ${ready ? "" : "invisible"}`}
    >
      {!collapsed && (
        <div className="flex items-center mb-7 gap-2 px-1">
          <span className="text-white shrink-0">
            <Logo size={16} />
          </span>
          <span className="font-semibold text-[15px] tracking-tight text-white">AI Control</span>
          <button
            onClick={toggle}
            aria-label="Collapse sidebar"
            className="ml-auto h-7 w-7 flex items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <PanelToggleIcon />
          </button>
        </div>
      )}
      {collapsed && (
        <button
          onClick={toggle}
          aria-label="Expand sidebar"
          className="group relative h-8 w-8 mx-auto mb-5 flex items-center justify-center"
        >
          <span className="text-white transition-opacity group-hover:opacity-0">
            <Logo size={16} />
          </span>
          <span className="absolute inset-0 flex items-center justify-center text-white/70 opacity-0 group-hover:opacity-100 group-hover:text-white transition-opacity rounded hover:bg-white/[0.08]">
            <PanelToggleIcon />
          </span>
        </button>
      )}

      <nav className="flex flex-col gap-5 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className="flex flex-col gap-0.5">
            {group.label && !collapsed && (
              <div className="text-[11px] text-white/35 px-3 mb-1">{group.label}</div>
            )}
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`relative flex items-center gap-2.5 text-sm transition-colors ${
                    collapsed ? "justify-center px-0 py-2.5 rounded-md" : "pl-3 pr-3 py-2 rounded-r-md"
                  } ${
                    active
                      ? "text-white bg-white/[0.05]"
                      : "text-white/55 hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  <Icon name={item.icon} />
                  {!collapsed && item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

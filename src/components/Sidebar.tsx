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
      return <svg {...common}><rect {...stroke} x="2.5" y="2.5" width="13" height="13" rx="1.5" /><path {...stroke} d="M2.5 7h13" /><path {...stroke} d="M7 7v8.5" /></svg>;
    case "assets":
      return <svg {...common}><rect {...stroke} x="2.5" y="2.5" width="5.5" height="5.5" rx="1" /><rect {...stroke} x="10" y="2.5" width="5.5" height="5.5" rx="1" /><rect {...stroke} x="2.5" y="10" width="5.5" height="5.5" rx="1" /><rect {...stroke} x="10" y="10" width="5.5" height="5.5" rx="1" /></svg>;
    case "people":
      return <svg {...common}><circle {...stroke} cx="7" cy="6" r="2.3" /><path {...stroke} d="M2.5 15c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" /><circle {...stroke} cx="13" cy="5.5" r="1.8" /><path {...stroke} d="M11.5 8.2c1.9.3 3 1.5 3 3.8" /></svg>;
    case "data":
      return <svg {...common}><ellipse {...stroke} cx="9" cy="4" rx="5.5" ry="1.8" /><path {...stroke} d="M3.5 4v10c0 1 2.5 1.8 5.5 1.8s5.5-.8 5.5-1.8V4" /><path {...stroke} d="M3.5 9c0 1 2.5 1.8 5.5 1.8s5.5-.8 5.5-1.8" /></svg>;
    case "savings":
      return <svg {...common}><circle {...stroke} cx="9" cy="9" r="7" /><path {...stroke} d="M9 5.5v1M9 11.5v1" /><path {...stroke} d="M11 7.2c0-.9-.9-1.7-2-1.7s-2 .6-2 1.5c0 2 4 1 4 3 0 .9-.9 1.5-2 1.5s-2-.8-2-1.7" /></svg>;
    case "providers":
      return <svg {...common}><circle {...stroke} cx="9" cy="3.5" r="1.8" /><circle {...stroke} cx="4" cy="14" r="1.8" /><circle {...stroke} cx="14" cy="14" r="1.8" /><path {...stroke} d="M9 5.3v3.2M9 8.5L5 12.5M9 8.5l4 4" /></svg>;
    case "changes":
      return <svg {...common}><path {...stroke} d="M4 5h7a3 3 0 013 3v.5" /><path {...stroke} d="M9.5 5.5L7 8 9.5 10.5" transform="translate(-2,0)" /><path {...stroke} d="M14 13H7a3 3 0 01-3-3v-.5" /><path {...stroke} d="M8.5 12.5L11 10l-2.5-2.5" transform="translate(2,0)" /></svg>;
    case "assurance":
      return <svg {...common}><path {...stroke} d="M9 2.2l5.5 2v4c0 4-2.5 6.5-5.5 7.6-3-1.1-5.5-3.6-5.5-7.6v-4l5.5-2z" /><path {...stroke} d="M6.3 9l1.8 1.8L11.7 7" /></svg>;
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

// Lista piatta, come Angar: nessun raggruppamento con etichette, nessuno
// spazio extra tra "sezioni" — solo una spaziatura uniforme tra voci.
const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: "home" },
  { href: "/assets", label: "AI Passports", icon: "assets" },
  { href: "/providers", label: "Providers", icon: "providers" },
  { href: "/savings", label: "Savings", icon: "savings" },
  { href: "/changes", label: "Changes", icon: "changes" },
  { href: "/people", label: "People", icon: "people" },
  { href: "/data", label: "Data Exposure", icon: "data" },
  { href: "/governance", label: "Governance", icon: "assurance" },
  { href: "/activity", label: "Activity", icon: "activity" },
  { href: "/connectors", label: "Connections", icon: "connectors" },
];

const STORAGE_KEY = "ai-control:sidebar-collapsed";

// Sidebar stile Angar: sfondo appena grigiastro (contro il bianco pieno del
// contenuto), lista piatta senza sezioni, Settings separato in fondo da una
// riga sottile — non un gruppo tra tanti.
export default function Sidebar({ orgName }: { orgName?: string }) {
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

  function itemClass(active: boolean) {
    return `relative flex items-center gap-2.5 text-sm transition-colors ${
      collapsed ? "justify-center px-0 py-2.5 rounded-md" : "px-3 py-2 rounded-md"
    } ${active ? "text-ink-100 bg-black/[0.045] font-medium" : "text-ink-400 hover:text-ink-100 hover:bg-black/[0.03]"}`;
  }

  return (
    <aside
      className={`shrink-0 bg-ink h-full py-6 flex flex-col transition-[width] duration-150 ${
        collapsed ? "w-[64px] px-3" : "w-60 px-4"
      } ${ready ? "" : "invisible"}`}
    >
      {!collapsed && (
        <div className="flex items-center mb-6 gap-2 px-3">
          <span className="text-ink-100 shrink-0">
            <Logo size={16} />
          </span>
          <span className="font-semibold text-[15px] tracking-tight text-ink-100">Angar</span>
          <button
            onClick={toggle}
            aria-label="Collapse sidebar"
            className="ml-auto h-7 w-7 flex items-center justify-center rounded text-ink-400 hover:text-ink-100 hover:bg-black/[0.05] transition-colors"
          >
            <PanelToggleIcon />
          </button>
        </div>
      )}
      {!collapsed && (
        <form action="/search" method="GET" className="mb-5 px-3">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-line bg-panel">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-ink-400 shrink-0">
              <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M9.2 9.2L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              name="q"
              placeholder="Search AI systems..."
              className="flex-1 bg-transparent text-xs text-ink-100 placeholder:text-ink-400 outline-none min-w-0"
            />
            <kbd className="text-[10px] text-ink-400 border border-line rounded px-1 shrink-0">/</kbd>
          </div>
        </form>
      )}
      {collapsed && (
        <button
          onClick={toggle}
          aria-label="Expand sidebar"
          className="group relative h-8 w-8 mx-auto mb-4 flex items-center justify-center"
        >
          <span className="text-ink-100 transition-opacity group-hover:opacity-0">
            <Logo size={16} />
          </span>
          <span className="absolute inset-0 flex items-center justify-center text-ink-400 opacity-0 group-hover:opacity-100 group-hover:text-ink-100 transition-opacity rounded hover:bg-black/[0.05]">
            <PanelToggleIcon />
          </span>
        </button>
      )}

      <nav className="flex flex-col gap-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} className={itemClass(pathname === item.href)}>
            <Icon name={item.icon} />
            {!collapsed && item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 pt-3 border-t border-line">
        <Link href="/settings" title={collapsed ? "Settings" : undefined} className={itemClass(pathname === "/settings")}>
          <Icon name="settings" />
          {!collapsed && "Settings"}
        </Link>
      </div>

      {orgName && (
        <div className={`mt-4 pt-3 border-t border-line flex items-center gap-2.5 ${collapsed ? "justify-center px-0" : "px-3"}`}>
          <div className="h-6 w-6 rounded-full bg-black/[0.06] flex items-center justify-center text-[11px] text-ink-400 shrink-0">
            {orgName.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-xs text-ink-100 truncate">{orgName}</div>
              <div className="text-[10px] text-ink-400">Organization</div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

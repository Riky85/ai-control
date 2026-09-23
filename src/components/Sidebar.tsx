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

// Due gruppi, non una lista piatta di 10 voci: le 5 cose che rispondono
// davvero alla domanda del prodotto (cosa abbiamo, da chi dipende, cosa
// costa, cosa cambia) in evidenza; il resto — supporto/governance — sotto,
// visivamente più piccolo e silenzioso. Meno cose in vista = più facile
// da capire al primo sguardo.
const PRIMARY_ITEMS = [
  { href: "/", label: "Overview", icon: "home" },
  { href: "/assets", label: "AI Passports", icon: "assets" },
  { href: "/providers", label: "Providers", icon: "providers" },
  { href: "/savings", label: "Savings", icon: "savings" },
  { href: "/changes", label: "Changes", icon: "changes" },
];

const MORE_ITEMS = [
  { href: "/people", label: "People", icon: "people" },
  { href: "/data", label: "Data Exposure", icon: "data" },
  { href: "/governance", label: "Governance", icon: "assurance" },
  { href: "/activity", label: "Activity", icon: "activity" },
];

// Chiave nuova: chi aveva la sidebar chiusa con la versione precedente la
// ritrova aperta (default richiesto), poi la sua scelta viene ricordata.
const STORAGE_KEY = "angar:sidebar-collapsed-v2";

// Sidebar in stile Claude Console: nome del prodotto in serif, selettore
// organizzazione, ricerca con scorciatoia, voci principali, gruppo "More"
// richiudibile, utente in fondo. Aperta di default.
export default function Sidebar({ orgName }: { orgName?: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // localStorage non disponibile: resta aperta.
    }
    setReady(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCollapsed(false);
        setTimeout(() => document.getElementById("sidebar-search")?.focus(), 50);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  function itemClass(active: boolean, sub = false) {
    return `flex items-center gap-3 text-[15px] transition-colors rounded-lg ${
      collapsed ? "justify-center px-0 py-2.5" : sub ? "pl-11 pr-3 py-1.5" : "px-3 py-2"
    } ${active ? "text-white bg-white/[0.09] font-medium" : "text-[#C8C6C1] hover:text-white hover:bg-white/[0.05]"}`;
  }

  return (
    <aside
      className={`shrink-0 bg-[#1A1918] border-r border-white/[0.08] h-full py-3 flex flex-col transition-[width] duration-150 ${
        collapsed ? "w-[68px] px-2.5" : "w-64 px-3"
      } ${ready ? "" : "invisible"}`}
    >
      <div className={`flex items-center mb-4 ${collapsed ? "justify-center" : "px-2"}`}>
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2 text-white">
            <Logo size={16} />
            <span className="font-serif text-[20px] leading-none tracking-tight">Angar</span>
          </Link>
        )}
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`h-8 w-8 flex items-center justify-center rounded-lg text-[#A3A19C] hover:text-white hover:bg-white/[0.08] transition-colors ${collapsed ? "" : "ml-auto"}`}
        >
          <PanelToggleIcon />
        </button>
      </div>

      {!collapsed && (
        <>
          <Link
            href="/settings"
            className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg border border-white/[0.12] bg-white/[0.03] text-[15px] text-white hover:bg-white/[0.06] transition-colors"
          >
            <span className="h-4 w-4 rounded bg-accent shrink-0" />
            <span className="flex-1 truncate">{orgName ?? "Organization"}</span>
            <Chevron />
          </Link>
          <form action="/search" method="GET" className="mb-4">
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.12] text-[#A3A19C] focus-within:border-white/30">
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none" className="shrink-0">
                <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.3" />
                <path d="M9.2 9.2L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <input
                id="sidebar-search"
                name="q"
                placeholder="Search AI systems…"
                className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-[#8A8884] outline-none"
              />
              <kbd className="text-[10px] text-[#A3A19C] border border-white/[0.15] rounded px-1 shrink-0">Ctrl K</kbd>
            </label>
          </form>
        </>
      )}

      <nav className="flex flex-col gap-0.5 overflow-y-auto flex-1 min-h-0">
        {PRIMARY_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} className={itemClass(isActive(item.href))}>
            <Icon name={item.icon} />
            {!collapsed && item.label}
          </Link>
        ))}

        {collapsed ? (
          <div className="my-2 border-t border-white/[0.08]" />
        ) : (
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className="mt-3 flex items-center gap-3 px-3 py-2 rounded-lg text-[15px] text-[#C8C6C1] hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <Icon name="evidence" />
            <span className="flex-1 text-left">More</span>
            <span className={`transition-transform ${moreOpen ? "" : "-rotate-90"}`}>
              <Chevron />
            </span>
          </button>
        )}
        {(collapsed || moreOpen) &&
          MORE_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} className={itemClass(isActive(item.href), !collapsed)}>
              {collapsed && <Icon name={item.icon} />}
              {!collapsed && item.label}
            </Link>
          ))}
      </nav>

      <div className="mt-3 pt-3 border-t border-white/[0.08] flex flex-col gap-0.5">
        <Link href="/connectors" title={collapsed ? "Connections" : undefined} className={itemClass(isActive("/connectors"))}>
          <Icon name="connectors" />
          {!collapsed && "Connections"}
        </Link>
        <Link href="/settings" title={collapsed ? "Settings" : undefined} className={itemClass(isActive("/settings"))}>
          <Icon name="settings" />
          {!collapsed && "Settings"}
        </Link>
        {orgName && (
          <Link
            href="/settings"
            className={`mt-2 flex items-center gap-3 rounded-lg hover:bg-white/[0.05] transition-colors ${collapsed ? "justify-center py-1.5" : "px-2 py-2"}`}
          >
            <span className="h-9 w-9 rounded-lg bg-white/[0.08] flex items-center justify-center text-sm text-white shrink-0">
              {orgName.charAt(0).toUpperCase()}
            </span>
            {!collapsed && (
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-white truncate">Admin</span>
                <span className="block text-xs text-[#A3A19C] truncate">{orgName}</span>
              </span>
            )}
            {!collapsed && <Chevron />}
          </Link>
        )}
      </div>
    </aside>
  );
}

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" className="shrink-0 text-[#A3A19C]">
      <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

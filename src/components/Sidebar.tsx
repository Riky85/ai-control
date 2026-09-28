"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/lib/auth-actions";
import Logo, { Wordmark } from "./Logo";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import WorkspaceSwitcher, { type WorkspaceOption } from "./WorkspaceSwitcher";

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
    case "account":
      return <svg {...common}><circle {...stroke} cx="9" cy="6.5" r="2.8" /><path {...stroke} d="M3.5 15.5c.6-2.8 2.8-4.5 5.5-4.5s4.9 1.7 5.5 4.5" /></svg>;
    case "people":
      return <svg {...common}><circle {...stroke} cx="7" cy="6" r="2.3" /><path {...stroke} d="M2.5 15c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" /><circle {...stroke} cx="13" cy="5.5" r="1.8" /><path {...stroke} d="M11.5 8.2c1.9.3 3 1.5 3 3.8" /></svg>;
    case "data":
      return <svg {...common}><ellipse {...stroke} cx="9" cy="4" rx="5.5" ry="1.8" /><path {...stroke} d="M3.5 4v10c0 1 2.5 1.8 5.5 1.8s5.5-.8 5.5-1.8V4" /><path {...stroke} d="M3.5 9c0 1 2.5 1.8 5.5 1.8s5.5-.8 5.5-1.8" /></svg>;
    case "savings":
      // Segno di percentuale: sconto / spesa che scende. Inequivocabile.
      return <svg {...common}><path {...stroke} d="M4 14L14 4" /><circle {...stroke} cx="5.2" cy="5.2" r="1.6" /><circle {...stroke} cx="12.8" cy="12.8" r="1.6" /></svg>;
    case "computer":
      return <svg {...common}><rect {...stroke} x="2" y="3" width="14" height="9" rx="1.5" /><path {...stroke} d="M6.5 15h5M9 12v3" /></svg>;
    case "download":
      return <svg {...common}><path {...stroke} d="M9 2.8v8.4M5.6 7.9L9 11.2l3.4-3.3" /><path {...stroke} d="M3 12.8v1.4c0 .8.6 1.3 1.3 1.3h9.4c.7 0 1.3-.5 1.3-1.3v-1.4" /></svg>;
    case "advisor":
      // Scintilla: suggerimenti intelligenti.
      return <svg {...common}><path {...stroke} d="M9 2.5l1.6 4.4 4.4 1.6-4.4 1.6L9 14.5l-1.6-4.4L3 8.5l4.4-1.6L9 2.5z" /><path {...stroke} d="M14.5 13v3M13 14.5h3" /></svg>;
    case "budget":
      // Salvadanaio stilizzato: cerchio con fessura e tacca.
      return <svg {...common}><circle {...stroke} cx="9" cy="9.5" r="5.5" /><path {...stroke} d="M7 7.2h4M9 9.5v3" /><path {...stroke} d="M9 2.2v1.8" /></svg>;
    case "partner":
      return <svg {...common}><rect {...stroke} x="2.5" y="3" width="5.5" height="5.5" rx="1" /><rect {...stroke} x="10" y="3" width="5.5" height="5.5" rx="1" /><rect {...stroke} x="6.2" y="10" width="5.5" height="5.5" rx="1" /></svg>;
    case "edge":
      // Scatolina di rete con led: il dispositivo angar Edge.
      return <svg {...common}><rect {...stroke} x="2" y="6" width="14" height="7.5" rx="1.8" /><path {...stroke} d="M5 9.8h2.5" /><circle cx="12.5" cy="9.8" r="1" fill="currentColor" /><path {...stroke} d="M6 6V4.2M12 6V4.2" /></svg>;
    case "review":
      // Occhio: "guarda / rivedi ciò che abbiamo trovato".
      return <svg {...common}><path {...stroke} d="M1.8 9S4.4 4.3 9 4.3 16.2 9 16.2 9 13.6 13.7 9 13.7 1.8 9 1.8 9z" /><circle {...stroke} cx="9" cy="9" r="2.1" /></svg>;
    case "report":
      return <svg {...common}><rect {...stroke} x="3" y="2.5" width="12" height="13" rx="1.5" /><path {...stroke} d="M6 12.5v-2.5M9 12.5V7.5M12 12.5v-4" /></svg>;
    case "billing":
      return <svg {...common}><rect {...stroke} x="2" y="4" width="14" height="10" rx="1.5" /><path {...stroke} d="M2 7.5h14" /><path {...stroke} d="M5 11h3" /></svg>;
    case "more":
      return <svg {...common}><circle cx="4.5" cy="9" r="1.2" fill="currentColor" /><circle cx="9" cy="9" r="1.2" fill="currentColor" /><circle cx="13.5" cy="9" r="1.2" fill="currentColor" /></svg>;
    case "usage":
      return <svg {...common}><circle {...stroke} cx="6.5" cy="6" r="2.3" /><path {...stroke} d="M2.5 15c0-2.3 1.8-4 4-4s4 1.7 4 4" /><path {...stroke} d="M12 15v-3M14.5 15V8.5" /></svg>;
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
// Il percorso principale: vedi → rivedi → approfondisci → costi → cosa cambia.
const PRIMARY_ITEMS = [
  { href: "/", label: "Overview", icon: "home" },
  { href: "/savings", label: "Savings", icon: "savings" },
  { href: "/usage", label: "Usage", icon: "usage" },
  { href: "/review", label: "Review", icon: "review" },
  { href: "/sources", label: "Sources", icon: "connectors" },
];

// Voci meno frequenti: nel menu a tendina del blocco utente, così la
// sidebar aperta non ha bisogno di scroll.
const MENU_ITEMS = [
  { href: "/account", label: "Account", icon: "account" },
  { href: "/workspace", label: "Workspace", icon: "people" },
  { href: "/report", label: "Monthly report", icon: "report" },
  { href: "/billing", label: "Plan & billing", icon: "billing" },
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/audit", label: "Audit log", icon: "activity" },
  { href: "/docs", label: "Documentation", icon: "evidence" },
];

// Poche voci: le pagine di dettaglio (AI Act, dati, attività, modifiche) stanno
// dentro Governance; angar Edge dentro Plan & billing.
const MORE_ITEMS = [
  { href: "/advisor", label: "AI Advisor", icon: "advisor" },
  { href: "/budgets", label: "Budgets", icon: "budget" },
  { href: "/providers", label: "Providers", icon: "providers" },
  { href: "/people", label: "People", icon: "people" },
  { href: "/download", label: "Desktop app", icon: "computer" },
  { href: "/governance", label: "Governance", icon: "assurance" },
];
// Pagine che accendono la voce Governance.
const GOVERNANCE_PATHS = ["/governance", "/compliance", "/data", "/activity"];

// Stato aperta/chiusa in un cookie: il server lo legge e rende subito la
// sidebar nello stato giusto, senza flash al refresh.

// Sidebar in stile Claude Console: nome del prodotto in serif, selettore
// organizzazione, ricerca con scorciatoia, voci principali, gruppo "More"
// richiudibile, utente in fondo. Aperta di default.
export interface SidebarWorkspaceProps {
  current: WorkspaceOption | null;
  workspaces: WorkspaceOption[];
  canCreate: boolean;
  planName: string;
  limit: number | null;
}

export default function Sidebar({ initialCollapsed = false, orgName, workspace, userName, userEmail, platformAdmin = false, reviewCount = 0, connectedComputers = 0, trial = null }: { initialCollapsed?: boolean; orgName?: string; workspace?: SidebarWorkspaceProps; userName?: string; userEmail?: string; platformAdmin?: boolean; reviewCount?: number; connectedComputers?: number; trial?: SidebarTrial | null }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [moreOpen, setMoreOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Sul telefono (o nell'app installata) la sidebar parte chiusa: resta spazio per i contenuti.
    if (window.matchMedia("(max-width: 767px)").matches) setCollapsed(true);
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  // Le dashboard condivise (/share/…) sono pubbliche: niente navigazione dell'app.
  if (pathname.startsWith("/share")) return null;

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/" || pathname.startsWith("/assets")
      : href === "/sources"
        ? ["/sources", "/connectors"].some((p) => pathname.startsWith(p))
        : href === "/governance"
          ? GOVERNANCE_PATHS.some((p) => pathname.startsWith(p))
          : href === "/download"
            ? ["/download", "/computers", "/discover"].some((p) => pathname.startsWith(p))
            : href === "/billing"
              ? ["/billing", "/edge"].some((p) => pathname.startsWith(p))
              : pathname.startsWith(href);
  function itemClass(active: boolean, sub = false) {
    return `flex items-center gap-3 text-[15px] transition-colors rounded-lg ${
      collapsed ? "justify-center h-10 w-10 mx-auto shrink-0" : sub ? "pl-11 pr-3 py-1.5" : "px-3 py-2"
    } ${active ? "text-white bg-white/[0.09] font-medium" : "text-[#C8C6C1] hover:text-white hover:bg-white/[0.05]"}`;
  }

  return (
    <aside
      className={`shrink-0 bg-sidebar border-r border-white/[0.08] h-full py-3 flex flex-col transition-[width] duration-150 ${
        collapsed ? "w-[60px] px-2.5" : "w-64 px-3"
      }`}
    >
      {collapsed ? (
        <button onClick={toggle} aria-label="Expand sidebar" className="group relative h-10 w-10 mx-auto mb-4 flex items-center justify-center rounded-lg hover:bg-white/[0.08] transition-colors">
          <span className="text-white transition-opacity group-hover:opacity-0">
            <Logo size={20} />
          </span>
          <span className="absolute inset-0 flex items-center justify-center text-[#A3A19C] opacity-0 group-hover:opacity-100 group-hover:text-white transition-opacity">
            <PanelToggleIcon />
          </span>
        </button>
      ) : (
        <div className="flex items-center h-10 mb-4 px-2">
          <Link href="/" className="text-white" aria-label="angar home">
            <Wordmark size={20} />
          </Link>
          <button
            onClick={toggle}
            aria-label="Collapse sidebar"
            className="ml-auto h-8 w-8 flex items-center justify-center rounded-lg text-[#A3A19C] hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <PanelToggleIcon />
          </button>
        </div>
      )}

      {!collapsed && (
        <>
          {workspace && <WorkspaceSwitcher {...workspace} />}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("angar:search-open"))}
            className="mb-4 w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.12] text-[#A3A19C] hover:border-white/30 transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none" className="shrink-0">
              <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M9.2 9.2L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="flex-1 min-w-0 text-left text-sm text-[#8A8884]">Search…</span>
            <kbd className="text-[10px] text-[#A3A19C] border border-white/[0.15] rounded px-1 shrink-0">Ctrl K</kbd>
          </button>
        </>
      )}

      <nav className={`flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 ${collapsed ? "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : ""}`}>
        {PRIMARY_ITEMS.filter((item) => item.href !== "/review" || reviewCount > 0 || isActive("/review")).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={itemClass(isActive(item.href))}
          >
            <span className="relative shrink-0">
              <Icon name={item.icon} />
              {/* Da chiusa: il numero da rivedere diventa un badge sull'icona. */}
              {collapsed && item.href === "/review" && reviewCount > 0 && (
                <span className="absolute -top-2 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[9px] font-semibold leading-4 text-center tabular ring-2 ring-sidebar">
                  {reviewCount > 99 ? "99+" : reviewCount}
                </span>
              )}
            </span>
            {!collapsed && <span className="flex-1">{item.label}</span>}
            {!collapsed && item.href === "/review" && reviewCount > 0 && (
              <span className="text-[11px] font-semibold text-white bg-accent rounded-full px-1.5 min-w-[20px] text-center tabular">{reviewCount}</span>
            )}
          </Link>
        ))}

        {collapsed ? (
          <div className="my-2 border-t border-white/[0.08]" />
        ) : (
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className="mt-3 flex items-center gap-3 px-3 py-2 rounded-lg text-[15px] text-[#C8C6C1] hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <Icon name="more" />
            <span className="flex-1 text-left">More</span>
            <span className={`transition-transform ${moreOpen ? "" : "-rotate-90"}`}>
              <Chevron />
            </span>
          </button>
        )}
        {(collapsed || moreOpen) &&
          MORE_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} className={itemClass(isActive(item.href), !collapsed)}>
              {collapsed && (
                <span className="relative shrink-0">
                  <Icon name={item.icon} />
                  {item.href === "/download" && connectedComputers > 0 && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-steady ring-2 ring-sidebar" />}
                </span>
              )}
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {!collapsed && item.href === "/download" && connectedComputers > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-steady tabular">
                  <span className="h-1.5 w-1.5 rounded-full bg-steady" />
                  {connectedComputers}
                </span>
              )}
            </Link>
          ))}
      </nav>

      {trial && <TrialCard trial={trial} collapsed={collapsed} />}
      <div className="mt-3 pt-3 border-t border-white/[0.08] flex flex-col gap-0.5">
        <div ref={menuRef} className="relative">
          {menuOpen && (
            <div className={`absolute bottom-full mb-2 z-30 w-56 rounded-xl border border-white/[0.12] bg-[#25282B] p-1.5 shadow-xl ${collapsed ? "left-0" : "left-0 right-0 w-auto"}`}>
              {userEmail && <div className="px-3 pt-1.5 pb-2 text-xs text-[#A3A19C] truncate border-b border-white/[0.08] mb-1">{userEmail}</div>}
              {[
                ...((workspace?.workspaces.length ?? 0) > 1 ? [{ href: "/partner", label: "Partner console", icon: "partner" }, { href: "/group", label: "Group view", icon: "budget" }] : []),
                ...MENU_ITEMS,
                ...(platformAdmin ? [{ href: "/system", label: "System", icon: "assurance" }] : []),
              ].map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive(item.href) ? "text-white bg-white/[0.09]" : "text-[#C8C6C1] hover:text-white hover:bg-white/[0.06]"}`}>
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              ))}
              <div className="my-1 border-t border-white/[0.08]" />
              <form action={signOutAction}>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#C8C6C1] hover:text-white hover:bg-white/[0.06] transition-colors">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0"><path d="M6 3H3.5v10H6M10.5 5.5 13 8l-2.5 2.5M13 8H6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Sign out
                </button>
              </form>
            </div>
          )}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            className={`w-full flex items-center gap-3 rounded-lg hover:bg-white/[0.05] transition-colors ${menuOpen ? "bg-white/[0.05]" : ""} ${collapsed ? "justify-center py-1" : "px-2 py-2"}`}
          >
            <span className="h-9 w-9 rounded-lg bg-white/[0.08] flex items-center justify-center text-sm text-white shrink-0">
              {(userName ?? orgName ?? "A").charAt(0).toUpperCase()}
            </span>
            {!collapsed && (
              <span className="flex-1 min-w-0 text-left">
                <span className="block text-sm font-medium text-white truncate">{userName ?? "Account"}</span>
                <span className="block text-xs text-[#A3A19C] truncate">{orgName}</span>
              </span>
            )}
            {!collapsed && <span className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}><Chevron /></span>}
          </button>
        </div>
      </div>
    </aside>
  );
}

export interface SidebarTrial {
  trialing: boolean;
  daysLeft: number;
  totalDays: number;
  endsAt: string | null;
}

/** Prova Growth: giorni rimasti con barra; aperta = scheda, chiusa = anello con i giorni. */
function TrialCard({ trial, collapsed }: { trial: SidebarTrial; collapsed: boolean }) {
  const urgent = !trial.trialing || trial.daysLeft <= 3;
  const pct = trial.trialing ? Math.max(4, Math.min(100, (trial.daysLeft / trial.totalDays) * 100)) : 0;
  const color = urgent ? "#D9A928" : "#FF7323";
  if (collapsed) {
    const r = 13;
    const c = 2 * Math.PI * r;
    return (
      <Link href="/billing" title={trial.trialing ? `Growth trial · ${trial.daysLeft} days left` : "Trial ended — choose a plan"} className="mx-auto mt-2 h-10 w-10 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-colors relative">
        <svg width="32" height="32" viewBox="0 0 32 32" className="-rotate-90">
          <circle cx="16" cy="16" r={r} fill="none" strokeWidth="2.5" stroke="rgba(255,255,255,0.1)" />
          <circle cx="16" cy="16" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round" stroke={color} strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white tabular">{trial.trialing ? trial.daysLeft : "!"}</span>
      </Link>
    );
  }
  return (
    <Link href="/billing" className="group mt-2 block rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] px-3 py-2.5 transition-colors">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-white">{trial.trialing ? "Growth trial" : "Trial ended"}</span>
        <span className="tabular" style={{ color: urgent ? color : "#A3A19C" }}>
          {trial.trialing ? `${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left` : "Free limits"}
        </span>
      </div>
      {trial.trialing && (
        <div className="mt-2 h-1 rounded-full bg-white/[0.08] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
      )}
      <div className="mt-2 text-xs text-[#A3A19C] group-hover:text-white transition-colors">Choose a plan →</div>
    </Link>
  );
}

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" className="shrink-0 text-[#A3A19C]">
      <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/lib/auth-actions";
import Logo, { Wordmark } from "./Logo";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { TRIAL_PLAN, planLabel } from "@/lib/plans";
import WorkspaceSwitcher, { type WorkspaceOption } from "./WorkspaceSwitcher";
import { AREAS, locate } from "@/lib/areas";

// Set di icone unico (forme in stile Lucide, licenza ISC): griglia 24, un solo
// spessore di linea, angoli arrotondati. Il colore arriva da currentColor.
function Icon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "home":
      return <svg {...common}><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
    case "score":
      return <svg {...common}><path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></svg>;
    case "assets":
      return <svg {...common}><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" /><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" /><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" /></svg>;
    case "report":
      return <svg {...common}><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></svg>;
    case "savings":
      return <svg {...common}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></svg>;
    case "connectors":
      return <svg {...common}><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" /></svg>;
    case "assurance":
      return <svg {...common}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>;
    case "settings":
      return <svg {...common}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>;
    case "people":
      return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "account":
      return <svg {...common}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
    case "billing":
      return <svg {...common}><rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" /></svg>;
    case "evidence":
      return <svg {...common}><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></svg>;
    case "rocket":
      // Checklist della guida di avvio.
      return <svg {...common}><path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" /></svg>;
    case "partner":
      return <svg {...common}><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /><rect width="20" height="14" x="2" y="6" rx="2" /></svg>;
    case "computer":
      return <svg {...common}><rect width="20" height="14" x="2" y="3" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>;
    case "download":
      return <svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></svg>;
    case "edge":
      return <svg {...common}><rect width="20" height="8" x="2" y="14" rx="2" /><path d="M6.01 18H6" /><path d="M10.01 18H10" /><path d="M15 10v4" /><path d="M17.84 7.17a4 4 0 0 0-5.66 0" /><path d="M20.66 4.34a8 8 0 0 0-11.31 0" /></svg>;
    case "review":
      return <svg {...common}><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></svg>;
    case "data":
      return <svg {...common}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" /></svg>;
    case "usage":
      return <svg {...common}><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>;
    case "activity":
      return <svg {...common}><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" /></svg>;
    case "approvals":
      return <svg {...common}><rect width="8" height="4" x="8" y="2" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></svg>;
    case "policies":
      return <svg {...common}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></svg>;
    case "providers":
      return <svg {...common}><rect width="6" height="6" x="16" y="16" rx="1" /><rect width="6" height="6" x="2" y="16" rx="1" /><rect width="6" height="6" x="9" y="2" rx="1" /><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" /><path d="M12 12V8" /></svg>;
    case "changes":
      return <svg {...common}><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></svg>;
    case "advisor":
      return <svg {...common}><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /></svg>;
    case "budget":
      return <svg {...common}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>;
    case "more":
      return <svg {...common}><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>;
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

// Aree da AREAS (le schede di ogni area stanno in alto nella pagina, vedi AreaTabs).
// Le impostazioni (Settings, Workspace, Plan & billing, Account) nel menu utente.
const MENU_ITEMS = [
  { href: "/settings", label: "Settings", icon: "settings" },
  // Invitare il team (ultimo passo della guida di avvio) senza passare da Settings.
  { href: "/workspace", label: "Workspace", icon: "people" },
  { href: "/billing", label: "Plan & billing", icon: "billing" },
  { href: "/docs", label: "Documentation", icon: "evidence" },
];

// Stato aperta/chiusa in un cookie: il server lo legge e rende subito la
// sidebar nello stato giusto, senza flash al refresh.

// Sidebar in stile Claude Console: nome del prodotto in serif, selettore
// organizzazione, ricerca con scorciatoia, voci principali, gruppo "More"
// richiudibile, utente in fondo. Chiusa di default.
export interface SidebarWorkspaceProps {
  current: WorkspaceOption | null;
  workspaces: WorkspaceOption[];
  canCreate: boolean;
  planName: string;
  limit: number | null;
}

/** Lista di controllo dei primi passi (costi → uso → team), si spunta dai dati. */
export interface SidebarSetupStep {
  key: string;
  title: string;
  href: string;
  done: boolean;
}
export interface SidebarSetup {
  steps: SidebarSetupStep[];
}

export default function Sidebar({ initialCollapsed = false, orgName, workspace, userName, userEmail, platformAdmin = false, reviewCount = 0, connectedComputers = 0, trial = null, onprem = false, setup = null }: { initialCollapsed?: boolean; orgName?: string; workspace?: SidebarWorkspaceProps; userName?: string; userEmail?: string; platformAdmin?: boolean; reviewCount?: number; connectedComputers?: number; trial?: SidebarTrial | null; onprem?: boolean; setup?: SidebarSetup | null }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const setupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Sul telefono (o nell'app installata) la sidebar parte chiusa: resta spazio per i contenuti.
    if (window.matchMedia("(max-width: 767px)").matches) setCollapsed(true);
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (setupRef.current && !setupRef.current.contains(e.target as Node)) setSetupOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSetupOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Durante l'animazione niente scroll nel menu: il testo che entra non deve far comparire la barra.
  const [animating, setAnimating] = useState(false);
  const animTimer = useRef<ReturnType<typeof setTimeout>>();
  function toggle() {
    setAnimating(true);
    clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => setAnimating(false), 320);
    setCollapsed((prev) => {
      const next = !prev;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  // Le dashboard condivise (/share/…) sono pubbliche: niente navigazione dell'app.
  if (pathname.startsWith("/share")) return null;

  const current = locate(pathname);
  const isActive = (href: string) => (current ? current.area.href === href || current.tab.href === href : pathname === href);
  function itemClass(active: boolean, sub = false) {
    return `flex items-center gap-3 text-[15px] transition-colors rounded-lg ${
      collapsed ? "justify-center h-10 w-10 mx-auto shrink-0" : sub ? "pl-11 pr-3 py-1.5" : "px-3 py-2"
    } ${active ? "text-sb-ink bg-sb-ink/[0.09] font-medium" : "text-sb-text hover:text-sb-ink hover:bg-sb-ink/[0.05]"}`;
  }

  return (
    <aside
      className={`shrink-0 bg-sidebar border-r h-full pt-2 pb-3 flex flex-col transition-[width,padding,border-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
        collapsed ? "w-[56px] px-1.5 border-sidebar-line" : "w-64 px-3 border-line"
      }`}
    >
      {collapsed ? (
        <button onClick={toggle} aria-label="Expand sidebar" className="group relative h-10 w-10 mx-auto mb-4 flex items-center justify-center rounded-lg hover:bg-sb-ink/[0.08] transition-colors">
          <span className="text-sb-ink transition-opacity group-hover:opacity-0">
            <Logo size={17} />
          </span>
          <span className="absolute inset-0 flex items-center justify-center text-sb-muted opacity-0 group-hover:opacity-100 group-hover:text-sb-ink transition-opacity">
            <PanelToggleIcon />
          </span>
        </button>
      ) : (
        <div className="flex items-center h-10 mb-4 px-2 sb-fade">
          <Link href="/" className="text-sb-ink" aria-label="angar home">
            <Wordmark size={17} />
          </Link>
          <button
            onClick={toggle}
            aria-label="Collapse sidebar"
            className="ml-auto h-8 w-8 flex items-center justify-center rounded-lg text-sb-muted hover:text-sb-ink hover:bg-sb-ink/[0.08] transition-colors"
          >
            <PanelToggleIcon />
          </button>
        </div>
      )}

      {!collapsed && (
        // relative z-20: la tendina del workspace resta sopra le voci del menu (che animate creano livelli propri).
        <div className="sb-fade relative z-20">
          {workspace && <WorkspaceSwitcher {...workspace} />}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("angar:search-open"))}
            className="mb-4 w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-sb-ink/[0.12] text-sb-muted hover:border-sb-ink/30 transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none" className="shrink-0">
              <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M9.2 9.2L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="flex-1 min-w-0 text-left text-sm text-sb-faint">Search…</span>
            <kbd className="text-[10px] text-sb-muted border border-sb-ink/[0.15] rounded px-1 shrink-0">Ctrl K</kbd>
          </button>
        </div>
      )}

      <nav className={`flex flex-col gap-0.5 overflow-x-hidden flex-1 min-h-0 whitespace-nowrap ${animating ? "overflow-y-hidden" : "overflow-y-auto"} ${collapsed ? "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "[scrollbar-width:thin]"}`}>
        {AREAS.map((item) => {
          // AI da rivedere: il numero sta su AI Estate (To review è una sua scheda).
          const badge = item.key === "estate" && reviewCount > 0 ? reviewCount : 0;
          const online = item.key === "connect" && connectedComputers > 0;
          return (
            <div key={item.href} className="flex flex-col gap-0.5">
            {/* Voci secondarie (Governance): dopo una riga sottile, testo più tenue. */}
            {item.secondary && <div aria-hidden className="my-2 mx-2 border-t border-sb-ink/[0.08]" />}
            <Link href={item.href} title={collapsed ? item.label : undefined} className={`${itemClass(isActive(item.href))} ${item.secondary && !isActive(item.href) ? "opacity-70" : ""}`}>
              <span className="relative shrink-0">
                <Icon name={item.icon} />
                {collapsed && badge > 0 && (
                  <span className="absolute -top-2 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[9px] font-semibold leading-4 text-center tabular ring-2 ring-sidebar">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
                {collapsed && online && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-steady ring-2 ring-sidebar" />}
              </span>
              {!collapsed && <span className="flex-1 sb-fade">{item.label}</span>}
              {!collapsed && badge > 0 && (
                <span title="AI to review" className="font-mono text-[10px] text-accent border border-accent/45 bg-accent/10 rounded-[2px] px-1.5 min-w-[20px] text-center tabular">{badge}</span>
              )}
              {!collapsed && online && (
                <span title="Computers online" className="flex items-center gap-1 text-[11px] text-steady tabular">
                  <span className="h-1.5 w-1.5 rounded-full bg-steady" />
                  {connectedComputers}
                </span>
              )}
            </Link>
            </div>
          );
        })}
      </nav>

      {/* Primi passi (prima erano un riquadro nella home): lista di controllo in un piccolo popover. */}
      {setup && <SetupChecklist setup={setup} collapsed={collapsed} open={setupOpen} setOpen={setSetupOpen} boxRef={setupRef} itemClass={itemClass(setupOpen)} />}
      {trial && <TrialCard trial={trial} collapsed={collapsed} />}
      <div className="mt-3 pt-3 border-t border-sb-ink/[0.08] flex flex-col gap-0.5">
        <div ref={menuRef} className="relative">
          {menuOpen && (
            <div className={`absolute bottom-full mb-2 z-30 w-56 rounded-xl border border-sb-ink/[0.12] bg-pop p-1.5 shadow-xl ${collapsed ? "left-0" : "left-0 right-0 w-auto"}`}>
              {userEmail && <div className="px-2.5 pt-1.5 pb-2 text-xs text-sb-muted truncate border-b border-sb-ink/[0.08] mb-1">{userEmail}</div>}
              {[
                ...((workspace?.workspaces.length ?? 0) > 1 ? [{ href: "/partner", label: "Partner console", icon: "partner" }, { href: "/group", label: "Group view", icon: "budget" }] : []),
                ...MENU_ITEMS.filter((m) => !(onprem && m.href === "/billing")),
                ...(platformAdmin ? [{ href: "/system", label: "System", icon: "assurance" }] : []),
              ].map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className={`sb-menu-item ${isActive(item.href) ? "!text-sb-ink !bg-sb-ink/[0.09]" : ""}`}>
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              ))}
              <div className="my-1 border-t border-sb-ink/[0.08]" />
              <form action={signOutAction}>
                <button className="sb-menu-item">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0"><path d="M6 3H3.5v10H6M10.5 5.5 13 8l-2.5 2.5M13 8H6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Sign out
                </button>
              </form>
            </div>
          )}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            className={`w-full flex items-center gap-3 rounded-lg hover:bg-sb-ink/[0.05] transition-colors ${menuOpen ? "bg-sb-ink/[0.05]" : ""} ${collapsed ? "justify-center py-1" : "px-2 py-2"}`}
          >
            <span className="h-9 w-9 rounded-lg bg-sb-ink/[0.08] flex items-center justify-center text-sm text-sb-ink shrink-0">
              {(userName ?? orgName ?? "A").charAt(0).toUpperCase()}
            </span>
            {!collapsed && (
              <span className="flex-1 min-w-0 text-left sb-fade">
                <span className="block text-sm font-medium text-sb-ink truncate">{userName ?? "Account"}</span>
                <span className="block text-xs text-sb-muted truncate">{orgName}</span>
              </span>
            )}
            {!collapsed && <span className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}><Chevron /></span>}
          </button>
        </div>
      </div>
    </aside>
  );
}

/**
 * Voce "Setup" della sidebar: icona razzo e numero dei passi mancanti in un
 * cerchio pieno neutro. Al clic si apre la lista di controllo accanto alla
 * voce, fuori dalla sidebar (aperta o chiusa). Ogni passo ha il suo
 * cerchio (fatto / da fare); quelli da fare portano alla loro pagina.
 */
function SetupChecklist({
  setup,
  collapsed,
  open,
  setOpen,
  boxRef,
  itemClass,
}: {
  setup: SidebarSetup;
  collapsed: boolean;
  open: boolean;
  setOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  boxRef: React.RefObject<HTMLDivElement>;
  itemClass: string;
}) {
  const total = setup.steps.length;
  const done = setup.steps.filter((s) => s.done).length;
  const left = total - done;
  if (left === 0) return null;
  const count = (
    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-sb-ink text-sidebar text-[10px] font-semibold leading-[18px] text-center tabular">{left}</span>
  );
  return (
    <div ref={boxRef} className="relative mt-2">
      {open && (
        <div
          role="dialog"
          aria-label="Setup checklist"
          className={`absolute z-50 left-full bottom-0 w-72 rounded-xl border border-sb-ink/[0.12] bg-pop p-1.5 shadow-xl animate-fade ${collapsed ? "ml-3" : "ml-5"}`}
        >
          <div className="px-3 pt-2 pb-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-bold text-sb-ink">Get started</span>
              <span className="text-xs text-sb-muted tabular">
                {done} of {total} done
              </span>
            </div>
            <div className="mt-2.5 flex gap-1" aria-hidden>
              {setup.steps.map((s) => (
                <span key={s.key} className={`h-1 flex-1 rounded-full ${s.done ? "bg-accent" : "bg-sb-ink/[0.1]"}`} />
              ))}
            </div>
          </div>
          <ol className="flex flex-col">
            {setup.steps.map((s) => {
              const mark = (
                <span className={`h-[18px] w-[18px] shrink-0 rounded-full flex items-center justify-center ${s.done ? "bg-accent text-white" : "border border-sb-ink/25"}`} aria-hidden>
                  {s.done && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2.2 5.2l1.9 1.9 3.7-4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              );
              return (
                <li key={s.key}>
                  {s.done ? (
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sb-muted">
                      {mark}
                      <span className="flex-1 min-w-0 truncate line-through decoration-sb-ink/25">{s.title}</span>
                      <span className="sr-only">Done</span>
                    </div>
                  ) : (
                    <Link href={s.href} onClick={() => setOpen(false)} className="group flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sb-ink hover:bg-sb-ink/[0.05] transition-colors">
                      {mark}
                      <span className="flex-1 min-w-0 truncate">{s.title}</span>
                      <span aria-hidden className="text-sb-muted group-hover:text-sb-ink transition-colors">→</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
          {/* Piede: la guida di primo avvio resta raggiungibile finché i passi non sono finiti. */}
          <div className="mt-1 border-t border-sb-ink/[0.08] px-3 pt-2.5 pb-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="text-sb-muted">Not sure where to start?</span>
            <Link href="/onboarding" onClick={() => setOpen(false)} className="font-medium text-sb-ink hover:underline">
              Get started
            </Link>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={collapsed ? `Setup: ${left} step${left === 1 ? "" : "s"} left` : undefined}
        title={collapsed ? `Setup · ${left} left` : undefined}
        className={`${itemClass} ${collapsed ? "" : "w-full"}`}
      >
        <span className="relative shrink-0">
          <Icon name="rocket" />
          {collapsed && (
            <span className="absolute -top-2 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-sb-ink text-sidebar text-[9px] font-semibold leading-4 text-center tabular ring-2 ring-sidebar">{left}</span>
          )}
        </span>
        {!collapsed && <span className="flex-1 text-left sb-fade">Setup</span>}
        {!collapsed && <span className="sb-fade flex">{count}</span>}
      </button>
    </div>
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
  // Arancio solo quando la prova sta per finire (segnale), altrimenti neutro.
  const stroke = urgent ? "stroke-accent" : "stroke-sb-ink/40";
  const fill = urgent ? "bg-accent" : "bg-sb-ink/40";
  if (collapsed) {
    const r = 13;
    const c = 2 * Math.PI * r;
    return (
      <Link href="/billing" title={trial.trialing ? `${planLabel(TRIAL_PLAN)} trial · ${trial.daysLeft} days left` : "Trial ended — choose a plan"} className="mx-auto mt-2 h-10 w-10 rounded-lg flex items-center justify-center hover:bg-sb-ink/[0.06] transition-colors relative">
        <svg width="32" height="32" viewBox="0 0 32 32" className="-rotate-90">
          <circle cx="16" cy="16" r={r} fill="none" strokeWidth="2.5" className="stroke-sb-ink/10" />
          <circle cx="16" cy="16" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round" className={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-sb-ink tabular">{trial.trialing ? trial.daysLeft : "!"}</span>
      </Link>
    );
  }
  return (
    <Link href="/billing" className="group mt-2 block rounded-xl border border-sb-ink/[0.08] bg-sb-ink/[0.03] hover:bg-sb-ink/[0.06] px-3 py-2.5 transition-colors">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-sb-ink">{trial.trialing ? `${planLabel(TRIAL_PLAN)} trial` : "Trial ended"}</span>
        <span className={`tabular ${urgent ? "text-signal" : "text-sb-muted"}`}>
          {trial.trialing ? `${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left` : "Free limits"}
        </span>
      </div>
      {trial.trialing && (
        <div className="mt-2 h-1 rounded-full bg-sb-ink/[0.08] overflow-hidden">
          <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="mt-2 text-xs text-sb-muted group-hover:text-sb-ink transition-colors">Choose a plan →</div>
    </Link>
  );
}

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" className="shrink-0 text-sb-muted">
      <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

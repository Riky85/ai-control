/**
 * Le 7 voci della piattaforma (+ impostazioni): una voce, una pagina — niente
 * sotto-schede (le pagine di dettaglio si raggiungono dai link nella pagina). Unica fonte per sidebar e schede.
 */
export interface AreaTab {
  href: string;
  label: string;
  /** Percorsi che accendono questa scheda (prefissi). */
  match: string[];
}
export interface Area {
  key: string;
  label: string;
  href: string;
  icon: string;
  tabs: AreaTab[];
  /** Percorsi dell'area senza una scheda propria (dettagli). */
  extra?: string[];
  /** Sotto-pagine dell'area (mostrate dentro la pagina, non nella sidebar). */
  /** Voce secondaria: in fondo alla sidebar, meno in vista (es. Governance). */
  secondary?: boolean;
  children?: AreaTab[];
}

export const AREAS: Area[] = [
  { key: "overview", label: "Overview", href: "/", icon: "home", tabs: [{ href: "/", label: "Overview", match: ["/assets", "/report", "/alerts", "/group", "/market"] }] },
  { key: "score", label: "Score", href: "/score", icon: "score", tabs: [{ href: "/score", label: "Score", match: ["/score"] }] },
  { key: "review", label: "To review", href: "/review", icon: "review", tabs: [{ href: "/review", label: "To review", match: ["/review"] }] },
  { key: "savings", label: "Savings", href: "/savings", icon: "savings", tabs: [{ href: "/savings", label: "Savings", match: ["/savings", "/providers", "/advisor", "/simulate", "/negotiate", "/catalog"] }] },
  { key: "usage", label: "Usage", href: "/usage", icon: "usage", tabs: [{ href: "/usage", label: "Usage", match: ["/usage", "/people"] }] },
  { key: "budgets", label: "Budgets", href: "/budgets", icon: "budget", tabs: [{ href: "/budgets", label: "Budgets", match: ["/budgets"] }] },
  {
    key: "connect",
    label: "Connect",
    href: "/connect",
    icon: "connectors",
    tabs: [{ href: "/connect", label: "Connect", match: ["/connect", "/sources", "/connectors", "/download", "/computers", "/discover", "/edge", "/gateway"] }],
    children: [
      { href: "/sources", label: "Sources", match: ["/sources", "/discover"] },
      { href: "/connectors", label: "AI provider keys", match: ["/connectors"] },
      { href: "/download", label: "Desktop app", match: ["/download", "/computers"] },
      { href: "/edge/sensors", label: "angar Edge", match: ["/edge"] },
      { href: "/gateway", label: "Gateway", match: ["/gateway"] },
    ],
  },
  { key: "governance", label: "Governance", href: "/governance", icon: "assurance", secondary: true, tabs: [{ href: "/governance", label: "Governance", match: ["/governance", "/compliance", "/data", "/activity", "/changes", "/audit", "/policies", "/approvals", "/assurance", "/evidence"] }] },
];

/** Impostazioni: nel menu utente, stesse schede in alto. */
export const SETTINGS_AREA: Area = {
  key: "settings",
  label: "Settings",
  href: "/settings",
  icon: "settings",
  tabs: [
    { href: "/settings", label: "Settings", match: ["/settings"] },
    { href: "/workspace", label: "Workspace", match: ["/workspace"] },
    { href: "/billing", label: "Plan & billing", match: ["/billing"] },
    { href: "/account", label: "Account", match: ["/account"] },
  ],
};

const matches = (path: string, prefix: string) => (prefix === "/" ? path === "/" : path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix + "?"));

/** Scheda attiva per un percorso: il prefisso più lungo vince. */
export function locate(path: string): { area: Area; tab: AreaTab } | null {
  let best: { area: Area; tab: AreaTab; len: number } | null = null;
  for (const area of [...AREAS, SETTINGS_AREA]) {
    for (const tab of area.tabs) {
      for (const p of [tab.href, ...tab.match]) {
        if (matches(path, p) && (!best || p.length > best.len)) best = { area, tab, len: p.length };
      }
    }
  }
  return best ? { area: best.area, tab: best.tab } : null;
}

/** Voce figlia attiva (prefisso più lungo). */
export function activeChild(area: Area, path: string): AreaTab | null {
  let best: { tab: AreaTab; len: number } | null = null;
  for (const tab of area.children ?? []) {
    for (const p of [tab.href, ...tab.match]) {
      if (matches(path, p) && (!best || p.length > best.len)) best = { tab, len: p.length };
    }
  }
  return best?.tab ?? null;
}

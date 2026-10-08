/**
 * Le voci della piattaforma (spec §14, adattata a ciò che esiste): Overview, Score, AI Estate,
 * Spend, Opportunities, Connect, poi Governance (secondaria). Le aree con più pagine mostrano le
 * schede sotto la barra del titolo (AreaTabs); le vecchie pagine restano dov'erano, come schede.
 * Unica fonte per sidebar e schede.
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
  { key: "overview", label: "Overview", href: "/", icon: "home", tabs: [{ href: "/", label: "Overview", match: ["/alerts", "/group"] }] },
  // La metrica chiave del proprietario: resta una voce a sé.
  { key: "score", label: "Score", href: "/score", icon: "score", tabs: [{ href: "/score", label: "Score", match: ["/score"] }] },
  // AI Estate: l'elenco delle AI (prima nell'Overview) e ciò che descrive l'estate. Il numero "da rivedere" sta su questa voce.
  {
    key: "estate",
    label: "AI Estate",
    href: "/estate",
    icon: "assets",
    tabs: [
      { href: "/estate", label: "List", match: ["/assets"] },
      { href: "/estate/graph", label: "Graph", match: [] },
      { href: "/providers", label: "Providers", match: [] },
      { href: "/review", label: "To review", match: ["/approvals"] },
      { href: "/estate/requests", label: "Requests", match: [] },
      { href: "/estate/access", label: "App access", match: [] },
    ],
  },
  // Spend: quanto costa e perché (spec §16). Budget, uso, abbonamenti, rinnovi, listino e cambi di prezzo come schede.
  {
    key: "spend",
    label: "Spend",
    href: "/spend",
    icon: "report",
    tabs: [
      // "Summary" e non "Overview", per non confondersi con l'Overview principale.
      { href: "/spend", label: "Summary", match: ["/report"] },
      { href: "/budgets", label: "Budgets", match: [] },
      { href: "/usage", label: "Usage", match: ["/people"] },
      { href: "/spend/subscriptions", label: "Subscriptions", match: [] },
      { href: "/spend/renewals", label: "Renewals", match: [] },
      { href: "/catalog", label: "Price list", match: [] },
      // Cambi di prezzo e ritiri del mercato (prima scheda di AI Estate): l'URL resta /market.
      { href: "/market", label: "Price changes", match: [] },
    ],
  },
  // Opportunities: il motore decisionale (prima Savings; Advisor e "Improve my score" sono sue viste) e l'Impact simulator.
  {
    key: "opportunities",
    label: "Opportunities",
    href: "/opportunities",
    icon: "savings",
    tabs: [
      { href: "/opportunities", label: "Opportunities", match: ["/savings", "/advisor", "/negotiate", "/contracts"] },
      { href: "/impact", label: "Impact simulator", match: ["/simulate"] },
    ],
  },
  {
    key: "connect",
    label: "Connect",
    href: "/connect",
    icon: "connectors",
    tabs: [{ href: "/connect", label: "Connect", match: ["/connect", "/sources", "/connectors", "/download", "/computers", "/discover", "/edge", "/gateway"] }],
    children: [
      { href: "/sources", label: "Sources", match: ["/sources"] },
      { href: "/connectors", label: "AI provider keys", match: ["/connectors"] },
      { href: "/download", label: "Desktop app", match: ["/download", "/computers"] },
      { href: "/edge/sensors", label: "angar Edge", match: ["/edge"] },
      { href: "/gateway", label: "Gateway", match: ["/gateway"] },
      { href: "/connect/other", label: "Other ways", match: ["/connect/other", "/discover"] },
    ],
  },
  // Governance: schede vere, così ogni sotto-pagina mostra la barra.
  {
    key: "governance",
    label: "Governance",
    href: "/governance",
    icon: "assurance",
    secondary: true,
    tabs: [
      { href: "/governance", label: "Overview", match: ["/policies", "/assurance"] },
      { href: "/governance/register", label: "Register", match: [] },
      { href: "/compliance", label: "Compliance", match: [] },
      { href: "/data", label: "Data", match: [] },
      { href: "/activity", label: "Activity", match: ["/changes", "/audit", "/evidence"] },
    ],
  },
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

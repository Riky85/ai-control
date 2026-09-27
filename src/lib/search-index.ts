// Ricerca intelligente: pagine navigabili + scorer fuzzy condiviso tra API e UI.

export interface NavPage {
  href: string;
  label: string;
  keywords: string; // sinonimi, così "spend"/"costi" trovano il report ecc.
}

export const NAV_PAGES: NavPage[] = [
  { href: "/", label: "Overview", keywords: "home dashboard start" },
  { href: "/savings", label: "Savings", keywords: "save money risparmi cut costs waste unused seats" },
  { href: "/usage", label: "Usage", keywords: "who uses people activity seats active per person" },
  { href: "/review", label: "Review", keywords: "approve pending new found shadow ai decide" },
  { href: "/sources", label: "Sources", keywords: "connect bank invoices microsoft google integrations" },
  { href: "/discover", label: "Find AI automatically", keywords: "desktop app extension scan install computers agent download" },
  { href: "/providers", label: "Providers", keywords: "vendors openai anthropic google by vendor" },
  { href: "/report", label: "Monthly report", keywords: "spend cost email pdf month trend" },
  { href: "/billing", label: "Plan & billing", keywords: "subscription upgrade plan invoice payment stripe" },
  { href: "/workspace", label: "Workspace", keywords: "team members people invite colleagues" },
  { href: "/changes", label: "Changes", keywords: "history what changed new removed timeline" },
  { href: "/data", label: "Data exposure", keywords: "privacy access data risk gdpr" },
  { href: "/governance", label: "Governance", keywords: "ai act compliance policy register evidence" },
  { href: "/audit", label: "Audit log", keywords: "activity log events who did what" },
  { href: "/settings", label: "Settings", keywords: "preferences theme account configuration" },
  { href: "/docs", label: "Documentation", keywords: "help guide how to docs" },
  { href: "/pricing", label: "Pricing", keywords: "plans price cost tiers compare" },
  { href: "/edge", label: "angar Edge", keywords: "device hardware network sensor dns appliance box always on" },
  { href: "/computers", label: "Connected computers", keywords: "devices desktop app installed status connected agents" },
  { href: "/download", label: "Download the app", keywords: "install desktop app agent get windows mac" },
];

/**
 * Punteggio fuzzy 0..100. Premia: uguale, inizia-con, parola che inizia-con,
 * sottostringa, e sottosequenza (lettere in ordine, tipo "chgpt" → "chatgpt").
 * 0 = nessuna corrispondenza.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 90 - Math.min(20, t.length - q.length);
  // Inizio di una parola (es. "work" → "google workspace").
  const words = t.split(/[\s._\-/]+/);
  if (words.some((w) => w.startsWith(q))) return 75;
  const idx = t.indexOf(q);
  if (idx >= 0) return 60 - Math.min(20, idx);
  // Sottosequenza: tutte le lettere di q compaiono in ordine in t.
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  if (i === q.length) return 35 - Math.min(15, t.length - q.length);
  // Ultimo tentativo: match parola per parola della query multi-token.
  const qw = q.split(/\s+/).filter(Boolean);
  if (qw.length > 1 && qw.every((w) => t.includes(w))) return 50;
  return 0;
}

// Ricerca intelligente: pagine navigabili + scorer fuzzy condiviso tra API e UI.

export interface NavPage {
  href: string;
  label: string;
  keywords: string; // sinonimi, così "spend"/"costi" trovano il report ecc.
}

export const NAV_PAGES: NavPage[] = [
  { href: "/", label: "Overview", keywords: "home dashboard start" },
  { href: "/score", label: "angar Score", keywords: "score rating health efficiency spend visibility license utilization tool consumption savings opportunity dimensions" },
  { href: "/score/improve", label: "Improve my score", keywords: "improve score actions plan potential best next action raise points" },
  { href: "/opportunities", label: "Opportunities", keywords: "savings save money risparmi cut costs waste unused seats decisions recommendations what to change consolidate switch reduce dependency" },
  { href: "/opportunities?goal=save", label: "Goal: save money", keywords: "save target budget reduce spend a year plan decision" },
  { href: "/opportunities?goal=dependency", label: "Goal: reduce dependency", keywords: "provider dependency concentration lock-in openai anthropic alternatives" },
  { href: "/opportunities?goal=eu-only", label: "Goal: go EU-only", keywords: "eu only residency gdpr europe data location" },
  { href: "/opportunities?goal=migrate", label: "Which AI can we migrate?", keywords: "migrate migration replaceability switch model candidates" },
  { href: "/opportunities?view=progress", label: "Savings in progress", keywords: "accepted done saved so far verified ledger" },
  { href: "/opportunities?view=contracts", label: "Contracts", keywords: "contract notice renewal deadline auto-renew po cost center" },
  { href: "/opportunities?view=autopilot", label: "Autopilot", keywords: "autopilot automatic plans approve seats remove" },
  { href: "/impact", label: "Impact simulator", keywords: "what if scenario replace model provider outage deprecation price change budget simulate" },
  { href: "/estate", label: "AI Estate", keywords: "your ai list inventory systems all ai passports" },
  { href: "/estate/graph", label: "AI Estate graph", keywords: "graph dependencies depends on map concentration exit readiness replaceability" },
  { href: "/market", label: "AI market changes", keywords: "market price change deprecation retirement new model news" },
  { href: "/spend", label: "Spend", keywords: "spend cost costs by provider model team forecast trend anomalies actual estimated fixed usage" },
  { href: "/spend/subscriptions", label: "Subscriptions", keywords: "subscriptions plans seats billing cycle renewal" },
  { href: "/catalog", label: "AI price list", keywords: "price list catalog list prices tokens seats models" },
  { href: "/usage", label: "Usage", keywords: "who uses people activity seats active for each person" },
  { href: "/review", label: "To review", keywords: "approve pending new found shadow ai decide" },
  { href: "/connect", label: "Connect", keywords: "connect setup data sources add integrations collega" },
  { href: "/sources", label: "Sources", keywords: "bank invoices statement upload microsoft google accounting fatture integrations" },
  { href: "/connectors", label: "AI provider keys", keywords: "api key openai anthropic gemini mistral import csv" },
  { href: "/download", label: "Desktop app", keywords: "desktop app install download computers agent windows mac get" },
  { href: "/edge/sensors", label: "angar Edge", keywords: "edge network sensor dns firewall block on-prem server" },
  { href: "/gateway", label: "Gateway", keywords: "gateway proxy llm openai anthropic api key redact iban pii cap limit models tokens" },
  { href: "/download?view=other", label: "Other ways to find AI (extension, scan, logs)", keywords: "desktop app scan install computers agent download shadow ai" },
  { href: "/people", label: "People", keywords: "employees users staff owners who department person" },
  { href: "/activity", label: "Activity", keywords: "events timeline recent evidence assurance controls audit trail" },
  { href: "/providers", label: "Providers", keywords: "vendors openai anthropic google by vendor" },
  { href: "/report", label: "Monthly report", keywords: "spend cost email pdf month trend" },
  { href: "/billing", label: "Plan & billing", keywords: "subscription upgrade plan invoice payment stripe pricing price tiers compare" },
  { href: "/workspace", label: "Workspace", keywords: "team members people invite colleagues" },
  { href: "/activity?tab=changes", label: "Changes", keywords: "history what changed new removed timeline" },
  { href: "/data", label: "Data exposure", keywords: "privacy access data risk gdpr" },
  { href: "/governance", label: "Governance", keywords: "ai act compliance policy register evidence" },
  { href: "/audit", label: "Audit log", keywords: "activity log events who did what" },
  { href: "/settings", label: "Settings", keywords: "preferences theme account configuration" },
  { href: "/docs", label: "Documentation", keywords: "help guide how to docs" },
  { href: "/advisor", label: "AI Advisor", keywords: "recommend stack standardise consolidate what should we buy suggestions" },
  { href: "/simulate", label: "Simulator", keywords: "what if simulate scenario standardise yearly billing unused seats block" },
  { href: "/budgets", label: "Budgets", keywords: "budget department team limit overspend alert" },
  { href: "/compliance", label: "AI Act", keywords: "eu ai act compliance gdpr dpo register risk classification obligations" },
  { href: "/alerts", label: "Alerts", keywords: "notifications renewals warnings bell" },
  { href: "/partner", label: "Partner console", keywords: "clients accountant msp multi workspace customers" },
  { href: "/edge", label: "angar Edge", keywords: "device hardware network sensor dns appliance box always on" },
  { href: "/download?view=computers", label: "Connected computers", keywords: "devices desktop app installed status connected agents" },
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

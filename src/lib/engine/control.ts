/**
 * Indici di controllo (governance e rischio) — NON fanno parte dell'angar
 * Score dal metodo 2 (che misura solo l'efficienza della spesa AI), ma la
 * pagina Governance e il report per il board li mostrano ancora.
 * Stesse regole di prima, funzioni pure: ogni asse parte da 100 e ogni punto
 * perso è un driver con etichetta e link.
 */
export type ControlAxis = "governance" | "risk";

export interface ControlFacts {
  aiCount: number;
  /** AI non respinte (tutte tranne "Not allowed"). */
  activeAiCount: number;
  costKnown: boolean;
  reviewedCount: number;
  ownedCount: number;
  tieredCount: number;
  activePolicies: number;
  unapprovedInUse: number;
  highRiskCount: number;
  sensitiveExposed: number;
  shadowCount: number;
  trainsOnDataCount: number;
}

export interface ControlDriver {
  axis: ControlAxis;
  label: string;
  /** Punti persi sull'asse (negativo). */
  impact: number;
  href: string;
  missingData?: boolean;
}

export interface ControlResult {
  governance: number;
  risk: number;
  drivers: ControlDriver[];
}

const NEUTRAL = 50;
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const clamp = (n: number) => Math.max(0, Math.min(100, n));

function governance(f: ControlFacts): ControlDriver[] {
  const d: ControlDriver[] = [];
  if (f.aiCount === 0) return [{ axis: "governance", label: "No AI found yet", impact: -NEUTRAL, href: "/connect", missingData: true }];
  const toReview = f.aiCount - f.reviewedCount;
  const p1 = Math.round(40 * (toReview / f.aiCount));
  if (p1 > 0) d.push({ axis: "governance", label: `${plural(toReview, "AI", "AI")} not reviewed yet`, impact: -p1, href: "/review" });
  if (f.activeAiCount > 0) {
    const noOwner = f.activeAiCount - f.ownedCount;
    const p2 = Math.round(25 * (noOwner / f.activeAiCount));
    if (p2 > 0) d.push({ axis: "governance", label: `${plural(noOwner, "AI", "AI")} without an owner`, impact: -p2, href: "/governance" });
    const noTier = f.activeAiCount - f.tieredCount;
    const p3 = Math.round(20 * (noTier / f.activeAiCount));
    if (p3 > 0) d.push({ axis: "governance", label: `${plural(noTier, "AI", "AI")} without an AI Act class`, impact: -p3, href: "/compliance" });
  }
  if (f.activePolicies === 0) d.push({ axis: "governance", label: "No AI policy active", impact: -15, href: "/policies" });
  else if (f.activePolicies === 1) d.push({ axis: "governance", label: "Only one AI policy active", impact: -5, href: "/policies" });
  return d;
}

function risk(f: ControlFacts): ControlDriver[] {
  const d: ControlDriver[] = [];
  if (f.aiCount === 0) return [{ axis: "risk", label: "No AI found yet", impact: -NEUTRAL, href: "/connect", missingData: true }];
  if (f.unapprovedInUse > 0)
    d.push({ axis: "risk", label: `${plural(f.unapprovedInUse, "AI", "AI")} not allowed but still used`, impact: -Math.min(35, f.unapprovedInUse * 12), href: "/estate?status=UNAPPROVED" });
  if (f.highRiskCount > 0)
    d.push({ axis: "risk", label: `${plural(f.highRiskCount, "AI", "AI")} at high risk`, impact: -Math.min(25, Math.max(3, Math.round(50 * (f.highRiskCount / f.aiCount)))), href: "/governance" });
  if (f.sensitiveExposed > 0)
    d.push({ axis: "risk", label: `${plural(f.sensitiveExposed, "AI", "AI")} reach sensitive data without approval`, impact: -Math.min(20, f.sensitiveExposed * 7), href: "/data" });
  // Le AI non pagate dall'azienda contano solo se angar conosce i costi.
  if (f.costKnown && f.shadowCount > 0 && f.activeAiCount > 0) {
    const p = Math.min(20, Math.round(40 * (f.shadowCount / f.activeAiCount)));
    if (p > 0) d.push({ axis: "risk", label: `${plural(f.shadowCount, "AI", "AI")} on personal or free accounts`, impact: -p, href: "/estate?paid=no" });
  }
  // Fornitori che addestrano sui vostri dati di default: −3 per AI, massimo −9, mai oltre lo spazio rimasto.
  const trains = f.trainsOnDataCount;
  if (trains > 0) {
    const used = -d.reduce((s, x) => s + x.impact, 0);
    const p = Math.min(9, trains * 3, 100 - used);
    if (p > 0) d.push({ axis: "risk", label: `${plural(trains, "AI", "AI")} in use ${trains === 1 ? "trains" : "train"} on your data by default`, impact: -p, href: "/governance#vendor-risk" });
  }
  return d;
}

export function controlFromFacts(f: ControlFacts): ControlResult {
  const g = governance(f);
  const r = risk(f);
  const sum = (x: ControlDriver[]) => clamp(100 + x.reduce((s, d) => s + d.impact, 0));
  return { governance: sum(g), risk: sum(r), drivers: [...g, ...r].sort((a, b) => a.impact - b.impact) };
}

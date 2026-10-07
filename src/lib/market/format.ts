/**
 * AI Market Change engine — testi brevi per feed, Overview, avvisi e brief (puro).
 * Testi in inglese, senza la parola "per".
 */
import { modelById, providerNameOf, planByIdOf, deploymentOf, fmtDay } from "@/lib/pricing/service";

const DAY = 86_400_000;
const MINUS = "−";

export interface ChangeView {
  id?: string;
  changeType: string;
  providerId: string | null;
  modelId: string | null;
  planId: string | null;
  deploymentId: string | null;
  oldState: unknown;
  newState: unknown;
  effectiveAt: Date | null;
}

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? MINUS : ""}${Math.abs(Math.round(n * 10) / 10)}%`;

/** "€84K", "€1.2M", "€640" */
export function eurShort(n: number) {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M` : a >= 10_000 ? `${Math.round(a / 1000)}K` : a >= 1000 ? `${(a / 1000).toFixed(1)}K` : `${Math.round(a)}`;
  return `€${s.replace(/\.0(?=[KM])/, "")}`;
}
export const eurSigned = (n: number) => `${n > 0 ? "+" : n < 0 ? MINUS : ""}${eurShort(n)}`;

export const daysFrom = (d: Date | null, now: Date) => (d ? Math.ceil((d.getTime() - now.getTime()) / DAY) : null);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function subjectOf(c: ChangeView) {
  const st = (c.newState ?? {}) as { name?: string };
  if (c.modelId) return modelById(c.modelId)?.name ?? st.name ?? c.modelId.split(":").pop()!;
  if (c.planId) return planByIdOf(c.planId)?.name ?? c.planId;
  if (c.deploymentId) return deploymentOf(c.deploymentId)?.name ?? c.deploymentId;
  return "Catalog";
}

function priceText(c: ChangeView) {
  const o = ((c.oldState ?? {}) as { prices?: Record<string, number> }).prices ?? {};
  const n = ((c.newState ?? {}) as { prices?: Record<string, number> }).prices ?? {};
  const pct = (k: string) => (o[k] > 0 && n[k] != null ? ((n[k] - o[k]) / o[k]) * 100 : null);
  const pi = pct("input");
  const po = pct("output");
  if (pi != null && po != null) return Math.abs(pi - po) < 0.05 ? `Price ${signed(pi)}` : `Input ${signed(pi)} · Output ${signed(po)}`;
  if (po != null) return `Output price ${signed(po)}`;
  if (pi != null) return `Input price ${signed(pi)}`;
  const seat = pct("seat_monthly") ?? pct("seat_annual");
  if (seat != null) return `Seat price ${signed(seat)}`;
  const k = Object.keys(n)[0];
  const any = k ? pct(k) : null;
  return any != null ? `${k.replace(/_/g, " ")} price ${signed(any)}` : "Price changed";
}

/** Fornitore, soggetto (modello / piano) e cambiamento in poche parole, con la data. */
export function changeHeadline(c: ChangeView, now = new Date()) {
  const days = daysFrom(c.effectiveAt, now);
  const st = (c.newState ?? {}) as { region?: string; serviceTier?: string; generallyAvailable?: boolean; retiresAt?: string | null };
  const inDays = (d: number) => (d === 0 ? "today" : d > 0 ? `in ${plural(d, "day")}` : `${plural(-d, "day")} ago`);
  let change: string;
  switch (c.changeType) {
    case "price_change":
      change = `${priceText(c)}${days != null ? (days > 0 ? ` in ${plural(days, "day")}` : days === 0 ? " today" : ` since ${fmtDay(c.effectiveAt!)}`) : ""}`;
      break;
    case "deprecation":
      change = days != null && days > 0 ? `Deprecated in ${plural(days, "day")}` : "Deprecated";
      break;
    case "retirement":
      change = days == null ? "Retiring" : days > 0 ? `Retires in ${plural(days, "day")}` : days === 0 ? "Retires today" : `Retired ${inDays(days)}`;
      break;
    case "new_model":
      change = st.generallyAvailable ? "Generally available" : "New model";
      break;
    case "capability_change":
      change = "Capabilities changed";
      break;
    case "new_deployment":
      change = `Now on ${c.deploymentId ? deploymentOf(c.deploymentId)?.name ?? c.deploymentId : "a new platform"}`;
      break;
    case "new_region":
      change = `New region: ${(st.region ?? "").toUpperCase()}`;
      break;
    case "pricing_tier":
      change = `New ${st.serviceTier ?? ""} tier`.replace("  ", " ");
      break;
    default:
      change = "Changed";
  }
  return { provider: c.providerId ? providerNameOf(c.providerId) : "Market", subject: subjectOf(c), change, days };
}

export interface ImpactView {
  systems: number;
  exposedActualEur: number;
  exposedEstimatedEur: number;
  annualDeltaEur: number | null;
}

/** "7 systems · €84K a year exposed · +€16.4K a year" */
export function impactLine(i: ImpactView) {
  const monthly = i.exposedActualEur + i.exposedEstimatedEur;
  const parts = [plural(i.systems, "system")];
  if (monthly > 0) parts.push(`${eurShort(monthly * 12)} a year exposed${i.exposedActualEur === 0 ? " (estimated)" : ""}`);
  if (i.annualDeltaEur != null && Math.abs(i.annualDeltaEur) >= 1) parts.push(`${eurSigned(i.annualDeltaEur)} a year`);
  return parts.join(" · ");
}

/** Link al simulatore d'impatto (pagina /impact, costruita a parte). */
export function simulateHref(c: ChangeView & { newState: unknown }) {
  if (c.changeType === "price_change") {
    const pct = ((c.newState ?? {}) as { blendedPct?: number | null }).blendedPct;
    if (pct == null || !c.providerId) return null;
    const q = new URLSearchParams({ s: "price-change", provider: c.providerId, pct: String(Math.round(pct * 10) / 10) });
    if (c.modelId) q.set("model", c.modelId);
    return `/impact?${q}`;
  }
  if ((c.changeType === "deprecation" || c.changeType === "retirement") && c.modelId) return `/impact?${new URLSearchParams({ s: "deprecation", model: c.modelId })}`;
  return null;
}

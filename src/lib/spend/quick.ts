/**
 * Versione "senza account" del motore risparmi: lavora solo sul riepilogo
 * dell'estratto conto (piani, posti, doppioni), senza database.
 */
import { AI_SERVICES } from "@/lib/discovery/catalog";
import { PLANS, SERVICE_CATEGORY, CATEGORY_LABEL, type Category } from "@/lib/pricing/catalog";
import type { ServiceSpend } from "./parse";

export interface QuickLine {
  service: string;
  name: string;
  vendor: string;
  category: string;
  plan: string | null;
  seats: number | null;
  monthlyEur: number;
  charges: number;
}
export interface QuickSaving {
  title: string;
  detail: string;
  monthlyEur: number;
}

export function quickReport(summary: ServiceSpend[]) {
  const lines: QuickLine[] = summary.map((s) => {
    const svc = AI_SERVICES.find((x) => x.id === s.service);
    const cat = SERVICE_CATEGORY[s.service] as Category | undefined;
    return {
      service: s.service,
      name: svc?.name ?? s.service,
      vendor: svc?.vendor ?? "",
      category: cat ? CATEGORY_LABEL[cat] : "AI",
      plan: s.planName,
      seats: s.seats,
      monthlyEur: s.monthlyEur,
      charges: s.count,
    };
  });
  const savings: QuickSaving[] = [];
  for (const s of summary) {
    const plan = s.planId ? PLANS.find((p) => p.id === s.planId) : null;
    const name = AI_SERVICES.find((x) => x.id === s.service)?.name ?? s.service;
    if (plan?.annualMonthlyUsd && plan.annualMonthlyUsd < plan.monthlyUsd && !s.annual && s.count >= 2) {
      const pct = 1 - plan.annualMonthlyUsd / plan.monthlyUsd;
      savings.push({ title: `Pay ${name} yearly`, detail: `${s.seats && s.seats > 1 ? `${s.seats} seats of ` : ""}${plan.name} are ${Math.round(pct * 100)}% cheaper on yearly billing.`, monthlyEur: s.monthlyEur * pct });
    }
  }
  const byCat = new Map<string, ServiceSpend[]>();
  for (const s of summary) {
    const c = SERVICE_CATEGORY[s.service];
    if (!c || c === "api" || c === "local") continue;
    byCat.set(c, [...(byCat.get(c) ?? []), s]);
  }
  for (const [c, list] of byCat) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => b.monthlyEur - a.monthlyEur);
    const names = sorted.map((s) => AI_SERVICES.find((x) => x.id === s.service)?.name ?? s.service);
    savings.push({
      title: `${list.length} ${CATEGORY_LABEL[c as Category].toLowerCase()}s doing the same job`,
      detail: `You pay for ${names.join(", ")}. Standardise on one where the same people have both.`,
      monthlyEur: sorted.slice(1).reduce((t, s) => t + s.monthlyEur, 0),
    });
  }
  savings.sort((a, b) => b.monthlyEur - a.monthlyEur);
  const spend = lines.reduce((t, l) => t + l.monthlyEur, 0);
  const save = savings.reduce((t, s) => t + s.monthlyEur, 0);
  return { lines, savings, spend, save: Math.min(save, spend) };
}

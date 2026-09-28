import { fmtEur } from "@/lib/format";

export type LeadSummary = {
  monthlySpend?: number;
  monthlySavings?: number;
  ais?: { name: string; monthlyEur: number }[];
  topSavings?: { title: string; monthlyEur: number }[];
};

/** Testo del report dell'AI Spend Check (solo numeri aggregati e nomi delle AI). */
export function reportEmail(lead: { aiCount: number | null; summary: unknown }, origin: string) {
  const s = (lead.summary && typeof lead.summary === "object" ? lead.summary : {}) as LeadSummary;
  const spend = Number(s.monthlySpend) || 0;
  const save = Number(s.monthlySavings) || 0;
  const ais = Array.isArray(s.ais) ? s.ais : [];
  const top = Array.isArray(s.topSavings) ? s.topSavings : [];
  const lines = [
    "Here is your free AI Spend Check.",
    "",
    `AI services found: ${lead.aiCount ?? ais.length}`,
    `AI spend: ${fmtEur(spend)}/month (${fmtEur(spend * 12)} a year)`,
    `Possible savings: ${fmtEur(save)}/month (${fmtEur(save * 12)} a year)`,
    ...(ais.length ? ["", "AI you pay for:", ...ais.slice(0, 15).map((a) => `• ${a.name} — ${fmtEur(a.monthlyEur)}/month`)] : []),
    ...(top.length ? ["", "Where to start saving:", ...top.map((t) => `• ${t.title} — ${fmtEur(t.monthlyEur)}/month`)] : []),
    "",
    "Keep it up to date automatically — angar also finds AI used without being paid for and checks seats against real users. Create a free account:",
    `${origin}/signup`,
  ];
  return { subject: `Your AI spend: ${fmtEur(spend * 12)} a year, ${fmtEur(save * 12)} to save`, text: lines.join("\n") };
}

/**
 * Report mensile per il titolare / CFO: arriva via email, così non serve
 * nemmeno aprire angar. Stesso contenuto della pagina /report.
 */
import { db } from "@/lib/db";
import { computeSavings, monthlyOf } from "@/lib/savings";
import { radar } from "@/lib/radar";
import { fmtEur } from "@/lib/format";

export async function buildReport(organizationId: string) {
  const [org, { items, totalMonthly, assets }, events] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId } }),
    computeSavings(organizationId),
    radar(organizationId, 31),
  ]);
  const costed = assets.map((a) => ({ a, m: monthlyOf(a) })).filter((x) => x.m && x.m.eur > 0).sort((x, y) => y.m!.eur - x.m!.eur);
  const spend = costed.reduce((s, x) => s + x.m!.eur, 0);
  const month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });
  return { org, month, assets, costed, spend, savings: items, canSave: totalMonthly, events };
}

export function reportText(r: Awaited<ReturnType<typeof buildReport>>, origin: string) {
  const lines = [
    `${r.org?.name ?? "Your company"} — AI report, ${r.month}`,
    "",
    `You use ${r.assets.length} AI tools and spend ${fmtEur(r.spend)} a month on AI.`,
    r.canSave > 0 ? `angar found ${fmtEur(r.canSave)} a month (${fmtEur(r.canSave * 12)} a year) you could save.` : "No savings found this month — your AI spend looks tidy.",
    "",
    "Biggest costs:",
    ...r.costed.slice(0, 5).map((x) => `• ${x.a.name}: ${fmtEur(x.m!.eur)}/month${x.m!.estimated ? " (estimated)" : ""}`),
  ];
  if (r.savings.length) lines.push("", "Top savings:", ...r.savings.slice(0, 3).map((s) => `• ${s.title} — ${fmtEur(s.monthlyEur)}/month`));
  if (r.events.length) lines.push("", "What changed:", ...r.events.slice(0, 5).map((e) => `• ${e.title}`));
  lines.push("", `Open angar: ${origin}/`);
  return lines.join("\n");
}

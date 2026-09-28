/**
 * Report mensile per il titolare / CFO: arriva via email, così non serve
 * nemmeno aprire angar. Stesso contenuto della pagina /report.
 */
import { db } from "@/lib/db";
import { computeSavings, monthlyOf } from "@/lib/savings";
import { radar } from "@/lib/radar";
import { fmtEur, fmtDate } from "@/lib/format";
import { upcomingRenewals } from "@/lib/renewals";

export async function buildReport(organizationId: string) {
  const [org, { items, totalMonthly, assets }, events, renewals] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId } }),
    computeSavings(organizationId),
    radar(organizationId, 31),
    upcomingRenewals(organizationId, 45),
  ]);
  const costed = assets.map((a) => ({ a, m: monthlyOf(a) })).filter((x) => x.m && x.m.eur > 0).sort((x, y) => y.m!.eur - x.m!.eur);
  const spend = costed.reduce((s, x) => s + x.m!.eur, 0);
  const month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });
  // Risparmi realizzati (registro) e scadenze di disdetta dei contratti nei prossimi 45 giorni.
  const [saved, contracts] = await Promise.all([import("@/lib/savings-ledger").then((m) => m.savedSoFar(organizationId)), import("@/lib/contracts").then((m) => m.contractRows(organizationId))]);
  const deadlines = contracts.filter((c) => c.daysLeft != null && c.daysLeft >= 0 && c.daysLeft <= 45);
  return { org, month, assets, costed, spend, savings: items, canSave: totalMonthly, events, renewals: renewals.filter((r) => r.annual), saved: { monthly: saved.savedMonthly, verified: saved.verifiedMonthly, count: saved.counts.done + saved.counts.verified }, deadlines };
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
  if (r.saved.monthly >= 1) lines.push("", `Saved so far: ${fmtEur(r.saved.monthly)} a month (${fmtEur(r.saved.monthly * 12)} a year) from ${r.saved.count} change${r.saved.count === 1 ? "" : "s"}${r.saved.verified >= 1 ? `, ${fmtEur(r.saved.verified)} confirmed on your bills` : ""}.`);
  if (r.deadlines.length) lines.push("", "Contract notice deadlines:", ...r.deadlines.map((c) => `• ${c.name} — give notice by ${fmtDate(c.deadline!)}${c.owner ? ` (${c.owner})` : ""}`));
  if (r.savings.length) lines.push("", "Top savings:", ...r.savings.slice(0, 3).map((s) => `• ${s.title} — ${fmtEur(s.monthlyEur)}/month`));
  if (r.renewals.length) lines.push("", "Yearly renewals coming:", ...r.renewals.map((x) => `• ${x.name} — ${fmtDate(x.date)}, ${fmtEur(x.amountEur)}`));
  if (r.events.length) lines.push("", "What changed:", ...r.events.slice(0, 5).map((e) => `• ${e.title}`));
  lines.push("", `Open angar: ${origin}/`, `Quarterly board pack (printable): ${origin}/report/board`);
  return lines.join("\n");
}

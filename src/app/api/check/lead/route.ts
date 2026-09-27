import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, emailEnabled, appOrigin } from "@/lib/mail";
import { fmtEur } from "@/lib/format";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e9 ? v : 0);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Lead dall'AI Spend Check pubblico. Salva solo email, azienda, numeri
 * aggregati e nomi delle AI — mai l'estratto conto né le singole righe.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const email = str(body.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  const company = str(body.company, 120) || null;
  const monthlySpend = num(body.monthlySpend);
  const monthlySavings = Math.min(num(body.monthlySavings), monthlySpend);
  const aiCount = Math.min(500, Math.round(num(body.aiCount)));
  const ais = (Array.isArray(body.ais) ? body.ais : []).slice(0, 50).map((a) => ({ name: str((a as { name?: unknown })?.name, 80), monthlyEur: Math.round(num((a as { monthlyEur?: unknown })?.monthlyEur)) })).filter((a) => a.name);
  const topSavings = (Array.isArray(body.topSavings) ? body.topSavings : []).slice(0, 5).map((s) => ({ title: str((s as { title?: unknown })?.title, 160), monthlyEur: Math.round(num((s as { monthlyEur?: unknown })?.monthlyEur)) })).filter((s) => s.title);

  // Rate limit semplice: stessa email negli ultimi 10 minuti → rispondiamo ok senza rifare nulla.
  const recent = await db.lead.findFirst({ where: { email, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } }, select: { id: true } });
  if (recent) return NextResponse.json({ ok: true, emailed: false });

  await db.lead.create({
    data: {
      email,
      company,
      annualSpend: Math.round(monthlySpend * 12),
      savings: Math.round(monthlySavings * 12),
      aiCount,
      summary: { source: "spend-check", monthlySpend: Math.round(monthlySpend), monthlySavings: Math.round(monthlySavings), ais, topSavings },
    },
  });

  let emailed = false;
  // Tetto globale: l'endpoint è pubblico, non deve diventare un modo per spedire email a chiunque.
  const lastHour = await db.lead.count({ where: { createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (emailEnabled() && lastHour <= 30) {
    const origin = appOrigin(req.headers);
    const lines = [
      "Here is your free AI Spend Check.",
      "",
      `AI services found: ${aiCount}`,
      `AI spend: ${fmtEur(monthlySpend)}/month (${fmtEur(monthlySpend * 12)} a year)`,
      `Possible savings: ${fmtEur(monthlySavings)}/month (${fmtEur(monthlySavings * 12)} a year)`,
      ...(ais.length ? ["", "AI you pay for:", ...ais.slice(0, 15).map((a) => `• ${a.name} — ${fmtEur(a.monthlyEur)}/month`)] : []),
      ...(topSavings.length ? ["", "Where to start saving:", ...topSavings.map((s) => `• ${s.title} — ${fmtEur(s.monthlyEur)}/month`)] : []),
      "",
      "Keep it up to date automatically — angar also finds AI used without being paid for and checks seats against real users. Create a free account:",
      `${origin}/signup`,
    ];
    const r = await sendEmail({ to: email, subject: `Your AI spend: ${fmtEur(monthlySpend * 12)} a year, ${fmtEur(monthlySavings * 12)} to save`, text: lines.join("\n") });
    emailed = r.sent;
  }
  return NextResponse.json({ ok: true, emailed });
}

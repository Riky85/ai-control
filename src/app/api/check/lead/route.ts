import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { sendEmail, emailEnabled } from "@/lib/mail";
import { appUrl } from "@/lib/alerts";
import { clientIp, rateLimit, retryAfter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e9 ? v : 0);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const RATE = { limit: 5, windowMs: 3_600_000 };

/**
 * Lead dall'AI Spend Check pubblico. Salva solo email, azienda, numeri
 * aggregati e nomi delle AI — mai l'estratto conto né le singole righe.
 * Doppio opt-in: all'indirizzo arriva prima solo un link di conferma; il report
 * parte dopo il clic (GET /api/check/lead/confirm). Senza email configurata
 * non si spedisce nulla. Limite: 5 richieste all'ora per IP.
 */
export async function POST(req: Request) {
  if (!rateLimit(`lead:${clientIp(req.headers)}`, RATE.limit, RATE.windowMs)) {
    return NextResponse.json({ ok: false, error: "Too many requests — try again later." }, { status: 429, headers: { "Retry-After": String(retryAfter(RATE.limit, RATE.windowMs)) } });
  }
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

  // Stessa email negli ultimi 10 minuti → ok senza rifare nulla.
  const recent = await db.lead.findFirst({ where: { email, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } }, select: { id: true } });
  if (recent) return NextResponse.json({ ok: true, emailed: false, confirm: emailEnabled() });

  const token = randomBytes(24).toString("base64url");
  const canEmail = emailEnabled();
  await db.lead.create({
    data: {
      email,
      company,
      annualSpend: Math.round(monthlySpend * 12),
      savings: Math.round(monthlySavings * 12),
      aiCount,
      summary: { source: "spend-check", monthlySpend: Math.round(monthlySpend), monthlySavings: Math.round(monthlySavings), ais, topSavings },
      confirmTokenHash: canEmail ? createHash("sha256").update(token).digest("hex") : null,
    },
  });

  if (!canEmail) return NextResponse.json({ ok: true, emailed: false, confirm: false });
  // Tetto globale: l'endpoint è pubblico, non deve diventare un modo per spedire email a chiunque.
  const lastHour = await db.lead.count({ where: { createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (lastHour > 30) return NextResponse.json({ ok: true, emailed: false, confirm: false });
  // Link sempre dal dominio configurato (mai dall'header Host della richiesta).
  const link = `${appUrl()}/api/check/lead/confirm?t=${token}`;
  const r = await sendEmail({
    to: email,
    subject: "Confirm your email to get your AI Spend Check",
    text: `Someone (hopefully you) asked for an AI Spend Check report to be sent to this address.\n\nConfirm to receive it:\n${link}\n\nIf this wasn't you, ignore this email — nothing will be sent.`,
  });
  return NextResponse.json({ ok: true, emailed: false, confirm: r.sent });
}

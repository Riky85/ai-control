import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { newDesktopToken } from "@/lib/discovery/desktop-tokens";
import { clientIp, rateLimit, retryAfter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Ogni installazione crea una riga: un limite per IP evita di riempire la tabella.
// Largo: un'installazione silenziosa (Intune, Jamf) su centinaia di PC esce da un solo IP.
const RATE = { limit: 1000, windowMs: 3_600_000 };

// L'app desktop si collega all'azienda con il codice del link aziendale
// (è nel nome del file scaricato): riceve un token tutto suo, che il primo
// invio lega all'email della persona. Stessa risposta di prima: { token, company }.
export async function GET(req: Request, { params }: { params: { code: string } }) {
  if (!rateLimit(`join:${clientIp(req.headers)}`, RATE.limit, RATE.windowMs)) {
    return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429, headers: { "Retry-After": String(retryAfter(RATE.limit, RATE.windowMs)) } });
  }
  const code = String(params.code ?? "").slice(0, 60);
  const org = code.length >= 8 ? await db.organization.findUnique({ where: { joinCode: code } }) : null;
  if (!org) return NextResponse.json({ error: "Unknown company link." }, { status: 404 });
  const token = await newDesktopToken(org.id);
  return NextResponse.json({ token, company: org.name }, { headers: { "Cache-Control": "no-store" } });
}

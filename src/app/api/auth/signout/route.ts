import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

function signOut(req: Request, reason: string | null) {
  const url = new URL("/login", req.url);
  url.searchParams.set("error", (reason ?? "Please sign in again.").slice(0, 200));
  const res = NextResponse.redirect(url, 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

// Richiesta partita da un altro sito (link o immagine): niente logout forzato.
function crossSite(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin" && site !== "none";
}

// GET: solo i redirect interni quando la sessione non è più valida (es. membro
// rimosso dal workspace, sessione revocata), mai da altri siti.
export function GET(req: Request) {
  if (crossSite(req)) return NextResponse.redirect(new URL("/", req.url));
  return signOut(req, new URL(req.url).searchParams.get("reason"));
}

// POST: logout esplicito (stessa origine).
export async function POST(req: Request) {
  if (crossSite(req)) return new Response("Forbidden", { status: 403 });
  const form = await req.formData().catch(() => null);
  return signOut(req, form?.get("reason") ? String(form.get("reason")) : null);
}

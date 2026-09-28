import { NextResponse, type NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";

// Percorsi accessibili senza login.
const PUBLIC = ["/login", "/signup", "/forgot", "/reset/", "/share/", "/api/billing/webhook", "/api/health", "/api/backup/cron", "/api/discovery/", "/api/spend/sample", "/check", "/pricing", "/join/", "/api/check/", "/seat/", "/api/edge/", "/api/invite/", "/login/mfa", "/api/auth/sso/", "/api/auth/signout", "/verify-email/", "/api/v1/", "/api/slack/", "/ack/"];
const IDENTITY_HEADERS = ["x-angar-account", "x-angar-email", "x-angar-name", "x-angar-org", "x-angar-role"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Mai fidarsi di header d'identità inviati dal browser.
  const headers = new Headers(req.headers);
  IDENTITY_HEADERS.forEach((h) => headers.delete(h));

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p));

  if (!session) {
    if (isPublic) return NextResponse.next({ request: { headers } });
    // I link one-click dei messaggi Slack/Teams (/api/chat-action/) vanno al login e poi tornano.
    if (pathname.startsWith("/api/") && !pathname.startsWith("/api/chat-action/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Già autenticato: niente pagina di login.
  if (pathname === "/login" || pathname === "/signup" || pathname === "/forgot" || pathname.startsWith("/reset/")) return NextResponse.redirect(new URL("/", req.url));

  // Workspace con MFA obbligatoria e account senza MFA: prima si attiva, poi il resto dell'app.
  if (session.f && !["/account/security", "/api/auth/", "/verify-email/"].some((p) => pathname.startsWith(p))) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Turn on two-step verification first" }, { status: 403 });
    return NextResponse.redirect(new URL("/account/security?required=1", req.url));
  }

  headers.set("x-angar-account", session.a);
  headers.set("x-angar-email", session.e);
  if (session.n) headers.set("x-angar-name", encodeURIComponent(session.n));
  headers.set("x-angar-org", session.o);
  headers.set("x-angar-role", session.r);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Tutto tranne file statici di Next e icone.
  // Manifest e icone dell'app installabile restano pubblici (il browser li scarica senza cookie).
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico|manifest.webmanifest|icons/).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";

// Percorsi accessibili senza login.
const PUBLIC = ["/login", "/signup", "/share/", "/api/billing/webhook", "/api/health"];
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
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Già autenticato: niente pagina di login.
  if (pathname === "/login" || pathname === "/signup") return NextResponse.redirect(new URL("/", req.url));

  headers.set("x-angar-account", session.a);
  headers.set("x-angar-email", session.e);
  if (session.n) headers.set("x-angar-name", encodeURIComponent(session.n));
  headers.set("x-angar-org", session.o);
  headers.set("x-angar-role", session.r);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Tutto tranne file statici di Next e icone.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};

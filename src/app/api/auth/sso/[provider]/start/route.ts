import { secureCookies } from "@/lib/edition";
import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/mail";
import { signPurpose } from "@/lib/session";
import { ssoProvider, ssoCallbackUrl, newPkce, randomToken, authorizeUrl, SSO_COOKIE, SSO_COOKIE_PATH } from "@/lib/sso";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Porta al login di Microsoft/Google. State, nonce e verifier PKCE restano in
// un cookie firmato di 10 minuti, legato a questo browser.
export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const origin = appOrigin(req.headers);
  const q = new URL(req.url).searchParams;
  const back = (msg: string) => NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);
  const p = ssoProvider(params.provider);
  if (!p) return back("That sign-in option isn't available on this deployment.");
  if (!rateLimit(`sso:${clientIp(req.headers)}`, 30, 10 * 60_000)) return back("Too many attempts from your network. Wait a few minutes and try again.");

  const rawNext = q.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\") && !rawNext.startsWith("/login") ? rawNext.slice(0, 500) : "/";
  const loginHint = (q.get("email") ?? "").slice(0, 320) || undefined;
  const { verifier, challenge } = newPkce();
  const state = randomToken();
  const nonce = randomToken();
  const token = await signPurpose("sso", { p: p.id, v: verifier, s: state, n: nonce, next }, 600);

  const res = NextResponse.redirect(authorizeUrl(p, { redirectUri: ssoCallbackUrl(origin, p.id), state, nonce, challenge, loginHint }));
  res.cookies.set(SSO_COOKIE, token, { httpOnly: true, secure: secureCookies(), sameSite: "lax", path: SSO_COOKIE_PATH, maxAge: 600 });
  return res;
}

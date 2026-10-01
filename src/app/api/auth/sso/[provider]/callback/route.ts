import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import type { MemberRole } from "@prisma/client";
import { db } from "@/lib/db";
import { appOrigin } from "@/lib/mail";
import { verifyPurpose } from "@/lib/session";
import { issueSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { ssoProvider, ssoCallbackUrl, exchangeCode, verifyIdToken, verifiedEmail, SsoError, SSO_COOKIE, SSO_COOKIE_PATH } from "@/lib/sso";

export const dynamic = "force-dynamic";

const PUBLIC_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "yahoo.com", "libero.it", "gmx.de", "web.de"]);

// Ritorno da Microsoft/Google: verifica state + id_token, poi account, inviti e sessione.
export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const origin = appOrigin(req.headers);
  const q = new URL(req.url).searchParams;
  const jar = cookies();
  const saved = await verifyPurpose<{ p: string; v: string; s: string; n: string; next: string }>("sso", jar.get(SSO_COOKIE)?.value);
  jar.set(SSO_COOKIE, "", { path: SSO_COOKIE_PATH, maxAge: 0 });
  const back = (msg: string) => NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);

  const p = ssoProvider(params.provider);
  if (!p) return back("That sign-in option isn't available on this deployment.");
  if (!rateLimit(`sso:${clientIp(req.headers)}`, 30, 10 * 60_000)) return back("Too many attempts from your network. Wait a few minutes and try again.");
  if (!saved || saved.p !== p.id || !q.get("state") || q.get("state") !== saved.s) return back(`The ${p.label} sign-in expired or didn't match this browser — try again.`);
  if (q.get("error")) {
    const cancelled = q.get("error") === "access_denied";
    return back(cancelled ? `${p.label} sign-in was cancelled.` : `${p.label}: ${(q.get("error_description") ?? q.get("error") ?? "").slice(0, 200)}`);
  }
  const code = q.get("code");
  if (!code) return back(`${p.label} didn't return a sign-in code.`);

  let email: string | null;
  let displayName: string | undefined;
  let subject: string;
  try {
    const idToken = await exchangeCode(p, code, saved.v, ssoCallbackUrl(origin, p.id));
    const claims = await verifyIdToken(p, idToken, saved.n);
    email = verifiedEmail(p, claims);
    displayName = claims.name?.trim().slice(0, 120) || undefined;
    subject = claims.sub;
  } catch (err) {
    console.error("[sso]", p.id, err);
    return back(err instanceof SsoError ? err.message : `${p.label} sign-in failed — try again.`);
  }
  if (!email) return back(`${p.label} didn't confirm your email address. Use an account with a verified email, or sign in with your password.`);

  // Account: l'email verificata dal provider prova il possesso → si collega a quello esistente.
  const isFirstAccount = (await db.account.count()) === 0;
  let account = await db.account.findUnique({ where: { email } });
  if (!account) {
    account = await db.account.create({
      data: { email, name: displayName ?? null, passwordHash: `sso$${randomBytes(32).toString("base64url")}`, ssoOnly: true, emailVerifiedAt: new Date() },
    });
    await audit("auth.signup", email, { via: p.id, firstAccount: isFirstAccount }, { orgId: null, actorEmail: email });
  } else if (!account.emailVerifiedAt || (!account.name && displayName)) {
    account = await db.account.update({ where: { id: account.id }, data: { emailVerifiedAt: account.emailVerifiedAt ?? new Date(), name: account.name ?? displayName } });
  }

  // Link d'invito da cui si è partiti (se era per questa email).
  const next = saved.next;
  let target: string | null = null;
  if (next.startsWith("/api/invite/")) {
    const inv = await db.workspaceMember.findUnique({ where: { inviteToken: next.slice("/api/invite/".length) } });
    if (inv && inv.email === email) target = inv.organizationId;
  }
  // Inviti in sospeso per questa stessa email: l'email verificata basta per accettarli.
  const pending = await db.workspaceMember.findMany({ where: { email, status: "invited" } });
  for (const inv of pending) {
    await db.workspaceMember.update({ where: { id: inv.id }, data: { status: "active", inviteToken: null, name: inv.name ?? account.name ?? undefined } });
    await audit("member.join", email, { via: `invite+${p.id}` }, { orgId: inv.organizationId, actorEmail: email });
  }

  let onboarding = false;
  if (isFirstAccount) {
    // Primo account della piattaforma: Owner dei workspace già esistenti (come nella registrazione).
    const orgs = await db.organization.findMany({ orderBy: { createdAt: "asc" } });
    for (const o of orgs) {
      await db.workspaceMember.upsert({
        where: { organizationId_email: { organizationId: o.id, email } },
        update: { role: "OWNER" as MemberRole, status: "active" },
        create: { organizationId: o.id, email, name: account.name, role: "OWNER", status: "active" },
      });
    }
  }
  const memberships = await db.workspaceMember.findMany({ where: { email, status: "active" }, orderBy: { invitedAt: "asc" } });
  if (memberships.length === 0) {
    // Nuovo utente senza workspace: se ne crea uno, come alla registrazione.
    const domain = email.split("@")[1];
    const fromDomain = domain && !PUBLIC_MAIL.has(domain) ? domain.split(".").slice(-2, -1)[0] : "";
    const orgName = fromDomain ? fromDomain.charAt(0).toUpperCase() + fromDomain.slice(1) : `${account.name || email.split("@")[0]}'s company`;
    const org = await db.organization.create({ data: { name: orgName.slice(0, 120), privacyMode: "department" } });
    await db.workspaceMember.create({ data: { organizationId: org.id, email, name: account.name, role: "OWNER", status: "active" } });
    memberships.push({ organizationId: org.id } as (typeof memberships)[number]);
    onboarding = true;
  }
  const orgId = target && memberships.some((m) => m.organizationId === target) ? target : memberships[0].organizationId;

  await db.account.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
  await issueSession(account, orgId, "sso");
  await audit("auth.login", email, { via: p.id, sub: subject.slice(0, 80) }, { orgId, actorEmail: email });
  const dest = onboarding ? "/onboarding" : next.startsWith("/api/invite/") ? "/" : next;
  return NextResponse.redirect(`${origin}${dest}`);
}

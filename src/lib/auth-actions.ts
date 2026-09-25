"use server";

import { fmtTime } from "@/lib/format";

import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { sendEmail, appOrigin, emailEnabled } from "@/lib/mail";
import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { MemberRole } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword, passwordProblem } from "@/lib/password";
import { signSession, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";
import { currentSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

/** Emette il cookie di sessione per un account su un workspace di cui è membro. */
export async function issueSession(account: { id: string; email: string; name: string | null }, orgId: string) {
  const member = await db.workspaceMember.findUnique({ where: { organizationId_email: { organizationId: orgId, email: account.email } } });
  if (!member) throw new Error("Not a member of this workspace");
  const token = await signSession({ a: account.id, e: account.email, n: account.name ?? undefined, o: orgId, r: member.role });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

function safeNext(next: FormDataEntryValue | null) {
  const n = String(next ?? "");
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/login") ? n : "/";
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const fail = (msg: string) => redirect(`/login?error=${encodeURIComponent(msg)}&email=${encodeURIComponent(email)}`);

  const account = await db.account.findUnique({ where: { email } });
  if (account?.lockedUntil && account.lockedUntil > new Date()) {
    fail(`Too many failed attempts. Try again after ${fmtTime(account.lockedUntil)}.`);
  }
  const ok = account ? await verifyPassword(password, account.passwordHash) : false;
  if (!account || !ok) {
    if (account) {
      const failed = account.failedLogins + 1;
      await db.account.update({
        where: { id: account.id },
        data: { failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      });
    }
    await audit("auth.login_failed", email, undefined, { orgId: null, actorEmail: email });
    fail("Wrong email or password.");
  }

  const memberships = await db.workspaceMember.findMany({ where: { email }, orderBy: { invitedAt: "asc" } });
  if (memberships.length === 0) fail("This account isn't part of any workspace. Ask an owner to invite you.");
  await db.account.update({ where: { id: account!.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await db.workspaceMember.updateMany({ where: { email, status: "invited" }, data: { status: "active" } });
  await issueSession(account!, memberships[0].organizationId);
  await audit("auth.login", email, undefined, { orgId: memberships[0].organizationId, actorEmail: email });
  redirect(next);
}

export async function signUpAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const company = String(formData.get("company") ?? "").trim();
  const fail = (msg: string) => redirect(`/signup?error=${encodeURIComponent(msg)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&company=${encodeURIComponent(company)}`);

  if (!email.includes("@")) fail("Enter a valid email.");
  const problem = passwordProblem(password);
  if (problem) fail(problem);
  if (await db.account.findUnique({ where: { email } })) fail("An account with this email already exists — sign in instead.");

  const isFirstAccount = (await db.account.count()) === 0;
  const invited = await db.workspaceMember.findMany({ where: { email } });

  const account = await db.account.create({ data: { email, name: name || null, passwordHash: await hashPassword(password) } });

  let orgId: string;
  if (isFirstAccount) {
    // Primo account della piattaforma: diventa Owner dei workspace già esistenti.
    const orgs = await db.organization.findMany({ orderBy: { createdAt: "asc" } });
    for (const o of orgs) {
      await db.workspaceMember.upsert({
        where: { organizationId_email: { organizationId: o.id, email } },
        update: { role: "OWNER" as MemberRole, status: "active", name: name || undefined },
        create: { organizationId: o.id, email, name: name || null, role: "OWNER", status: "active" },
      });
    }
    orgId = orgs[0]?.id ?? (await db.organization.create({ data: { name: company || "My company" } })).id;
    if (!orgs.length) await db.workspaceMember.create({ data: { organizationId: orgId, email, name: name || null, role: "OWNER", status: "active" } });
  } else if (invited.length > 0) {
    await db.workspaceMember.updateMany({ where: { email }, data: { status: "active", name: name || undefined } });
    orgId = invited[0].organizationId;
  } else {
    const org = await db.organization.create({ data: { name: company || `${name || email.split("@")[0]}'s company` } });
    await db.workspaceMember.create({ data: { organizationId: org.id, email, name: name || null, role: "OWNER", status: "active" } });
    orgId = org.id;
  }

  await issueSession(account, orgId);
  await audit("auth.signup", email, { firstAccount: isFirstAccount, invited: invited.length > 0 }, { orgId, actorEmail: email });
  redirect(isFirstAccount || invited.length > 0 ? "/" : "/connectors");
}

export async function signOutAction() {
  const s = currentSession();
  if (s) await audit("auth.logout", s.email);
  cookies().delete(SESSION_COOKIE);
  redirect("/login");
}

// ── Recupero password ───────────────────────────────────────────────────

const RESET_MINUTES = 60;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Crea un link di reset monouso (nel DB solo l'hash) e restituisce l'URL. */
async function createResetLink(accountId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.passwordResetToken.create({ data: { accountId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) } });
  return `${appOrigin(headers())}/reset/${token}`;
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const account = email ? await db.account.findUnique({ where: { email } }) : null;
  if (account) {
    const link = await createResetLink(account.id);
    await sendEmail({
      to: email,
      subject: "Reset your Angar password",
      text: `Someone asked to reset the password for ${email}.\n\nSet a new password here (valid for ${RESET_MINUTES} minutes, one use only):\n${link}\n\nIf it wasn't you, ignore this email — your password stays the same.`,
    });
    await audit("auth.reset_requested", email, { emailSent: emailEnabled() }, { orgId: null, actorEmail: email });
  }
  // Stessa risposta in ogni caso: non riveliamo se un'email ha un account.
  redirect("/forgot?sent=1");
}

export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const back = (msg: string) => redirect(`/reset/${token}?error=${encodeURIComponent(msg)}`);
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) redirect("/forgot?expired=1");
  const problem = passwordProblem(password);
  if (problem) back(problem);
  const account = await db.account.update({
    where: { id: row!.accountId },
    data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null },
  });
  // Il link usato e gli altri ancora aperti per lo stesso account non valgono più.
  await db.passwordResetToken.updateMany({ where: { accountId: account.id, usedAt: null }, data: { usedAt: new Date() } });
  await audit("auth.password_reset", account.email, undefined, { orgId: null, actorEmail: account.email });
  redirect("/login?reset=1&email=" + encodeURIComponent(account.email));
}

/** Per gli Admin: link di reset per un membro, da inviare a mano se le email non sono attive. */
export async function createMemberResetLinkAction(formData: FormData) {
  const s = await requireRole("ADMIN", "/workspace");
  const email = String(formData.get("email") ?? "").toLowerCase();
  const member = await db.workspaceMember.findUnique({ where: { organizationId_email: { organizationId: s.orgId, email } } });
  const account = member ? await db.account.findUnique({ where: { email } }) : null;
  if (!account) redirect(`/workspace?error=${encodeURIComponent("This person hasn't created an account yet — send them the sign-up link instead.")}`);
  const link = await createResetLink(account!.id);
  await audit("auth.reset_link_created", email);
  redirect(`/workspace?resetFor=${encodeURIComponent(email)}&resetLink=${encodeURIComponent(link)}`);
}

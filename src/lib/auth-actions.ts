"use server";

import { secureCookies } from "@/lib/edition";
import { fmtTime } from "@/lib/format";

import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { sendEmail, appOrigin, emailEnabled } from "@/lib/mail";
import { requireRole, issueSession, ssoEnforced } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { MemberRole } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword, passwordProblem } from "@/lib/password";
import { SESSION_COOKIE, signPurpose, verifyPurpose, verifySession } from "@/lib/session";
import { currentSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { encryptJson, decryptJson } from "@/lib/crypto";
import { newTotpSecret, verifyTotp, newRecoveryCodes, hashRecoveryCode } from "@/lib/totp";
import { ssoAvailable } from "@/lib/sso";

// NB: in un file "use server" ogni funzione esportata è un endpoint pubblico.
// issueSession vive in @/lib/auth proprio per non esserlo.

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const MFA_COOKIE = "angar_mfa";
const MFA_MINUTES = 5;

const ip = () => clientIp(headers());
const TOO_MANY = "Too many attempts from your network. Wait a few minutes and try again.";

function safeNext(next: FormDataEntryValue | string | null | undefined) {
  const n = String(next ?? "");
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") && !n.startsWith("/login") ? n : "/";
}

type LoginAccount = { id: string; email: string; name: string | null };

async function registerFailure(account: { id: string; failedLogins: number }) {
  const failed = account.failedLogins + 1;
  await db.account.update({
    where: { id: account.id },
    data: { failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
  });
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 320);
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const fail = (msg: string) => redirect(`/login?error=${encodeURIComponent(msg)}&email=${encodeURIComponent(email)}${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`);

  if (!rateLimit(`login:${ip()}`, 20, 10 * 60_000)) fail(TOO_MANY);

  const account = await db.account.findUnique({ where: { email } });
  if (account?.lockedUntil && account.lockedUntil > new Date()) {
    fail(`Too many failed attempts. Try again after ${fmtTime(account.lockedUntil)}.`);
  }
  if (account?.ssoOnly) {
    const sso = ssoAvailable();
    fail(sso.microsoft || sso.google ? "This account signs in with Microsoft or Google — use the button above." : "This account has no password yet. Use “Forgot?” to set one.");
  }
  const ok = account ? await verifyPassword(password, account.passwordHash) : false;
  if (!account || !ok) {
    if (account) await registerFailure(account);
    await audit("auth.login_failed", email, undefined, { orgId: null, actorEmail: email });
    fail("Wrong email or password.");
  }

  // Password giusta e MFA attiva: secondo passo con un cookie firmato di 5 minuti.
  if (account!.totpEnabledAt && account!.totpSecretEncrypted) {
    const token = await signPurpose("mfa", { a: account!.id, next }, MFA_MINUTES * 60);
    cookies().set(MFA_COOKIE, token, { httpOnly: true, secure: secureCookies(), sameSite: "lax", path: "/", maxAge: MFA_MINUTES * 60 });
    redirect("/login/mfa");
  }
  await finishPasswordLogin(account!, next, fail);
}

/** Dopo password (ed eventuale MFA): invito dal link, scelta del workspace, sessione. */
async function finishPasswordLogin(account: LoginAccount, next: string, fail: (msg: string) => never) {
  const email = account.email;
  // Arrivato dal link d'invito (prova di possesso dell'email) con le credenziali giuste: l'invito si accetta ora.
  if (next.startsWith("/api/invite/")) {
    const invite = await db.workspaceMember.findUnique({ where: { inviteToken: next.slice("/api/invite/".length) } });
    if (invite && invite.email === email && invite.status === "invited") {
      await db.workspaceMember.update({ where: { id: invite.id }, data: { status: "active", inviteToken: null } });
      await db.account.update({ where: { id: account.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
      await audit("member.join", email, { via: "invite" }, { orgId: invite.organizationId, actorEmail: email });
      await issueSession(account, invite.organizationId, "pwd");
      redirect("/");
    }
  }
  // Si entra solo nei workspace già attivi: un invito si accetta dal link ricevuto per email.
  const memberships = await db.workspaceMember.findMany({
    where: { email, status: "active" },
    orderBy: { invitedAt: "asc" },
    include: { organization: { select: { name: true, ssoRequired: true, ssoDomain: true } } },
  });
  if (memberships.length === 0) {
    const pending = await db.workspaceMember.count({ where: { email, status: "invited" } });
    fail(pending ? "Open the invitation link we emailed you to join the workspace." : "This account isn't part of any workspace. Ask an owner to invite you.");
  }
  // Workspace con SSO obbligatorio: niente password. Si entra in un altro, se c'è.
  const allowed = memberships.filter((m) => !ssoEnforced(m.organization, email));
  if (allowed.length === 0) {
    fail(`${memberships[0].organization.name} requires signing in with Microsoft or Google.`);
  }
  await db.account.update({ where: { id: account.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await issueSession(account, allowed[0].organizationId, "pwd");
  await audit("auth.login", email, undefined, { orgId: allowed[0].organizationId, actorEmail: email });
  redirect(next);
}

/** Secondo passo del login: codice dell'app o codice di recupero. */
export async function verifyMfaAction(formData: FormData) {
  const pending = await verifyPurpose<{ a: string; next: string }>("mfa", cookies().get(MFA_COOKIE)?.value);
  if (!pending) redirect(`/login?error=${encodeURIComponent("The sign-in took too long — enter your password again.")}`);
  const fail = (msg: string) => redirect(`/login/mfa?error=${encodeURIComponent(msg)}`);
  if (!rateLimit(`mfa:${ip()}`, 10, 5 * 60_000)) fail(TOO_MANY);

  const account = await db.account.findUnique({ where: { id: pending!.a } });
  if (!account || !account.totpEnabledAt || !account.totpSecretEncrypted) redirect("/login");
  if (account!.lockedUntil && account!.lockedUntil > new Date()) {
    cookies().delete(MFA_COOKIE);
    redirect(`/login?error=${encodeURIComponent(`Too many failed attempts. Try again after ${fmtTime(account!.lockedUntil)}.`)}`);
  }
  const code = String(formData.get("code") ?? "").trim();
  const secret = decryptJson<{ s: string }>(account!.totpSecretEncrypted)?.s;
  let via: "totp" | "recovery" | null = null;
  if (secret && /^\d[\d\s]{5,7}$/.test(code)) {
    const step = verifyTotp(secret, code, account!.totpLastStep);
    if (step !== null) {
      // Solo se il passo è ancora quello letto (niente doppio uso dello stesso codice in parallelo).
      const r = await db.account.updateMany({ where: { id: account!.id, totpLastStep: account!.totpLastStep }, data: { totpLastStep: step } });
      if (r.count === 1) via = "totp";
    }
  } else if (code.length >= 10) {
    const h = hashRecoveryCode(code);
    if (account!.recoveryCodesHash.includes(h)) {
      const r = await db.account.updateMany({ where: { id: account!.id, recoveryCodesHash: { has: h } }, data: { recoveryCodesHash: account!.recoveryCodesHash.filter((x) => x !== h) } });
      if (r.count === 1) via = "recovery";
    }
  }
  if (!via) {
    await registerFailure(account!);
    await audit("auth.mfa_failed", account!.email, undefined, { orgId: null, actorEmail: account!.email });
    fail("That code didn't work. Check the time on your phone and try the newest code.");
  }
  cookies().delete(MFA_COOKIE);
  if (via === "recovery") await audit("auth.mfa_recovery_used", account!.email, { left: account!.recoveryCodesHash.length - 1 }, { orgId: null, actorEmail: account!.email });
  const loginFail = (msg: string) => redirect(`/login?error=${encodeURIComponent(msg)}&email=${encodeURIComponent(account!.email)}`);
  await finishPasswordLogin(account!, safeNext(pending!.next), loginFail);
}

export async function signUpAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 320);
  const password = String(formData.get("password") ?? "");
  const company = String(formData.get("company") ?? "").trim().slice(0, 120);
  const inviteToken = String(formData.get("invite") ?? "").trim().slice(0, 100);
  const fail = (msg: string) => redirect(`/signup?error=${encodeURIComponent(msg)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&company=${encodeURIComponent(company)}${inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ""}`);

  if (!rateLimit(`signup:${ip()}`, 10, 60 * 60_000)) fail(TOO_MANY);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter a valid email.");
  const problem = passwordProblem(password);
  if (problem) fail(problem);
  if (await db.account.findUnique({ where: { email } })) fail("An account with this email already exists — sign in instead.");

  const isFirstAccount = (await db.account.count()) === 0;
  // Si entra in un workspace solo con il link d'invito giusto (prova di possesso dell'email).
  const invite = inviteToken ? await db.workspaceMember.findUnique({ where: { inviteToken } }) : null;
  const invited = invite && invite.email === email && invite.status === "invited" ? [invite] : [];

  // Il link d'invito arriva per email: chi lo usa ha già dimostrato di possedere l'indirizzo.
  const account = await db.account.create({
    data: { email, name: name || null, passwordHash: await hashPassword(password), emailVerifiedAt: invited.length ? new Date() : null },
  });

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
    await db.workspaceMember.update({ where: { id: invited[0].id }, data: { status: "active", inviteToken: null, name: name || undefined } });
    orgId = invited[0].organizationId;
  } else {
    const org = await db.organization.create({ data: { name: company || `${name || email.split("@")[0]}'s company` } });
    await db.workspaceMember.create({ data: { organizationId: org.id, email, name: name || null, role: "OWNER", status: "active" } });
    orgId = org.id;
  }

  if (!account.emailVerifiedAt && emailEnabled()) await sendVerificationEmail(account);
  await audit("auth.signup", email, { firstAccount: isFirstAccount, invited: invited.length > 0 }, { orgId, actorEmail: email });
  await issueSession(account, orgId, "pwd");
  redirect(isFirstAccount || invited.length > 0 ? "/" : "/onboarding");
}

export async function signOutAction() {
  const s = currentSession();
  if (s) await audit("auth.logout", s.email);
  cookies().delete(SESSION_COOKIE);
  redirect("/login");
}

// ── Verifica email ──────────────────────────────────────────────────────

const VERIFY_HOURS = 24;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function sendVerificationEmail(account: { id: string; email: string }) {
  const token = randomBytes(32).toString("base64url");
  await db.emailVerificationToken.create({ data: { accountId: account.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + VERIFY_HOURS * 3600_000) } });
  const link = `${appOrigin(headers())}/verify-email/${token}`;
  return sendEmail({
    to: account.email,
    subject: "Confirm your email for angar",
    text: `Confirm that ${account.email} is your email address (valid for ${VERIFY_HOURS} hours):\n${link}\n\nIf you didn't create an angar account, ignore this email.`,
  });
}

export async function resendVerificationAction() {
  const s = currentSession();
  if (!s) redirect("/login");
  const account = await db.account.findUnique({ where: { id: s.accountId } });
  const back = (q: string) => redirect(`/account?${q}`);
  if (!account || account.emailVerifiedAt) back("verified=1");
  if (!emailEnabled()) back(`error=${encodeURIComponent("Email isn't set up on this deployment.")}`);
  if (!rateLimit(`verify:${account!.id}`, 3, 60 * 60_000)) back(`error=${encodeURIComponent("We already sent a few links — check your inbox (and spam) or try again in an hour.")}`);
  const r = await sendVerificationEmail(account!);
  back(r.sent ? "verifySent=1" : `error=${encodeURIComponent(r.reason ?? "The email couldn't be sent.")}`);
}

// ── Recupero password ───────────────────────────────────────────────────

const RESET_MINUTES = 60;

/** Crea un link di reset monouso (nel DB solo l'hash) e restituisce l'URL. */
async function createResetLink(accountId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.passwordResetToken.create({ data: { accountId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) } });
  return `${appOrigin(headers())}/reset/${token}`;
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 320);
  // Oltre il limite si risponde uguale, senza inviare nulla.
  const allowed = rateLimit(`forgot:${ip()}`, 5, 15 * 60_000) && rateLimit(`forgot:${email}`, 3, 60 * 60_000);
  const account = email && allowed ? await db.account.findUnique({ where: { email } }) : null;
  if (account) {
    const link = await createResetLink(account.id);
    await sendEmail({
      to: email,
      subject: "Reset your angar password",
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
    data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, ssoOnly: false },
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
  // L'account è unico tra i workspace: un admin non deve poter prendere il controllo di un owner,
  // né di chi è membro anche di altri workspace (es. lo MSP che gestisce più clienti).
  if (member && member.role === "OWNER" && s.role !== "OWNER") redirect(`/workspace?error=${encodeURIComponent("Only an owner can create a reset link for another owner.")}`);
  const elsewhere = member ? await db.workspaceMember.count({ where: { email, status: "active", organizationId: { not: s.orgId } } }) : 0;
  if (elsewhere > 0) redirect(`/workspace?error=${encodeURIComponent("This person also belongs to other workspaces — ask them to use “Forgot password” on the sign-in page.")}`);
  const account = member && member.status === "active" ? await db.account.findUnique({ where: { email } }) : null;
  if (!account) redirect(`/workspace?error=${encodeURIComponent("This person hasn't created an account yet — send them the sign-up link instead.")}`);
  const link = await createResetLink(account!.id);
  await audit("auth.reset_link_created", email);
  redirect(`/workspace?resetFor=${encodeURIComponent(email)}&resetLink=${encodeURIComponent(link)}`);
}

// ── Il mio account ──────────────────────────────────────────────────────

async function me() {
  const s = currentSession();
  if (!s) redirect("/login");
  const account = await db.account.findUnique({ where: { id: s.accountId } });
  if (!account) redirect("/api/auth/signout");
  return { s: s!, account: account! };
}

export async function updateProfileAction(formData: FormData) {
  const { s, account } = await me();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (!name) redirect(`/account?error=${encodeURIComponent("Enter your name.")}`);
  await db.account.update({ where: { id: account.id }, data: { name } });
  await db.workspaceMember.updateMany({ where: { email: account.email }, data: { name } });
  await issueSession({ ...account, name }, s.orgId);
  await audit("account.profile_updated", account.email);
  redirect("/account?saved=profile");
}

export async function changePasswordAction(formData: FormData) {
  const { account } = await me();
  const back = (q: string) => redirect(`/account?${q}#password`);
  if (!rateLimit(`pwchange:${account.id}`, 5, 15 * 60_000)) back(`error=${encodeURIComponent(TOO_MANY)}`);
  if (account.ssoOnly) back(`error=${encodeURIComponent("You sign in with Microsoft or Google. To add a password, use “Forgot password” on the sign-in page.")}`);
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!(await verifyPassword(current, account.passwordHash))) {
    await audit("account.password_change_failed", account.email);
    back(`error=${encodeURIComponent("Your current password is wrong.")}`);
  }
  const problem = passwordProblem(password);
  if (problem) back(`error=${encodeURIComponent(problem)}`);
  if (current === password) back(`error=${encodeURIComponent("Choose a password different from the current one.")}`);
  await db.account.update({ where: { id: account.id }, data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null } });
  await db.passwordResetToken.updateMany({ where: { accountId: account.id, usedAt: null }, data: { usedAt: new Date() } });
  await audit("account.password_changed", account.email);
  back("saved=password");
}

// ── MFA (TOTP) ──────────────────────────────────────────────────────────

/** Crea il segreto (non ancora attivo) e mostra il QR da scansionare. */
export async function startMfaEnrolAction() {
  const { account } = await me();
  if (account.ssoOnly) redirect(`/account/security?error=${encodeURIComponent("You sign in with Microsoft or Google — two-step verification is handled there.")}`);
  if (account.totpEnabledAt) redirect("/account/security");
  try {
    await db.account.update({ where: { id: account.id }, data: { totpSecretEncrypted: encryptJson({ s: newTotpSecret() }), totpLastStep: null } });
  } catch (err) {
    redirect(`/account/security?error=${encodeURIComponent((err as Error).message)}`);
  }
  redirect("/account/security?setup=1");
}

export type MfaFormState = { error?: string; codes?: string[] };

/** Conferma con il primo codice: MFA attiva e 10 codici di recupero (mostrati una volta). */
export async function confirmMfaAction(_prev: MfaFormState, formData: FormData): Promise<MfaFormState> {
  const { s, account } = await me();
  if (account.totpEnabledAt) return { error: "Two-step verification is already on." };
  if (!rateLimit(`mfaenrol:${account.id}`, 10, 5 * 60_000)) return { error: TOO_MANY };
  const secret = decryptJson<{ s: string }>(account.totpSecretEncrypted)?.s;
  if (!secret) return { error: "Start the setup again." };
  const step = verifyTotp(secret, String(formData.get("code") ?? ""));
  if (step === null) return { error: "That code didn't work. Check the time on your phone and try the newest code." };
  const codes = newRecoveryCodes();
  await db.account.update({ where: { id: account.id }, data: { totpEnabledAt: new Date(), totpLastStep: step, recoveryCodesHash: codes.map(hashRecoveryCode) } });
  await audit("account.mfa_enabled", account.email);
  // Toglie l'eventuale obbligo di attivazione dalla sessione.
  await issueSession(account, s.orgId);
  return { codes };
}

export async function regenerateRecoveryCodesAction(_prev: MfaFormState, formData: FormData): Promise<MfaFormState> {
  const { account } = await me();
  if (!account.totpEnabledAt) return { error: "Two-step verification is off." };
  if (!rateLimit(`mfaenrol:${account.id}`, 10, 5 * 60_000)) return { error: TOO_MANY };
  const secret = decryptJson<{ s: string }>(account.totpSecretEncrypted)?.s;
  const step = secret ? verifyTotp(secret, String(formData.get("code") ?? ""), account.totpLastStep) : null;
  if (step === null) return { error: "Enter a current code from your authenticator app." };
  const codes = newRecoveryCodes();
  await db.account.update({ where: { id: account.id }, data: { totpLastStep: step, recoveryCodesHash: codes.map(hashRecoveryCode) } });
  await audit("account.mfa_recovery_regenerated", account.email);
  return { codes };
}

export async function disableMfaAction(formData: FormData) {
  const { account } = await me();
  const back = (msg: string) => redirect(`/account/security?error=${encodeURIComponent(msg)}`);
  if (!account.totpEnabledAt) redirect("/account/security");
  if (!rateLimit(`mfaenrol:${account.id}`, 10, 5 * 60_000)) back(TOO_MANY);
  const required = await db.workspaceMember.findFirst({ where: { email: account.email, status: "active", organization: { mfaRequired: true } }, include: { organization: { select: { name: true } } } });
  if (required) back(`${required.organization.name} requires two-step verification, so it can't be turned off.`);
  if (!(await verifyPassword(String(formData.get("password") ?? ""), account.passwordHash))) back("Your password is wrong.");
  const secret = decryptJson<{ s: string }>(account.totpSecretEncrypted)?.s;
  if (!secret || verifyTotp(secret, String(formData.get("code") ?? ""), account.totpLastStep) === null) back("That code didn't work.");
  await db.account.update({ where: { id: account.id }, data: { totpEnabledAt: null, totpSecretEncrypted: null, totpLastStep: null, recoveryCodesHash: [] } });
  await audit("account.mfa_disabled", account.email);
  redirect("/account/security?off=1");
}

/** Annulla una configurazione iniziata e non confermata. */
export async function cancelMfaEnrolAction() {
  const { account } = await me();
  if (!account.totpEnabledAt) await db.account.update({ where: { id: account.id }, data: { totpSecretEncrypted: null } });
  redirect("/account/security");
}

// ── Sicurezza d'accesso del workspace (Owner) ───────────────────────────

export async function setSignInSecurityAction(formData: FormData) {
  const s = await requireRole("OWNER", "/settings?tab=security");
  const back = (q: string) => redirect(`/settings?tab=security&${q}`);
  const ssoRequired = formData.get("ssoRequired") === "on";
  const mfaRequired = formData.get("mfaRequired") === "on";
  const rawDomain = String(formData.get("ssoDomain") ?? "").trim().toLowerCase().replace(/^@/, "");
  if (rawDomain && !/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(rawDomain)) back(`signin=${encodeURIComponent("Enter a domain like company.com.")}`);
  const ssoDomain = rawDomain || null;
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.orgId } });
  const account = await db.account.findUniqueOrThrow({ where: { id: s.accountId } });

  if (ssoRequired && !org.ssoRequired) {
    const sso = ssoAvailable();
    if (!sso.microsoft && !sso.google) back(`signin=${encodeURIComponent("Sign-in with Microsoft or Google isn't set up on this deployment yet.")}`);
  }
  // Per non chiudersi fuori: chi attiva l'obbligo SSO e ne è soggetto deve essere entrato con SSO.
  if (ssoRequired && ssoEnforced({ ssoRequired, ssoDomain }, s.email)) {
    const session = await verifySession(cookies().get(SESSION_COOKIE)?.value);
    if (session?.m !== "sso") back(`signin=${encodeURIComponent("Sign out and sign in with Microsoft or Google first, so you don't lock yourself out.")}`);
  }
  if (mfaRequired && !org.mfaRequired && !account.ssoOnly && !account.totpEnabledAt) {
    back(`signin=${encodeURIComponent("Turn on two-step verification for your own account first (Account → Security).")}`);
  }
  await db.organization.update({ where: { id: org.id }, data: { ssoRequired, ssoDomain, mfaRequired } });
  await audit("settings.signin_security", org.id, { ssoRequired, ssoDomain, mfaRequired });
  back("signin=ok");
}

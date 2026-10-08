import { secureCookies } from "@/lib/edition";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { MemberRole } from "@prisma/client";
import { db } from "@/lib/db";
import { signSession, verifySession, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";
import { emailEnabled } from "@/lib/mail";

/**
 * Sessione della richiesta corrente. Il middleware verifica la firma del
 * token e inoltra questi header (cancellando quelli eventualmente inviati
 * dal browser), quindi qui sono affidabili.
 */
export interface Session {
  accountId: string;
  email: string;
  name?: string;
  orgId: string;
  role: MemberRole;
  sv: number; // versione della sessione nel token (0 per i token vecchi)
}

export function currentSession(): Session | null {
  try {
    const h = headers();
    const accountId = h.get("x-angar-account");
    const orgId = h.get("x-angar-org");
    if (!accountId || !orgId) return null;
    return {
      accountId,
      orgId,
      email: h.get("x-angar-email") ?? "",
      name: h.get("x-angar-name") ? decodeURIComponent(h.get("x-angar-name")!) : undefined,
      role: (h.get("x-angar-role") ?? "VIEWER") as MemberRole,
      sv: Number(h.get("x-angar-sv") ?? 0) || 0,
    };
  } catch {
    return null;
  }
}

const RANK: Record<MemberRole, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 };

/**
 * Il token è stateless: per revocarlo (logout, cambio password, MFA…) si
 * confronta la sua versione con Account.sessionVersion. Restituisce il membro
 * attivo del workspace della sessione, oppure null (sessione revocata,
 * account cancellato o membro rimosso). Da usare in export e download.
 */
export async function activeMember(s: Session) {
  const [member, account] = await Promise.all([
    db.workspaceMember.findUnique({ where: { organizationId_email: { organizationId: s.orgId, email: s.email } } }),
    db.account.findUnique({ where: { id: s.accountId }, select: { sessionVersion: true } }),
  ]);
  if (!account || account.sessionVersion !== s.sv) return null;
  if (!member || member.status !== "active") return null;
  return member;
}

/** Solo la versione della sessione (per chi non passa dal membro, es. backup di piattaforma). */
export async function sessionCurrent(s: Session) {
  const account = await db.account.findUnique({ where: { id: s.accountId }, select: { sessionVersion: true } });
  return Boolean(account && account.sessionVersion === s.sv);
}

/** Invalida tutte le sessioni aperte dell'account (i token già emessi non valgono più). */
export async function bumpSessionVersion(accountId: string) {
  return db.account.update({ where: { id: accountId }, data: { sessionVersion: { increment: 1 } } });
}

/**
 * Per le azioni che modificano dati: ricontrolla il ruolo nel database (non
 * solo nel token), così un membro rimosso o declassato perde subito i
 * permessi di scrittura. Anche una sessione revocata viene chiusa qui.
 */
export async function requireRole(min: MemberRole, back = "/"): Promise<Session> {
  const s = currentSession();
  if (!s) redirect("/login");
  const [member, account] = await Promise.all([
    db.workspaceMember.findUnique({ where: { organizationId_email: { organizationId: s.orgId, email: s.email } } }),
    db.account.findUnique({ where: { id: s.accountId }, select: { sessionVersion: true } }),
  ]);
  if (!account || account.sessionVersion !== s.sv) redirect("/api/auth/signout?reason=" + encodeURIComponent("Your session has ended — sign in again."));
  if (!member || member.status !== "active") redirect("/login?error=" + encodeURIComponent("You no longer have access to this workspace."));
  if (RANK[member.role] < RANK[min]) {
    const sep = back.includes("?") ? "&" : "?";
    redirect(`${back}${sep}error=${encodeURIComponent(`This needs the ${min.toLowerCase()} role or higher — ask an owner of this workspace.`)}`);
  }
  return { ...s, role: member.role };
}

/**
 * Email non ancora confermata: con la password si entra SOLO nei workspace
 * creati dall'account stesso (Owner di un workspace nato dopo l'account).
 * Altrimenti chi registra per primo l'email di un altro entrerebbe nei suoi
 * workspace. Senza email configurata la conferma è impossibile: si lascia passare.
 */
export function unverifiedMayEnter(
  account: { emailVerifiedAt: Date | null; createdAt: Date },
  member: { role: MemberRole },
  org: { createdAt: Date }
): boolean {
  if (account.emailVerifiedAt || !emailEnabled()) return true;
  return member.role === "OWNER" && org.createdAt.getTime() >= account.createdAt.getTime() - 1000;
}

/**
 * Amministratore della piattaforma (non di un singolo workspace): vede la
 * pagina System e scarica i backup, che contengono i dati di TUTTI i
 * workspace. Solo chi è elencato in PLATFORM_ADMIN_EMAILS: senza la variabile
 * nessuno (fail closed).
 */
export async function isPlatformAdmin(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const list = (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

export async function requirePlatformAdmin(): Promise<Session> {
  const s = currentSession();
  if (!s) redirect("/login");
  if (!(await isPlatformAdmin(s.email))) redirect("/?error=" + encodeURIComponent("Only the platform administrator can open that page."));
  return s;
}

/** Il workspace obbliga questa email ad entrare con Microsoft/Google (tutti, o solo il dominio indicato)? */
export function ssoEnforced(org: { ssoRequired: boolean; ssoDomain: string | null } | null | undefined, email: string): boolean {
  if (!org?.ssoRequired) return false;
  const domain = org.ssoDomain?.trim().toLowerCase().replace(/^@/, "");
  return !domain || email.toLowerCase().endsWith(`@${domain}`);
}

/**
 * Emette il cookie di sessione per un account su un workspace di cui è membro.
 * NON sta in un file "use server": non deve mai diventare un'azione chiamabile dal browser.
 * `method` = come si è autenticato; se manca si eredita dalla sessione attuale
 * dello stesso account (cambio workspace), altrimenti vale "password".
 * Rispetta le regole del workspace: SSO obbligatorio (rifiuta) e MFA
 * obbligatoria (sessione limitata all'attivazione della MFA).
 */
export async function issueSession(account: { id: string; email: string; name: string | null }, orgId: string, method?: "pwd" | "sso") {
  const member = await db.workspaceMember.findUnique({ where: { organizationId_email: { organizationId: orgId, email: account.email } } });
  if (!member) throw new Error("Not a member of this workspace");
  const current = await verifySession(cookies().get(SESSION_COOKIE)?.value);
  const m = method ?? (current?.a === account.id && current.m === "sso" ? "sso" : "pwd");
  const [org, acct] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId }, select: { name: true, ssoRequired: true, ssoDomain: true, mfaRequired: true, createdAt: true } }),
    db.account.findUnique({ where: { id: account.id }, select: { totpEnabledAt: true, sessionVersion: true, emailVerifiedAt: true, createdAt: true } }),
  ]);
  if (!org || !acct) throw new Error("Not a member of this workspace");
  // Email non confermata: niente accesso con password ai workspace di altri.
  if (m === "pwd" && !unverifiedMayEnter(acct, member, org)) {
    const msg = "Check your email to verify your address before opening this workspace.";
    redirect(current ? `/?error=${encodeURIComponent(msg)}` : `/login?error=${encodeURIComponent(msg)}&email=${encodeURIComponent(account.email)}`);
  }
  if (m === "pwd" && ssoEnforced(org, account.email)) {
    const msg = `${org?.name ?? "This workspace"} requires signing in with Microsoft or Google.`;
    redirect(current ? `/?error=${encodeURIComponent(msg + " Sign out and use the Microsoft or Google button.")}` : `/login?error=${encodeURIComponent(msg)}&email=${encodeURIComponent(account.email)}`);
  }
  const mustEnrolMfa = m === "pwd" && Boolean(org?.mfaRequired) && !acct?.totpEnabledAt;
  const token = await signSession({ a: account.id, e: account.email, n: account.name ?? undefined, o: orgId, r: member.role, m, v: acct.sessionVersion, ...(mustEnrolMfa ? { f: 1 as const } : {}) });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

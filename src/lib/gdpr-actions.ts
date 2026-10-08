"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentSession, issueSession, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { SESSION_COOKIE } from "@/lib/session";

// Diritto alla cancellazione (GDPR art. 17): cancellare un workspace intero
// (solo Owner) o il proprio account. NB: in un file "use server" ogni funzione
// esportata è un endpoint pubblico — gli helper restano non esportati.

export type GdprFormState = { error?: string };

/** Abbonamenti Stripe ancora attivi: vanno disdetti prima, altrimenti si continuerebbe a pagare. */
function hasLiveSubscription(org: { stripeSubscriptionId: string | null; stripeAddonSubscriptionId: string | null; stripeEdgeSubscriptionId: string | null }) {
  return Boolean(org.stripeSubscriptionId || org.stripeAddonSubscriptionId || org.stripeEdgeSubscriptionId);
}

/**
 * Cancella il workspace e tutti i suoi dati. Quasi tutte le tabelle hanno
 * onDelete: Cascade verso Organization; quelle senza relazione si puliscono a
 * mano. Anche il registro di audit appartiene al workspace e sparisce: resta
 * solo una riga nei log del server (senza email).
 */
async function purgeOrganization(orgId: string) {
  const where = { organizationId: orgId };
  await db.$transaction([
    db.emailHistory.deleteMany({ where }),
    db.errorEvent.deleteMany({ where }),
    db.impactScenario.deleteMany({ where }),
    db.opportunityState.deleteMany({ where }),
    db.organization.delete({ where: { id: orgId } }),
  ]);
}

/** Dopo la cancellazione: si passa a un altro workspace dell'utente, se c'è; altrimenti fuori. */
async function leaveTo(accountId: string, email: string, message: string) {
  const other = await db.workspaceMember.findFirst({ where: { email, status: "active" }, orderBy: { invitedAt: "asc" } });
  const account = other ? await db.account.findUnique({ where: { id: accountId } }) : null;
  revalidatePath("/", "layout");
  if (other && account) {
    await issueSession(account, other.organizationId);
    redirect(`/?error=${encodeURIComponent(message)}`);
  }
  cookies().delete(SESSION_COOKIE);
  redirect(`/login?error=${encodeURIComponent(message)}`);
}

export async function deleteWorkspaceAction(_prev: GdprFormState, formData: FormData): Promise<GdprFormState> {
  const s = await requireRole("OWNER", "/settings?tab=data");
  const org = await db.organization.findUnique({ where: { id: s.orgId } });
  if (!org) return { error: "This workspace no longer exists." };
  if (String(formData.get("confirm") ?? "").trim() !== org.name) return { error: `Type the workspace name exactly ("${org.name}") to confirm.` };
  if (hasLiveSubscription(org)) return { error: "Cancel the subscription in Plan & billing first, then delete the workspace." };

  await purgeOrganization(org.id);
  console.log(`[gdpr] workspace ${org.id} deleted by account ${s.accountId}`);

  // Unico workspace dell'account: senza workspace l'account non serve più, si cancella anche lui.
  const others = await db.workspaceMember.count({ where: { email: s.email, status: "active" } });
  if (others === 0) {
    await deleteAccountRows(s.accountId, s.email);
    console.log(`[gdpr] account ${s.accountId} deleted with its last workspace`);
    cookies().delete(SESSION_COOKIE);
    redirect(`/login?error=${encodeURIComponent("Your workspace and your account were deleted.")}`);
  }
  await leaveTo(s.accountId, s.email, `Workspace “${org.name}” was deleted.`);
  return {};
}

/** Righe dell'account: inviti e appartenenze, token e l'account stesso. */
async function deleteAccountRows(accountId: string, email: string) {
  await db.$transaction([
    db.workspaceMember.deleteMany({ where: { email } }),
    db.passwordResetToken.deleteMany({ where: { accountId } }),
    db.emailVerificationToken.deleteMany({ where: { accountId } }),
    db.account.deleteMany({ where: { id: accountId } }),
  ]);
}

export async function deleteAccountAction(_prev: GdprFormState, formData: FormData): Promise<GdprFormState> {
  const s = currentSession();
  if (!s) redirect("/login");
  const account = await db.account.findUnique({ where: { id: s.accountId } });
  if (!account || account.sessionVersion !== s.sv) redirect("/api/auth/signout");
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== account.email) return { error: `Type your email (${account.email}) to confirm.` };

  const memberships = await db.workspaceMember.findMany({ where: { email: account.email, status: "active" }, include: { organization: true } });
  const blocked: string[] = [];
  const paid: string[] = [];
  const alone: string[] = [];
  for (const m of memberships) {
    const [others, otherOwners] = await Promise.all([
      db.workspaceMember.count({ where: { organizationId: m.organizationId, status: "active", email: { not: account.email } } }),
      db.workspaceMember.count({ where: { organizationId: m.organizationId, status: "active", role: "OWNER", email: { not: account.email } } }),
    ]);
    if (others === 0) {
      // Workspace dove si è soli: si cancella con l'account (se non c'è un abbonamento attivo).
      if (hasLiveSubscription(m.organization)) paid.push(m.organization.name);
      else alone.push(m.organizationId);
    } else if (m.role === "OWNER" && otherOwners === 0) {
      blocked.push(m.organization.name);
    }
  }
  if (blocked.length) return { error: `You're the only owner of ${blocked.join(", ")}. Make someone else an owner (Workspace → Members) or delete the workspace first.` };
  if (paid.length) return { error: `${paid.join(", ")} still has an active subscription. Cancel it in Plan & billing first.` };

  // Nel registro dei workspace che restano: chi è uscito e perché (prima di cancellare l'appartenenza).
  for (const m of memberships) {
    if (!alone.includes(m.organizationId)) await audit("member.account_deleted", account.email, undefined, { orgId: m.organizationId, actorEmail: account.email });
  }
  for (const orgId of alone) await purgeOrganization(orgId);
  await deleteAccountRows(account.id, account.email);
  console.log(`[gdpr] account ${account.id} deleted (${alone.length} workspace(s) removed with it)`);
  cookies().delete(SESSION_COOKIE);
  redirect(`/login?error=${encodeURIComponent("Your account was deleted.")}`);
}

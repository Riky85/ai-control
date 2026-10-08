import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { issueSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Link d'invito ricevuto per email: chi lo apre dimostra di avere quell'email.
// Già dentro con la stessa email → entra nel workspace; altrimenti accesso o registrazione.
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const url = (path: string) => new URL(path, process.env.APP_URL || req.url);
  const token = String(params.token ?? "").slice(0, 100);
  const member = token.length >= 20 ? await db.workspaceMember.findUnique({ where: { inviteToken: token }, include: { organization: { select: { name: true } } } }) : null;
  if (!member || member.status !== "invited") {
    return NextResponse.redirect(url(`/login?error=${encodeURIComponent("This invitation link isn't valid any more — ask for a new one.")}`));
  }
  const session = currentSession();
  if (session && session.email !== member.email) {
    return NextResponse.redirect(url(`/?error=${encodeURIComponent(`This invitation is for ${member.email}. Sign out and open the link again.`)}`));
  }
  const account = await db.account.findUnique({ where: { email: member.email } });
  if (!account) return NextResponse.redirect(url(`/signup?email=${encodeURIComponent(member.email)}&invite=${encodeURIComponent(token)}`));
  if (!session) return NextResponse.redirect(url(`/login?email=${encodeURIComponent(member.email)}&next=${encodeURIComponent(`/api/invite/${token}`)}`));

  await db.workspaceMember.update({ where: { id: member.id }, data: { status: "active", inviteToken: null } });
  // Il link d'invito arriva per email: l'indirizzo è confermato.
  if (!account.emailVerifiedAt) await db.account.update({ where: { id: account.id }, data: { emailVerifiedAt: new Date() } });
  await issueSession(account, member.organizationId);
  await audit("member.join", member.email, { via: "invite" }, { orgId: member.organizationId, actorEmail: member.email });
  return NextResponse.redirect(url("/"));
}

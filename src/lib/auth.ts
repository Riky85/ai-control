import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { MemberRole } from "@prisma/client";
import { db } from "@/lib/db";

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
    };
  } catch {
    return null;
  }
}

const RANK: Record<MemberRole, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 };

/**
 * Per le azioni che modificano dati: ricontrolla il ruolo nel database (non
 * solo nel token), così un membro rimosso o declassato perde subito i
 * permessi di scrittura.
 */
export async function requireRole(min: MemberRole, back = "/"): Promise<Session> {
  const s = currentSession();
  if (!s) redirect("/login");
  const member = await db.workspaceMember.findUnique({ where: { organizationId_email: { organizationId: s.orgId, email: s.email } } });
  if (!member) redirect("/login?error=" + encodeURIComponent("You no longer have access to this workspace."));
  if (RANK[member.role] < RANK[min]) {
    const sep = back.includes("?") ? "&" : "?";
    redirect(`${back}${sep}error=${encodeURIComponent(`This needs the ${min.toLowerCase()} role or higher — ask an owner of this workspace.`)}`);
  }
  return { ...s, role: member.role };
}

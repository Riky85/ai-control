import { db } from "@/lib/db";

// Lettura per la pagina Account (non è un'azione server): quali workspace
// verrebbero cancellati con l'account e quali bloccano la cancellazione.
export async function accountDeletionPreview(email: string): Promise<{ alone: string[]; blocked: string[] }> {
  const memberships = await db.workspaceMember.findMany({ where: { email, status: "active" }, include: { organization: { select: { name: true } } } });
  const alone: string[] = [];
  const blocked: string[] = [];
  for (const m of memberships) {
    const [others, otherOwners] = await Promise.all([
      db.workspaceMember.count({ where: { organizationId: m.organizationId, status: "active", email: { not: email } } }),
      db.workspaceMember.count({ where: { organizationId: m.organizationId, status: "active", role: "OWNER", email: { not: email } } }),
    ]);
    if (others === 0) alone.push(m.organization.name);
    else if (m.role === "OWNER" && otherOwners === 0) blocked.push(m.organization.name);
  }
  return { alone, blocked };
}

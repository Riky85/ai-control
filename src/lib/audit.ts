import { headers } from "next/headers";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";

/**
 * Scrive una riga nel registro di audit. Non deve mai far fallire l'azione
 * che la chiama: in caso di errore lo registra nei log del server e basta.
 */
export async function audit(action: string, target?: string, meta?: Record<string, unknown>, override?: { orgId?: string | null; actorEmail?: string | null }) {
  try {
    const s = currentSession();
    let ip: string | null = null;
    try {
      ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    } catch {
      // fuori da una richiesta (es. webhook): nessun IP
    }
    await db.auditLog.create({
      data: {
        organizationId: override?.orgId !== undefined ? override.orgId : s?.orgId ?? null,
        actorEmail: override?.actorEmail !== undefined ? override.actorEmail : s?.email ?? null,
        action,
        target: target ?? null,
        meta: (meta as any) ?? undefined,
        ip,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write", action, err);
  }
}

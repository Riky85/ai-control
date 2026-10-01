"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { startEmailHistory, turnOffEmailHistory } from "./email-history";

/**
 * Interruttore dello storico email di Microsoft 365 / Google Workspace (solo admin).
 * Spento: niente più letture e via i segnali email salvati. Acceso: parte subito una scansione.
 */
export async function setEmailHistoryAction(formData: FormData) {
  const s = await requireRole("ADMIN", "/sources");
  const provider = String(formData.get("provider"));
  if (provider !== "MICROSOFT_365" && provider !== "GOOGLE_WORKSPACE") return;
  const on = formData.get("on") === "on";
  if (on) {
    await db.connector.updateMany({ where: { organizationId: s.orgId, provider }, data: { emailScanEnabled: true } });
    startEmailHistory(s.orgId, provider);
  } else {
    await turnOffEmailHistory(s.orgId, provider);
  }
  await audit("connector.email_history", provider, { on });
  revalidatePath("/sources");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function markAllAlertsReadAction() {
  const s = await requireRole("VIEWER", "/alerts");
  await db.alert.updateMany({ where: { organizationId: s.orgId, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

/** Apre l'avviso: lo segna come letto e porta alla pagina collegata. */
export async function openAlertAction(formData: FormData) {
  const s = await requireRole("VIEWER", "/alerts");
  const id = String(formData.get("id") ?? "");
  const a = await db.alert.findFirst({ where: { id, organizationId: s.orgId } });
  if (!a) redirect("/alerts");
  if (!a!.readAt) await db.alert.update({ where: { id: a!.id }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
  redirect(a!.href || "/alerts");
}

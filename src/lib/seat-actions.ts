"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { sendSeatReminders } from "@/lib/seats";
import { audit } from "@/lib/audit";

/** Chiede a tutte le persone inattive, su tutte le AI con posti noti. */
export async function askAllInactiveAction() {
  const s = await requireRole("EDITOR", "/usage?view=cleanup");
  const assets = await db.aiAsset.findMany({ where: { organizationId: s.orgId, deletedAt: null, status: { not: "UNAPPROVED" }, usages: { some: {} } }, select: { id: true } });
  let sent = 0;
  let asked = 0;
  let reason = "";
  for (const a of assets) {
    const r = await sendSeatReminders(s.orgId, a.id, s.email);
    sent += r.sent;
    asked += r.asked;
    if (r.reason) reason = r.reason;
  }
  await audit("seats.remind_all", `${sent} emails`, { asked, sent });
  redirect(`/usage?view=cleanup&${sent ? `asked=${sent}` : `error=${encodeURIComponent(reason || "Nobody to ask right now.")}`}`);
}

/** Posto tolto nel pannello del fornitore: si segna e si abbassano posti e costo stimato. */
export async function markSeatRemovedAction(formData: FormData) {
  const s = await requireRole("EDITOR", "/usage?view=cleanup");
  const id = String(formData.get("id") ?? "");
  const r = await db.seatReminder.findFirst({ where: { id, organizationId: s.orgId, removedAt: null } });
  if (!r) redirect("/usage?view=cleanup");
  await db.seatReminder.update({ where: { id: r!.id }, data: { removedAt: new Date() } });
  const cost = await db.aiSystemCost.findUnique({ where: { aiAssetId: r!.aiAssetId } });
  if (cost?.seats && cost.seats > 1) {
    const perSeat = cost.monthlyCostEstimate != null ? cost.monthlyCostEstimate / cost.seats : null;
    await db.aiSystemCost.update({
      where: { aiAssetId: r!.aiAssetId },
      data: { seats: cost.seats - 1, ...(perSeat != null ? { monthlyCostEstimate: Math.round((cost.monthlyCostEstimate! - perSeat) * 100) / 100 } : {}) },
    });
  }
  await audit("seats.removed", r!.email, { assetId: r!.aiAssetId });
  revalidatePath("/", "layout");
  redirect("/usage?view=cleanup");
}

/** Risposta della persona dal link nell'email (pagina pubblica /seat/[token]). */
export async function respondSeatAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const response = String(formData.get("response") ?? "");
  if (!["keep", "release"].includes(response)) redirect(`/seat/${encodeURIComponent(token)}`);
  const r = await db.seatReminder.findUnique({ where: { token } });
  if (!r) redirect(`/seat/${encodeURIComponent(token)}`);
  await db.seatReminder.update({ where: { id: r!.id }, data: { response, respondedAt: new Date() } });
  redirect(`/seat/${encodeURIComponent(token)}?done=${response}`);
}

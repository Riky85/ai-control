"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { computeSavings } from "@/lib/savings";
import { ledgerKindOf, ledgerAssetOf } from "@/lib/savings-ledger";

const back = (path: string, params: Record<string, string>) => {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${new URLSearchParams(params).toString()}`;
};

// ── Registro dei risparmi ──────────────────────────────────────────────────

/** "Accept" (o "Mark done" direttamente) su un suggerimento: titolo e importo si ricalcolano qui, mai dal form. */
export async function acceptSavingAction(formData: FormData) {
  const s = await requireRole("EDITOR", "/opportunities");
  const key = String(formData.get("key") ?? "").slice(0, 500);
  const done = formData.get("done") === "1";
  const { items } = await computeSavings(s.orgId);
  const item = items.find((i) => i.key === key);
  if (!item) redirect(back("/opportunities", { error: "That suggestion isn't there any more — it may have changed with new data." }));
  const existing = await db.savingAction.findFirst({ where: { organizationId: s.orgId, savingKey: key, status: { not: "failed" } } });
  if (!existing) {
    const now = new Date();
    await db.savingAction.create({
      data: {
        organizationId: s.orgId,
        assetId: ledgerAssetOf(item!),
        kind: ledgerKindOf(item!.kind),
        title: item!.title.slice(0, 200),
        expectedMonthlyEur: Math.round(item!.monthlyEur * 100) / 100,
        status: done ? "done" : "accepted",
        savingKey: key,
        acceptedAt: now,
        doneAt: done ? now : null,
        createdBy: s.email,
      },
    });
    await audit(done ? "saving.done" : "saving.accepted", item!.title, { key, monthlyEur: item!.monthlyEur });
  }
  revalidatePath("/", "layout");
  redirect(done ? "/opportunities?view=progress" : "/opportunities");
}

/** Cambia lo stato di un'azione del registro: done, failed ("didn't work") o annulla. */
export async function updateSavingActionAction(formData: FormData) {
  const s = await requireRole("EDITOR", "/opportunities?view=progress");
  const id = String(formData.get("id") ?? "");
  const to = String(formData.get("to") ?? "");
  const a = await db.savingAction.findFirst({ where: { id, organizationId: s.orgId } });
  if (!a) redirect("/opportunities?view=progress");
  if (to === "done" && a!.status === "accepted") {
    await db.savingAction.update({ where: { id: a!.id }, data: { status: "done", doneAt: new Date() } });
  } else if (to === "failed" && (a!.status === "accepted" || a!.status === "done")) {
    await db.savingAction.update({ where: { id: a!.id }, data: { status: "failed", note: "Marked as not done / didn't work" } });
  } else if (to === "undo" && a!.status === "accepted") {
    await db.savingAction.delete({ where: { id: a!.id } });
  } else {
    redirect("/opportunities?view=progress");
  }
  await audit(`saving.${to}`, a!.title, { id: a!.id });
  revalidatePath("/", "layout");
  redirect("/opportunities?view=progress");
}

// ── Posti: rimozione con un clic ───────────────────────────────────────────

/** "Remove seat": solo admin, solo per persone davvero legate a quell'AI. */
export async function removeSeatAction(formData: FormData) {
  const assetId = String(formData.get("assetId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 320);
  const from = String(formData.get("back") ?? "");
  const path = from === "cleanup" ? "/usage?view=cleanup" : `/assets/${encodeURIComponent(assetId)}?tab=people`;
  const s = await requireRole("ADMIN", path);
  const [asset, known] = await Promise.all([
    db.aiAsset.findFirst({ where: { id: assetId, organizationId: s.orgId }, select: { id: true } }),
    db.seatReminder.findFirst({ where: { organizationId: s.orgId, aiAssetId: assetId, email }, select: { id: true } }),
  ]);
  const usage = asset && !known ? await db.aiAssetUsage.findFirst({ where: { aiAssetId: asset.id, user: { email: { equals: email, mode: "insensitive" } } }, select: { id: true } }) : null;
  if (!asset || !email || (!known && !usage)) redirect(back(path, { error: "That person isn't a known user of this AI." }));
  const { removeSeatNow } = await import("@/lib/seat-removal");
  const r = await removeSeatNow(s.orgId, asset!.id, email, s.email);
  revalidatePath("/", "layout");
  // Nella pulizia posti la riga passa a "Removed"; nella scheda People si mostra il messaggio.
  if (r.ok && from === "cleanup") redirect(path);
  redirect(back(path, r.ok ? { removed: r.message } : { error: r.message }));
}

/** Rimozione automatica dei posti liberati (impostazione dell'azienda). */
export async function setAutoRemoveSeatsAction(formData: FormData) {
  const assetId = String(formData.get("assetId") ?? "");
  const path = assetId ? `/assets/${encodeURIComponent(assetId)}?tab=people` : "/usage?view=cleanup";
  const s = await requireRole("ADMIN", path);
  const on = formData.get("on") === "1";
  await db.organization.update({ where: { id: s.orgId }, data: { autoRemoveSeats: on } });
  await audit("seats.auto_remove", on ? "on" : "off");
  revalidatePath("/", "layout");
  redirect(path);
}

// ── Contratti ──────────────────────────────────────────────────────────────

const dateOf = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};
const textOf = (v: FormDataEntryValue | null, max = 120) => {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
};

export async function saveContractAction(formData: FormData) {
  const assetId = String(formData.get("assetId") ?? "");
  const path = `/assets/${encodeURIComponent(assetId)}`;
  const s = await requireRole("EDITOR", path);
  const asset = await db.aiAsset.findFirst({ where: { id: assetId, organizationId: s.orgId }, select: { id: true, name: true } });
  if (!asset) redirect("/");

  const contractStart = dateOf(formData.get("contractStart"));
  const contractEnd = dateOf(formData.get("contractEnd"));
  const noticeRaw = String(formData.get("noticeDays") ?? "").trim();
  const noticeDays = noticeRaw === "" ? null : Math.round(Number(noticeRaw));
  const renew = String(formData.get("autoRenew") ?? "");
  const owner = textOf(formData.get("contractOwnerEmail"), 320)?.toLowerCase() ?? null;
  const url = textOf(formData.get("contractUrl"), 1000);

  const err = (m: string) => redirect(back(path, { error: m }));
  if (noticeDays != null && (!Number.isFinite(noticeDays) || noticeDays < 0 || noticeDays > 730)) err("Notice must be between 0 and 730 days.");
  if (contractStart && contractEnd && contractEnd.getTime() <= contractStart.getTime()) err("The contract must end after it starts.");
  if (owner && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner)) err("The contract owner must be an email address.");
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    } catch {
      err("The contract link must start with https://");
    }
  }

  const data = {
    contractStart,
    contractEnd,
    noticeDays,
    autoRenew: renew === "yes" ? true : renew === "no" ? false : null,
    poNumber: textOf(formData.get("poNumber"), 80),
    costCenter: textOf(formData.get("costCenter"), 80),
    contractOwnerEmail: owner,
    contractUrl: url,
  };
  await db.aiSystemCost.upsert({ where: { aiAssetId: asset!.id }, update: data, create: { aiAssetId: asset!.id, ...data } });
  await audit("contract.update", asset!.name, { assetId: asset!.id, contractEnd: contractEnd?.toISOString().slice(0, 10) ?? null, noticeDays });
  revalidatePath("/", "layout");
  redirect(back(path, { saved: "contract" }));
}

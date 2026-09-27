import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/alerts";

const DAY = 86400000;

/**
 * Chiede a chi non usa un'AI da 30 giorni se il posto serve ancora. Ogni
 * persona riceve un link personale (tengo / libera); senza risposta in 7
 * giorni il posto finisce tra quelli "da togliere". Non si richiede di nuovo
 * alla stessa persona per 30 giorni.
 */
export async function sendSeatReminders(organizationId: string, assetId: string, askedBy: string) {
  const { sendEmail, emailEnabled } = await import("@/lib/mail");
  const asset = await db.aiAsset.findFirst({
    where: { id: assetId, organizationId, deletedAt: null },
    include: { usages: { include: { user: true } } },
  });
  if (!asset) return { asked: 0, sent: 0, reason: "Not found" };
  const cutoff = Date.now() - 30 * DAY;
  const inactive = asset.usages.filter((u) => u.user?.email && (!u.lastSeenAt || u.lastSeenAt.getTime() < cutoff)).map((u) => u.user!.email.toLowerCase());
  if (!inactive.length) return { asked: 0, sent: 0, reason: "Everyone known has used it in the last 30 days." };
  if (!emailEnabled()) return { asked: inactive.length, sent: 0, reason: "Email isn't configured on this deployment." };

  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  let sent = 0;
  for (const email of inactive) {
    const prev = await db.seatReminder.findUnique({ where: { aiAssetId_email: { aiAssetId: asset.id, email } } });
    if (prev && !prev.removedAt && Date.now() - prev.sentAt.getTime() < 30 * DAY) continue; // già chiesto di recente
    const token = randomBytes(18).toString("base64url");
    await db.seatReminder.upsert({
      where: { aiAssetId_email: { aiAssetId: asset.id, email } },
      create: { organizationId, aiAssetId: asset.id, email, token },
      update: { token, sentAt: new Date(), respondedAt: null, response: null, removedAt: null },
    });
    const link = `${appUrl()}/seat/${token}`;
    const r = await sendEmail({
      to: email,
      subject: `Do you still need your ${asset.name} seat?`,
      text: `Hi,\n\n${org?.name ?? "Your company"} pays for a ${asset.name} seat for you, but it hasn't been used in the last 30 days.\n\nOne click to answer:\n${link}\n\nIf we don't hear back within 7 days, the seat will be freed so the company stops paying for it. You can always ask for it again.\n\nQuestions? Reply to ${askedBy}.\n\nThanks!`,
    });
    if (r.sent) sent++;
  }
  return { asked: inactive.length, sent, reason: sent ? undefined : "Everyone was already asked in the last 30 days." };
}

export type CleanupRow = {
  id: string;
  assetId: string;
  assetName: string;
  vendor: string | null;
  email: string;
  sentAt: Date;
  state: "waiting" | "keep" | "release" | "no_reply" | "removed";
  perSeatEur: number | null;
};

/** Stato di tutte le richieste, per la pagina di pulizia posti. */
export async function cleanupRows(organizationId: string): Promise<CleanupRow[]> {
  const rows = await db.seatReminder.findMany({ where: { organizationId }, orderBy: { sentAt: "desc" }, take: 500 });
  const assets = await db.aiAsset.findMany({ where: { organizationId, id: { in: [...new Set(rows.map((r) => r.aiAssetId))] } }, include: { cost: true } });
  const byId = new Map(assets.map((a) => [a.id, a]));
  return rows
    .filter((r) => byId.has(r.aiAssetId))
    .map((r) => {
      const a = byId.get(r.aiAssetId)!;
      const seats = a.cost?.seats ?? null;
      const monthly = a.cost?.monthlyCostEstimate ?? null;
      const state: CleanupRow["state"] = r.removedAt ? "removed" : r.response === "keep" ? "keep" : r.response === "release" ? "release" : Date.now() - r.sentAt.getTime() > 7 * DAY ? "no_reply" : "waiting";
      return { id: r.id, assetId: a.id, assetName: a.name, vendor: a.vendor, email: r.email, sentAt: r.sentAt, state, perSeatEur: seats && monthly ? monthly / seats : null };
    });
}

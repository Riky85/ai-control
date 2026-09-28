import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/alerts";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";
import { isPseudonym } from "@/lib/discovery/pseudonym";

const DAY = 86400000;

/**
 * Posti attivi: UNA sola definizione per tutta la piattaforma (Usage, risparmi,
 * avvisi di rinnovo): persone con AiAssetUsage.lastSeenAt negli ultimi 30 giorni.
 */
export const SEAT_WINDOW_DAYS = 30;

type UsageLike = { lastSeenAt: Date | null };

/** Posti attivi da righe d'uso già caricate. */
export function countActive(usages: readonly UsageLike[], windowDays = SEAT_WINDOW_DAYS, now = Date.now()): number {
  const cutoff = now - windowDays * DAY;
  return usages.filter((u) => u.lastSeenAt && u.lastSeenAt.getTime() >= cutoff).length;
}

/** Posti pagati non usati: solo se si sa chi la usa (almeno una persona nota). */
export function idleSeats(seats: number | null | undefined, active: number, known: number): number {
  return seats && known > 0 ? Math.max(0, seats - active) : 0;
}

/** Posti attivi di un'AI (id → count nel database; oggetto con usages → conteggio in memoria). */
export async function activeSeats(asset: string | { usages: readonly UsageLike[] }, windowDays = SEAT_WINDOW_DAYS): Promise<number> {
  if (typeof asset !== "string") return countActive(asset.usages, windowDays);
  return db.aiAssetUsage.count({ where: { aiAssetId: asset, lastSeenAt: { gte: new Date(Date.now() - windowDays * DAY) } } });
}

/** Per più AI in una volta, aggregato in SQL: persone note e attive per AI. */
export async function seatStats(assetIds: string[], windowDays = SEAT_WINDOW_DAYS): Promise<Map<string, { active: number; known: number }>> {
  const out = new Map<string, { active: number; known: number }>();
  if (!assetIds.length) return out;
  const [known, active] = await Promise.all([
    db.aiAssetUsage.groupBy({ by: ["aiAssetId"], where: { aiAssetId: { in: assetIds } }, _count: { _all: true } }),
    db.aiAssetUsage.groupBy({ by: ["aiAssetId"], where: { aiAssetId: { in: assetIds }, lastSeenAt: { gte: new Date(Date.now() - windowDays * DAY) } }, _count: { _all: true } }),
  ]);
  for (const k of known) out.set(k.aiAssetId, { known: k._count._all, active: 0 });
  for (const a of active) out.set(a.aiAssetId, { known: out.get(a.aiAssetId)?.known ?? a._count._all, active: a._count._all });
  return out;
}

/**
 * Chiede a chi non usa un'AI da 30 giorni se il posto serve ancora. Ogni
 * persona riceve un link personale (tengo / libera); senza risposta in 7
 * giorni il posto finisce tra quelli "da togliere". Non si richiede di nuovo
 * alla stessa persona per 30 giorni.
 */
export async function sendSeatReminders(organizationId: string, assetId: string, askedBy: string) {
  // Privacy per reparto / solo totali: niente promemoria per persona.
  if (!showsPeople(await orgPrivacyMode(organizationId))) {
    return { asked: 0, sent: 0, reason: "Seat reminders are off: employee privacy isn't set to per person (Settings → Employee privacy)." };
  }
  const { sendEmail, emailEnabled } = await import("@/lib/mail");
  const asset = await db.aiAsset.findFirst({
    where: { id: assetId, organizationId, deletedAt: null },
    include: { usages: { include: { user: true } } },
  });
  if (!asset) return { asked: 0, sent: 0, reason: "Not found" };
  const cutoff = Date.now() - SEAT_WINDOW_DAYS * DAY;
  // Uno pseudonimo (dati raccolti con un'altra modalità privacy) non è un indirizzo email.
  const inactive = asset.usages
    .filter((u) => u.user?.email && !isPseudonym(u.user.email) && (!u.lastSeenAt || u.lastSeenAt.getTime() < cutoff))
    .map((u) => u.user!.email.toLowerCase());
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
    void import("@/lib/chat-actions").then((m) => m.sendSeatCheckDm({ token, email, assetName: asset.name, orgName: org?.name ?? "Your company" })).catch(() => {}); // Slack DM (se c'è il bot)
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

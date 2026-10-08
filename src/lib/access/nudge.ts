/**
 * "Nudge users": email breve e cortese a chi usa ancora un'AI non consentita (UNAPPROVED),
 * con l'alternativa approvata se l'azienda l'ha indicata (AiAsset.insteadAssetId, la stessa che
 * angar Edge suggerisce quando blocca). Al massimo una volta ogni 7 giorni per AI.
 * Destinatari: uso/attività (AiAssetUsage) e consensi OAuth (OAuthGrant.userRefs).
 */
import { db } from "@/lib/db";
import { sendEmail, emailEnabled } from "@/lib/mail";
import { appUrl } from "@/lib/alerts";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";
import { isPseudonym } from "@/lib/discovery/pseudonym";

const DAY = 86400000;
export const NUDGE_EVERY_DAYS = 7;
const MAX_RECIPIENTS = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Prossima data possibile (null = adesso). */
export const nextNudgeAt = (nudgedAt: Date | null | undefined) => (nudgedAt && Date.now() - nudgedAt.getTime() < NUDGE_EVERY_DAYS * DAY ? new Date(nudgedAt.getTime() + NUDGE_EVERY_DAYS * DAY) : null);

/** Email delle persone che risultano usare l'AI (uso negli ultimi 90 giorni o consenso OAuth attivo). */
export async function nudgeRecipients(organizationId: string, assetId: string): Promise<string[]> {
  const since = new Date(Date.now() - 90 * DAY);
  const [usages, grants] = await Promise.all([
    db.aiAssetUsage.findMany({
      where: { aiAssetId: assetId, aiAsset: { organizationId }, OR: [{ lastSeenAt: null }, { lastSeenAt: { gte: since } }] },
      select: { user: { select: { email: true } } },
      take: 2000,
    }),
    db.oAuthGrant.findMany({ where: { organizationId, aiAssetId: assetId }, select: { userRefs: true } }),
  ]);
  const all = [...usages.map((u) => u.user?.email ?? ""), ...grants.flatMap((g) => g.userRefs)].map((e) => e.trim().toLowerCase());
  return Array.from(new Set(all.filter((e) => e && !isPseudonym(e) && EMAIL_RE.test(e)))).slice(0, MAX_RECIPIENTS);
}

export type NudgeResult = { ok: true; sent: number; asked: number; name: string } | { ok: false; error: string };

export async function nudgeUsers(organizationId: string, assetId: string): Promise<NudgeResult> {
  const asset = await db.aiAsset.findFirst({ where: { id: assetId, organizationId, deletedAt: null }, select: { id: true, name: true, status: true, nudgedAt: true, insteadAssetId: true } });
  if (!asset) return { ok: false, error: "That AI system isn't there any more." };
  if (asset.status !== "UNAPPROVED") return { ok: false, error: `${asset.name} isn't marked Not allowed.` };
  if (!showsPeople(await orgPrivacyMode(organizationId))) return { ok: false, error: "Nudges need the by-person employee privacy mode (Settings → Employee privacy)." };
  if (!emailEnabled()) return { ok: false, error: "Email isn't set up on this deployment." };
  const next = nextNudgeAt(asset.nudgedAt);
  if (next) return { ok: false, error: `Already nudged in the last ${NUDGE_EVERY_DAYS} days — you can nudge again on ${next.toISOString().slice(0, 10)}.` };
  const to = await nudgeRecipients(organizationId, asset.id);
  if (!to.length) return { ok: false, error: `Nobody known uses ${asset.name} right now.` };

  // Presa in carico atomica: due clic (o due amministratori) non mandano due giri di email.
  const cutoff = new Date(Date.now() - NUDGE_EVERY_DAYS * DAY);
  const claimed = await db.aiAsset.updateMany({
    where: { id: asset.id, organizationId, OR: [{ nudgedAt: null }, { nudgedAt: { lt: cutoff } }] },
    data: { nudgedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false, error: `Already nudged in the last ${NUDGE_EVERY_DAYS} days.` };

  const [org, instead] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    asset.insteadAssetId ? db.aiAsset.findFirst({ where: { id: asset.insteadAssetId, organizationId, deletedAt: null, status: "APPROVED" }, select: { name: true } }) : null,
  ]);
  const company = org?.name ?? "your company";
  const alt = instead ? `\n\nThe approved option is ${instead.name} — please use it instead. If it doesn't cover what you need, ask for a new AI system here: ${appUrl()}/estate/requests/new` : `\n\nIf you need an AI tool for your work, you can ask for one here: ${appUrl()}/estate/requests/new`;
  let sent = 0;
  for (const email of to) {
    const r = await sendEmail({
      to: email,
      subject: `About your use of ${asset.name}`,
      text: `Hello,\n\n${company} hasn't approved ${asset.name} for work use, and it looks like you've used it recently. To keep company and customer data safe, please stop using it for work.${alt}\n\nThanks for your help — and no worries if you'd already stopped.\n`,
    }).catch(() => ({ sent: false }));
    if (r.sent) sent++;
  }
  // Nessuna email partita: la finestra di 7 giorni si libera.
  if (sent === 0) await db.aiAsset.updateMany({ where: { id: asset.id, organizationId }, data: { nudgedAt: asset.nudgedAt } });
  if (sent === 0) return { ok: false, error: "No email could be sent — check the email settings." };
  return { ok: true, sent, asked: to.length, name: asset.name };
}

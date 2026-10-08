/**
 * Togliere un posto con un clic, agganciato alla pulizia posti: la persona
 * risponde "non mi serve" (o non risponde in 7 giorni) → l'amministratore
 * clicca "Remove seat" (o angar lo fa da solo, se l'azienda lo ha scelto) →
 * il posto sparisce dal fornitore, il costo scende e il registro dei
 * risparmi si aggiorna. Solo con la privacy "per persona".
 */
import * as React from "react";
import { randomBytes } from "crypto";
import type { ConnectorProvider } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createAlert } from "@/lib/alerts";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";
import { MANAGE_URL } from "@/lib/pricing/catalog";
import { serviceOf } from "@/lib/savings";
import { recordSeatRemoval } from "@/lib/savings-ledger";
import { removeCopilotSeat, removeGeminiSeat, removeOpenAiUser, removeAnthropicUser, type RemovalOutcome } from "./providers";

const DAY = 86400000;
// cache() di React esiste solo nel livello server dei componenti: fuori (lavori pianificati) è un passaggio diretto.
const cache: <F extends (...args: any[]) => any>(fn: F) => F = (React as { cache?: <F>(fn: F) => F }).cache ?? ((fn) => fn);

export type SeatRemovalSupport =
  | { mode: "api"; provider: ConnectorProvider; label: string }
  | { mode: "manual"; url: string | null };

const API_LABEL: Partial<Record<ConnectorProvider, string>> = {
  MICROSOFT_365: "Microsoft 365",
  GOOGLE_WORKSPACE: "Google Workspace",
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
};

const connectedProviders = cache(async (organizationId: string) => {
  const rows = await db.connector.findMany({
    where: { organizationId, provider: { in: ["MICROSOFT_365", "GOOGLE_WORKSPACE", "OPENAI", "ANTHROPIC"] }, credentialsEncrypted: { not: null } },
    select: { provider: true },
  });
  return new Set(rows.map((r) => r.provider));
});

/** Quale fornitore toglie il posto per questa AI (il collegamento serve già attivo). */
export function supportOf(
  asset: { serviceId: string | null; name: string; vendor: string | null; connector?: { provider: ConnectorProvider } | null },
  connected: Set<ConnectorProvider>,
): SeatRemovalSupport {
  const service = serviceOf(asset);
  const api = (p: ConnectorProvider): SeatRemovalSupport => ({ mode: "api", provider: p, label: API_LABEL[p] ?? p });
  const via = asset.connector?.provider;
  // Utenti letti dall'organizzazione OpenAI / Anthropic: si tolgono dalla stessa organizzazione.
  if ((via === "OPENAI" || via === "ANTHROPIC") && connected.has(via)) return api(via);
  if (service === "copilot" && connected.has("MICROSOFT_365")) return api("MICROSOFT_365");
  if (service === "gemini" && connected.has("GOOGLE_WORKSPACE")) return api("GOOGLE_WORKSPACE");
  return { mode: "manual", url: service ? MANAGE_URL[service] ?? null : null };
}

/** Per le pagine: supporto di un'AI, con cache per richiesta. */
export const seatRemovalSupport = cache(async (organizationId: string, assetId: string): Promise<SeatRemovalSupport | null> => {
  const asset = await db.aiAsset.findFirst({ where: { id: assetId, organizationId }, select: { serviceId: true, name: true, vendor: true, connector: { select: { provider: true } } } });
  if (!asset) return null;
  return supportOf(asset, await connectedProviders(organizationId));
});

/** Toglie il posto dal fornitore. Non tocca il database di angar. */
export async function removeSeat(organizationId: string, assetId: string, email: string): Promise<RemovalOutcome & { support?: SeatRemovalSupport }> {
  const asset = await db.aiAsset.findFirst({ where: { id: assetId, organizationId }, select: { serviceId: true, name: true, vendor: true, connector: { select: { provider: true } } } });
  if (!asset) return { ok: false, error: "Not found" };
  const support = supportOf(asset, await connectedProviders(organizationId));
  if (support.mode !== "api") return { ok: false, error: `angar can't remove ${asset.name} seats automatically — remove it in the provider's admin page, then mark it removed.`, support };
  const row = await db.connector.findUnique({ where: { organizationId_provider: { organizationId, provider: support.provider } }, select: { credentialsEncrypted: true } });
  const who = email.trim().toLowerCase();
  try {
    const run = { MICROSOFT_365: removeCopilotSeat, GOOGLE_WORKSPACE: removeGeminiSeat, OPENAI: removeOpenAiUser, ANTHROPIC: removeAnthropicUser }[support.provider as "MICROSOFT_365"];
    return { ...(await run(row?.credentialsEncrypted ?? null, who)), support };
  } catch (err) {
    return { ok: false, error: `${support.label}: ${(err as Error).message.slice(0, 200)}`, support };
  }
}

/**
 * Posto tolto (via API o a mano): segna il promemoria, abbassa posti e costo
 * stimato, scrive il registro dei risparmi e l'audit. Idempotente.
 */
export async function completeSeatRemoval(
  organizationId: string,
  target: { reminderId?: string; assetId?: string; email?: string },
  actor: { email: string | null; via: "api" | "manual" },
): Promise<boolean> {
  let r = target.reminderId
    ? await db.seatReminder.findFirst({ where: { id: target.reminderId, organizationId } })
    : target.assetId && target.email
      ? await db.seatReminder.findUnique({ where: { aiAssetId_email: { aiAssetId: target.assetId, email: target.email.toLowerCase() } } })
      : null;
  if (r && r.organizationId !== organizationId) return false;
  if (!r && target.assetId && target.email) {
    // Tolto dalla scheda People senza richiesta via email: si crea la riga per la pulizia posti.
    const asset = await db.aiAsset.findFirst({ where: { id: target.assetId, organizationId }, select: { id: true } });
    if (!asset) return false;
    r = await db.seatReminder.create({ data: { organizationId, aiAssetId: asset.id, email: target.email.toLowerCase(), token: randomBytes(18).toString("base64url"), respondedAt: null } }).catch(() => null);
  }
  if (!r) return false;
  const now = new Date();
  const claimed = await db.seatReminder.updateMany({ where: { id: r.id, organizationId, removedAt: null }, data: { removedAt: now } });
  if (claimed.count === 0) return false; // già tolto

  const [asset, cost] = await Promise.all([
    db.aiAsset.findFirst({ where: { id: r.aiAssetId, organizationId }, select: { name: true } }),
    db.aiSystemCost.findUnique({ where: { aiAssetId: r.aiAssetId } }),
  ]);
  const perSeat = cost?.seats && cost.monthlyCostEstimate != null ? cost.monthlyCostEstimate / cost.seats : null;
  if (cost?.seats && cost.seats > 1) {
    await db.aiSystemCost.update({
      where: { aiAssetId: r.aiAssetId },
      data: { seats: cost.seats - 1, ...(perSeat != null ? { monthlyCostEstimate: Math.round((cost.monthlyCostEstimate! - perSeat) * 100) / 100 } : {}) },
    });
  }
  await recordSeatRemoval(organizationId, { seatReminderId: r.id, assetId: r.aiAssetId, assetName: asset?.name ?? "AI", perSeatEur: perSeat, createdBy: actor.email ?? "angar (automatic)", via: actor.via });
  await audit(actor.via === "api" ? "seats.removed_api" : "seats.removed", r.email, { assetId: r.aiAssetId, perSeatEur: perSeat }, { orgId: organizationId, actorEmail: actor.email ?? "angar (automatic)" });
  return true;
}

/** Clic "Remove seat": API del fornitore, poi pulizia in angar. */
export async function removeSeatNow(organizationId: string, assetId: string, email: string, actorEmail: string): Promise<{ ok: boolean; message: string }> {
  if (!showsPeople(await orgPrivacyMode(organizationId))) return { ok: false, message: "Seat removal needs the per-person employee privacy (Settings → Employee privacy)." };
  const res = await removeSeat(organizationId, assetId, email);
  if (!res.ok) {
    await audit("seats.remove_failed", email, { assetId, error: res.error.slice(0, 300) }, { orgId: organizationId, actorEmail });
    return { ok: false, message: res.error };
  }
  await completeSeatRemoval(organizationId, { assetId, email }, { email: actorEmail, via: "api" });
  return { ok: true, message: res.detail };
}

/**
 * Lavoro giornaliero (se l'azienda ha scelto la rimozione automatica): toglie
 * i posti di chi ha risposto "non mi serve" o non ha risposto in 7 giorni,
 * solo sulle AI che angar sa togliere via API. Gli altri restano "da togliere".
 */
export async function autoRemoveSeats(organizationId: string) {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { autoRemoveSeats: true } });
  if (!org?.autoRemoveSeats) return 0;
  if (!showsPeople(await orgPrivacyMode(organizationId))) return 0;
  const due = await db.seatReminder.findMany({
    where: {
      organizationId,
      removedAt: null,
      OR: [{ response: "release" }, { respondedAt: null, sentAt: { lt: new Date(Date.now() - 7 * DAY) } }],
    },
    take: 200,
  });
  let n = 0;
  for (const r of due) {
    const support = await seatRemovalSupport(organizationId, r.aiAssetId);
    if (support?.mode !== "api") continue;
    const res = await removeSeat(organizationId, r.aiAssetId, r.email);
    if (res.ok) {
      if (await completeSeatRemoval(organizationId, { reminderId: r.id }, { email: null, via: "api" })) n++;
    } else {
      await audit("seats.remove_failed", r.email, { assetId: r.aiAssetId, error: res.error.slice(0, 300), automatic: true }, { orgId: organizationId, actorEmail: "angar (automatic)" });
      await createAlert(organizationId, {
        kind: "seats",
        severity: "warning",
        title: `Couldn't remove a ${support.label} seat automatically`,
        body: res.error,
        href: "/usage?view=cleanup",
        dedupeKey: `seat-autoremove-failed:${r.aiAssetId}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
  }
  if (n > 0) {
    await createAlert(organizationId, {
      kind: "seats",
      severity: "info",
      title: `angar removed ${n} unused seat${n === 1 ? "" : "s"}`,
      body: "People said they don't need them, or didn't answer in 7 days. See the Seat clean-up and Savings pages.",
      href: "/opportunities?view=progress",
      dedupeKey: `seat-autoremoved:${organizationId}:${new Date().toISOString().slice(0, 10)}`,
    });
  }
  return n;
}

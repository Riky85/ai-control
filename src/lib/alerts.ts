import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";

export type AlertKind = "renewal" | "budget" | "policy" | "seats" | "new_ai" | "info";
export type AlertSeverity = "info" | "warning" | "critical";

/**
 * Crea un avviso (campanella) una sola volta per dedupeKey e, se l'azienda
 * ha collegato Slack/Teams, lo inoltra anche lì. Restituisce true se è nuovo.
 */
export async function createAlert(
  organizationId: string,
  a: { kind: AlertKind; severity?: AlertSeverity; title: string; body: string; href?: string; dedupeKey: string }
): Promise<boolean> {
  try {
    await db.alert.create({
      data: { organizationId, kind: a.kind, severity: a.severity ?? "info", title: a.title.slice(0, 200), body: a.body.slice(0, 1000), href: a.href ?? null, dedupeKey: a.dedupeKey.slice(0, 300) },
    });
  } catch {
    return false; // già esiste (vincolo unico organizationId + dedupeKey)
  }
  if (a.severity === "warning" || a.severity === "critical") {
    await postToChat(organizationId, `*${a.title}*\n${a.body}${a.href ? `\n${appUrl()}${a.href}` : ""}`).catch(() => {});
  }
  return true;
}

export function appUrl() {
  return (process.env.APP_URL ?? "https://ai-control-production.up.railway.app").replace(/\/$/, "");
}

/** Slack o Microsoft Teams (incoming webhook): stesso formato testo semplice. */
export async function postToChat(organizationId: string, text: string): Promise<boolean> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { chatWebhookEncrypted: true } });
  const url = decryptJson<{ url: string }>(org?.chatWebhookEncrypted)?.url;
  if (!url) return false;
  // Slack accetta {text}; Teams (workflow/incoming webhook) accetta {text} per i messaggi semplici.
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  return r.ok;
}

export async function unreadAlertCount(organizationId: string) {
  return db.alert.count({ where: { organizationId, readAt: null } });
}

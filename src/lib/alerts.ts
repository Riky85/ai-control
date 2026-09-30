import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { emitWebhook } from "@/lib/webhooks";

export type AlertKind = "renewal" | "budget" | "policy" | "seats" | "new_ai" | "anomaly" | "autopilot" | "info" | "secret";
export type AlertSeverity = "info" | "warning" | "critical";
/** Tipi di avviso che aprono un ticket (vedi ticketing.ts, TICKET_KINDS). */
const TICKET_ALERT_KINDS: string[] = ["policy", "anomaly", "secret"];

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
  // Webhook in uscita (spara e dimentica, mai bloccante).
  const evt = { kind: a.kind, severity: a.severity ?? "info", title: a.title, body: a.body, url: a.href ? `${appUrl()}${a.href}` : null };
  emitWebhook(organizationId, "alert.created", evt);
  if (a.kind === "renewal") emitWebhook(organizationId, "renewal.upcoming", evt);
  if (a.severity === "warning" || a.severity === "critical") {
    await postToChat(organizationId, `*${a.title}*\n${a.body}${a.href ? `\n${appUrl()}${a.href}` : ""}`).catch(() => {});
    // Ticket in Jira / ServiceNow per gli avvisi importanti (policy, anomalie, chiavi):
    // spara e dimentica, mai bloccante; no-op se non collegati. Uno per avviso (avviso nuovo = dedupeKey nuova).
    if (TICKET_ALERT_KINDS.includes(a.kind)) {
      const ticket = { kind: a.kind, severity: a.severity, title: a.title, body: a.body, url: evt.url, dedupeKey: a.dedupeKey.slice(0, 300) };
      void import("@/lib/ticketing").then((m) => m.ticketForAlert(organizationId, ticket)).catch(() => {});
    }
  }
  return true;
}

export function appUrl() {
  return (process.env.APP_URL ?? "https://ai-control-production.up.railway.app").replace(/\/$/, "");
}

/**
 * Slack o Microsoft Teams (incoming webhook): testo semplice, oppure — se
 * passato — un messaggio ricco: blocchi Block Kit per Slack, Adaptive Card per
 * Teams (vedi chat-actions.ts). Il testo resta sempre come ripiego.
 */
export async function postToChat(organizationId: string, text: string, rich?: { slack?: unknown[]; teams?: unknown }): Promise<boolean> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { chatWebhookEncrypted: true } });
  const url = decryptJson<{ url: string }>(org?.chatWebhookEncrypted)?.url;
  if (!url) return false;
  const slack = /(^|\.)hooks\.slack\.com$/.test(new URL(url).hostname);
  const payload =
    slack && rich?.slack ? { text, blocks: rich.slack }
    : !slack && rich?.teams ? { type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null, content: rich.teams }] }
    : { text }; // Slack accetta {text}; Teams (workflow/incoming webhook) accetta {text} per i messaggi semplici.
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) });
  return r.ok;
}

export async function unreadAlertCount(organizationId: string) {
  return db.alert.count({ where: { organizationId, readAt: null } });
}

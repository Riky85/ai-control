/**
 * Slack e Microsoft Teams interattivi.
 *
 * - "New AI found": messaggio con pulsanti Approve / Not allowed.
 *   · Slack con SLACK_SIGNING_SECRET: pulsanti veri (Block Kit) gestiti da
 *     POST /api/slack/interactions (firma Slack verificata, utente Slack →
 *     membro del workspace per email, ruolo EDITOR o superiore).
 *   · Slack senza app / Teams: pulsanti-link verso /api/chat-action/[token]
 *     (token firmato con SESSION_SECRET, scade in 7 giorni). Il link apre una
 *     pagina di conferma che richiede il login con il ruolo giusto: è un
 *     collegamento diretto, non un'azione anonima.
 * - "Seat check": con SLACK_BOT_TOKEN la persona inattiva riceve anche un
 *   messaggio diretto su Slack con Keep / Release (stessa logica di /seat/[token]).
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { AiAssetStatus, MemberRole } from "@prisma/client";
import { db } from "@/lib/db";
import { appUrl, postToChat } from "@/lib/alerts";
import { audit } from "@/lib/audit";
import { emitWebhook } from "@/lib/webhooks";
import { assessAssetRisk } from "@/lib/risk-engine";
import { runAssuranceChecks } from "@/lib/assurance-engine";

const DAY = 86400000;
export const CHAT_LINK_DAYS = 7;
const RANK: Record<MemberRole, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 };

export const slackInteractive = () => Boolean(process.env.SLACK_SIGNING_SECRET);
export const slackBot = () => Boolean(process.env.SLACK_BOT_TOKEN);

// ── Token firmati per i link one-click (Teams / Slack senza app / email) ─
/** Decisioni sulle AI (Slack interattivo e link). */
export type ChatAct = "approve" | "reject";
/** Tutte le azioni dei link firmati: anche "accetta un risparmio" (brief settimanale). */
export type LinkAct = ChatAct | "accept_saving";
export interface ChatActionToken {
  act: LinkAct;
  org: string;
  /** approve/reject: id dell'AI. accept_saving: riferimento corto del risparmio (savingRef). */
  asset: string;
  exp: number; // unix secondi
}
const LINK_ACTS: LinkAct[] = ["approve", "reject", "accept_saving"];

/**
 * Riferimento corto e stabile di un risparmio (le chiavi dei doppioni possono
 * essere lunghe): hash della chiave, ricalcolato al clic su computeSavings.
 */
export const savingRef = (key: string) => createHash("sha256").update(`saving:${key}`).digest("base64url").slice(0, 22);

function sessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET missing or too short");
  return s;
}
const sig = (body: string) => createHmac("sha256", sessionSecret()).update(`chat-action:${body}`).digest("base64url");

export function signChatAction(t: Omit<ChatActionToken, "exp">, days = CHAT_LINK_DAYS): string {
  const body = Buffer.from(JSON.stringify({ ...t, exp: Math.floor((Date.now() + days * DAY) / 1000) })).toString("base64url");
  return `${body}.${sig(body)}`;
}

export function verifyChatAction(token: string, now = Date.now()): ChatActionToken | null {
  const [body, s, extra] = String(token ?? "").split(".");
  if (!body || !s || extra !== undefined || token.length > 600) return null;
  try {
    const a = Buffer.from(sig(body));
    const b = Buffer.from(s);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ChatActionToken;
    if (!LINK_ACTS.includes(t.act) || typeof t.org !== "string" || typeof t.asset !== "string" || !t.asset || typeof t.exp !== "number") return null;
    return t.exp * 1000 > now ? t : null;
  } catch {
    return null;
  }
}

export const chatActionUrl = (t: Omit<ChatActionToken, "exp">) => `${appUrl()}/api/chat-action/${signChatAction(t)}`;

// ── Logica di base (senza FormData né redirect) ──────────────────────────

/** Ruolo di un membro attivo del workspace, o null. */
export async function memberRole(organizationId: string, email: string): Promise<MemberRole | null> {
  const m = await db.workspaceMember.findUnique({ where: { organizationId_email: { organizationId, email: email.toLowerCase() } } });
  return m && m.status === "active" ? m.role : null;
}
export const atLeast = (role: MemberRole | null, min: MemberRole) => !!role && RANK[role] >= RANK[min];

async function recomputeAssurance(assetId: string) {
  const full = await db.aiAsset.findUnique({
    where: { id: assetId },
    include: { connectedSystems: true, dataAccess: { include: { dataAsset: true } }, activities: { orderBy: { occurredAt: "desc" }, take: 50 } },
  });
  if (!full) return;
  const risk = assessAssetRisk(full);
  const orgHasActivePolicy = (await db.policy.count({ where: { organizationId: full.organizationId, enabled: true } })) > 0;
  const a = runAssuranceChecks(full, risk, orgHasActivePolicy);
  await db.assuranceReport.create({ data: { aiAssetId: assetId, level: a.level, score: a.score, passedCount: a.passedCount, warningCount: a.warningCount, failedCount: a.failedCount, checks: a.checks as any } });
}

/**
 * Stessa decisione della coda /review (reviewAssetAction) senza owner e costo:
 * stato, cambio registrato, assurance ricalcolata, audit. Controlla l'azienda.
 */
export async function reviewAssetCore(organizationId: string, assetId: string, act: ChatAct, actorEmail: string, via: string) {
  const asset = await db.aiAsset.findFirst({ where: { id: assetId, organizationId, deletedAt: null }, select: { id: true, name: true, status: true } });
  if (!asset) return { ok: false as const, error: "That AI isn't in this workspace any more." };
  const status: AiAssetStatus = act === "approve" ? "APPROVED" : "UNAPPROVED";
  if (asset.status !== status) {
    await db.aiAsset.update({ where: { id: asset.id }, data: { status } });
    await db.assetChange.create({ data: { aiAssetId: asset.id, field: "status", oldValue: asset.status, newValue: status } });
    await recomputeAssurance(asset.id).catch((e) => console.error("[chat-actions] assurance failed", e));
  }
  await audit("asset.review", asset.name, { decision: act, via }, { orgId: organizationId, actorEmail });
  return { ok: true as const, name: asset.name, status, changed: asset.status !== status };
}

/**
 * Stesso "Accept" della pagina Savings (acceptSavingAction): titolo e importo
 * si ricalcolano qui dal motore dei risparmi, mai dal link. Idempotente.
 */
export async function acceptSavingCore(organizationId: string, ref: string, actorEmail: string, via: string) {
  const { computeSavings } = await import("@/lib/savings");
  const { ledgerKindOf, ledgerAssetOf } = await import("@/lib/savings-ledger");
  const [{ items }, accepted] = await Promise.all([
    computeSavings(organizationId),
    db.savingAction.findMany({ where: { organizationId, savingKey: { not: null }, status: { not: "failed" } }, select: { savingKey: true, title: true } }),
  ]);
  // Già accettato (computeSavings non lo mostra più): risposta tranquilla, nessun doppione.
  const done = accepted.find((a) => a.savingKey && savingRef(a.savingKey) === ref);
  if (done) return { ok: true as const, title: done.title, changed: false };
  const item = items.find((i) => savingRef(i.key) === ref);
  if (!item) return { ok: false as const, error: "That saving isn't there any more — it may have changed with new data. Open Savings to see the current list." };
  const now = new Date();
  await db.savingAction.create({
    data: {
      organizationId,
      assetId: ledgerAssetOf(item),
      kind: ledgerKindOf(item.kind),
      title: item.title.slice(0, 200),
      expectedMonthlyEur: Math.round(item.monthlyEur * 100) / 100,
      status: "accepted",
      savingKey: item.key,
      acceptedAt: now,
      createdBy: actorEmail,
    },
  });
  await audit("saving.accepted", item.title, { key: item.key, monthlyEur: item.monthlyEur, via }, { orgId: organizationId, actorEmail });
  return { ok: true as const, title: item.title, changed: true };
}

/** Stessa risposta di /seat/[token] (respondSeatAction). */
export async function respondSeatCore(token: string, response: "keep" | "release") {
  const r = await db.seatReminder.findUnique({ where: { token } });
  if (!r) return null;
  await db.seatReminder.update({ where: { id: r.id }, data: { response, respondedAt: new Date() } });
  return r;
}

// ── Messaggi ─────────────────────────────────────────────────────────────

type NewAi = { id: string; name: string; vendor: string | null };

function slackReviewBlocks(orgId: string, assets: NewAi[]) {
  const blocks: unknown[] = [{ type: "section", text: { type: "mrkdwn", text: `*New AI found* — ${assets.length === 1 ? "decide if it's allowed" : `${assets.length} AI to review`}` } }];
  for (const a of assets) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${esc(a.name)}*${a.vendor ? ` · ${esc(a.vendor)}` : ""}\n<${appUrl()}/assets/${a.id}|Open in angar>` } });
    const button = (act: ChatAct, text: string, style: string) =>
      slackInteractive()
        ? { type: "button", action_id: `angar_review_${act}`, text: { type: "plain_text", text }, style, value: JSON.stringify({ o: orgId, a: a.id }) }
        : { type: "button", action_id: `angar_link_${act}_${a.id}`.slice(0, 250), text: { type: "plain_text", text }, style, url: chatActionUrl({ act, org: orgId, asset: a.id }) };
    blocks.push({ type: "actions", block_id: `review_${a.id}`.slice(0, 255), elements: [button("approve", "Approve", "primary"), button("reject", "Not allowed", "danger")] });
  }
  return blocks;
}

function teamsReviewCard(orgId: string, assets: NewAi[]) {
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.4",
    body: [
      { type: "TextBlock", size: "Medium", weight: "Bolder", text: "New AI found", wrap: true },
      ...assets.flatMap((a) => [
        { type: "TextBlock", text: `**${a.name}**${a.vendor ? ` · ${a.vendor}` : ""}`, wrap: true, spacing: "Medium" },
        {
          type: "ActionSet",
          actions: [
            { type: "Action.OpenUrl", title: "Approve", url: chatActionUrl({ act: "approve", org: orgId, asset: a.id }) },
            { type: "Action.OpenUrl", title: "Not allowed", url: chatActionUrl({ act: "reject", org: orgId, asset: a.id }) },
            { type: "Action.OpenUrl", title: "Open", url: `${appUrl()}/assets/${a.id}` },
          ],
        },
      ]),
      { type: "TextBlock", text: "Buttons open angar: you confirm there, signed in (editor role or higher). Links expire in 7 days.", isSubtle: true, size: "Small", wrap: true },
    ],
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Nuove AI trovate dalla scoperta automatica: webhook "ai.discovered" per
 * ognuna e un messaggio Slack/Teams con i pulsanti (max 5 per messaggio).
 * Spara e dimentica: non blocca mai chi chiama.
 */
export function notifyNewAi(organizationId: string, assets: NewAi[]): void {
  if (!assets.length) return;
  for (const a of assets.slice(0, 50)) emitWebhook(organizationId, "ai.discovered", { id: a.id, name: a.name, vendor: a.vendor, url: `${appUrl()}/assets/${a.id}` });
  const shown = assets.slice(0, 5);
  const more = assets.length - shown.length;
  const text = `New AI found: ${shown.map((a) => a.name).join(", ")}${more > 0 ? ` and ${more} more` : ""} — review: ${appUrl()}/review`;
  void postToChat(organizationId, text, { slack: slackReviewBlocks(organizationId, shown), teams: teamsReviewCard(organizationId, shown) }).catch(() => {});
}

// ── Slack Web API (bot) ──────────────────────────────────────────────────

async function slackApi<T>(method: string, body: Record<string, unknown>, form = false): Promise<T | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: form ? { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" } : { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    const j = (await r.json()) as T & { ok: boolean };
    return j.ok ? j : null;
  } catch {
    return null;
  }
}

/** Email dell'utente Slack (scope users:read.email). */
export async function slackUserEmail(userId: string): Promise<string | null> {
  if (!/^[A-Z0-9]{5,20}$/.test(userId)) return null;
  const j = await slackApi<{ user?: { profile?: { email?: string }; deleted?: boolean; is_bot?: boolean } }>("users.info", { user: userId }, true);
  const u = j?.user;
  return u && !u.deleted && !u.is_bot && u.profile?.email ? u.profile.email.toLowerCase() : null;
}

/**
 * "Seat check" in DM su Slack alla persona inattiva (se il bot è configurato e
 * trova l'utente per email). Spara e dimentica; la mail con /seat/[token] resta.
 */
export function sendSeatCheckDm(p: { token: string; email: string; assetName: string; orgName: string }): void {
  if (!slackBot() || !slackInteractive()) return;
  void (async () => {
    const u = await slackApi<{ user?: { id: string } }>("users.lookupByEmail", { email: p.email }, true);
    if (!u?.user?.id) return;
    const text = `${p.orgName} pays for a ${p.assetName} seat for you, but it hasn't been used in the last 30 days. Do you still need it?`;
    await slackApi("chat.postMessage", {
      channel: u.user.id,
      text,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*Seat check — ${esc(p.assetName)}*\n${esc(text)}` } },
        {
          type: "actions",
          block_id: "seat_check",
          elements: [
            { type: "button", action_id: "angar_seat_keep", text: { type: "plain_text", text: "Keep" }, style: "primary", value: p.token },
            { type: "button", action_id: "angar_seat_release", text: { type: "plain_text", text: "Release" }, value: p.token },
          ],
        },
        { type: "context", elements: [{ type: "mrkdwn", text: "No answer in 7 days means the seat can be freed. angar only sees which AI tools are used — never what you do in them." }] },
      ],
    });
  })().catch(() => {});
}

/** Firma v0 delle richieste Slack, con finestra di 5 minuti sul timestamp. */
export function verifySlackSignature(secret: string, ts: string | null, signature: string | null, body: string, now = Date.now()) {
  if (!ts || !signature || !/^\d{9,11}$/.test(ts)) return false;
  if (Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const expected = Buffer.from("v0=" + createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex"));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

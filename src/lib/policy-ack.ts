/**
 * Presa visione della policy AI + mini-modulo di AI literacy (AI Act art. 4).
 *
 * - La policy mostrata è composta dai dati dell'azienda: AI consentite e non
 *   consentite, policy attive (Governance → Policies) e le regole base di
 *   literacy.ts. Ogni versione diversa ha un'impronta (policyVersion) e una
 *   fotografia salvata come Evidence "ai_policy_version": chi conferma vede
 *   esattamente il testo di quella versione, anche se poi la policy cambia.
 * - Privacy "per persona": ogni persona riceve un link personale /ack/[token]
 *   (PolicyAck) e si registra chi ha confermato, con il punteggio.
 * - Privacy per reparto / solo totali: un link generico firmato, senza
 *   tracciare le persone — solo conteggi (una riga PolicyAck con email "").
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { PolicyAck } from "@prisma/client";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/alerts";
import { LITERACY_EVIDENCE } from "@/lib/compliance";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";
import { QUIZ_TOTAL } from "@/lib/literacy";

const DAY = 86400000;
export const POLICY_VERSION_EVIDENCE = "ai_policy_version";
export const MAX_REMINDERS = 2;
const MAX_PEOPLE = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PolicySnapshot {
  version: string;
  orgName: string;
  approved: string[];
  notAllowed: string[];
  rules: { name: string; description: string }[];
  createdAt?: string;
}

/** Policy corrente dell'azienda (non salvata). La versione è l'impronta del contenuto. */
export async function composePolicy(organizationId: string): Promise<PolicySnapshot> {
  const [org, assets, policies] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    db.aiAsset.findMany({ where: { organizationId, deletedAt: null, status: { in: ["APPROVED", "UNAPPROVED"] } }, select: { name: true, status: true }, orderBy: { name: "asc" } }),
    db.policy.findMany({ where: { organizationId, enabled: true }, select: { name: true, description: true }, orderBy: { name: "asc" } }),
  ]);
  const uniq = (xs: string[]) => [...new Set(xs)].slice(0, 100);
  const body = {
    orgName: org?.name ?? "Your company",
    approved: uniq(assets.filter((a) => a.status === "APPROVED").map((a) => a.name)),
    notAllowed: uniq(assets.filter((a) => a.status === "UNAPPROVED").map((a) => a.name)),
    rules: policies.slice(0, 50).map((p) => ({ name: p.name.slice(0, 200), description: p.description.slice(0, 1000) })),
  };
  const version = "v" + createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 10);
  return { version, ...body };
}

async function findSnapshot(organizationId: string, version: string) {
  const e = await db.evidence.findFirst({
    where: { organizationId, type: POLICY_VERSION_EVIDENCE, payload: { path: ["version"], equals: version } },
    orderBy: { createdAt: "desc" },
  });
  return e ? ({ ...(e.payload as unknown as PolicySnapshot), createdAt: e.createdAt.toISOString() } as PolicySnapshot) : null;
}

/** Fotografia della versione corrente (creata alla prima richiesta). */
export async function ensurePolicySnapshot(organizationId: string): Promise<PolicySnapshot> {
  const cur = await composePolicy(organizationId);
  const existing = await findSnapshot(organizationId, cur.version);
  if (existing) return existing;
  await db.evidence.create({
    data: { organizationId, type: POLICY_VERSION_EVIDENCE, summary: `AI policy ${cur.version} published to employees`, payload: cur as any },
  });
  return cur;
}

export const loadPolicySnapshot = findSnapshot;

/** Ultima versione pubblicata ai dipendenti (se c'è). */
export async function latestSnapshot(organizationId: string): Promise<PolicySnapshot | null> {
  const e = await db.evidence.findFirst({ where: { organizationId, type: POLICY_VERSION_EVIDENCE }, orderBy: { createdAt: "desc" } });
  return e ? ({ ...(e.payload as unknown as PolicySnapshot), createdAt: e.createdAt.toISOString() } as PolicySnapshot) : null;
}

// ── Link generico firmato (privacy per reparto / solo totali) ─────────────
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET missing or too short");
  return s;
}
const genericSig = (orgId: string, version: string) => createHmac("sha256", secret()).update(`policy-ack:${orgId}:${version}`).digest("base64url").slice(0, 22);

export function genericToken(orgId: string, version: string) {
  return `g.${orgId}.${version}.${genericSig(orgId, version)}`;
}

export function verifyGenericToken(token: string): { orgId: string; version: string } | null {
  const m = /^g\.([A-Za-z0-9_-]{1,64})\.(v[0-9a-f]{10})\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!m) return null;
  try {
    const expected = Buffer.from(genericSig(m[1], m[2]));
    const got = Buffer.from(m[3]);
    return expected.length === got.length && timingSafeEqual(expected, got) ? { orgId: m[1], version: m[2] } : null;
  } catch {
    return null;
  }
}

export const ackLink = (token: string) => `${appUrl()}/ack/${token}`;

/** Destinatari: le persone note dell'azienda con un'email valida (solo privacy per persona). */
async function recipients(organizationId: string) {
  const users = await db.user.findMany({ where: { organizationId }, select: { email: true }, take: MAX_PEOPLE * 2 });
  return [...new Set(users.map((u) => u.email.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e) && !e.startsWith("p_")))].slice(0, MAX_PEOPLE);
}

function ackEmail(org: string, link: string, sentBy: string, reminder: boolean) {
  return {
    subject: reminder ? `Reminder: please confirm ${org}'s AI policy` : `Please read ${org}'s AI policy (2 minutes)`,
    text: `Hi,\n\n${reminder ? "A quick reminder: " : ""}${org} asks everyone who works with AI tools to read the company AI policy and answer 5 short questions. It takes about 2 minutes.\n\n${link}\n\nThis is part of how the company supports AI literacy under the EU AI Act (art. 4).\n\nQuestions? Reply to ${sentBy}.\n\nThanks!`,
  };
}

export interface SendResult {
  version: string;
  people: number;
  created: number;
  sent: number;
  emailOff: boolean;
  reason?: string;
}

/**
 * Crea i link personali per la versione corrente e li invia per email (se
 * configurata). Chi ha già un link per questa versione non viene ricontattato:
 * per quello ci sono i promemoria.
 */
export async function sendPolicyAcks(organizationId: string, sentBy: string): Promise<SendResult> {
  const snap = await ensurePolicySnapshot(organizationId);
  if (!showsPeople(await orgPrivacyMode(organizationId))) {
    return { version: snap.version, people: 0, created: 0, sent: 0, emailOff: false, reason: "Per-person links are off with this employee privacy mode — share the generic link instead." };
  }
  const { sendEmail, emailEnabled } = await import("@/lib/mail");
  const emails = await recipients(organizationId);
  if (!emails.length) return { version: snap.version, people: 0, created: 0, sent: 0, emailOff: !emailEnabled(), reason: "No employees with an email yet — connect Microsoft 365 or Google Workspace, or add people in Settings." };
  const existing = new Set(
    (await db.policyAck.findMany({ where: { organizationId, policyVersion: snap.version, email: { in: emails } }, select: { email: true } })).map((r) => r.email)
  );
  const on = emailEnabled();
  let created = 0;
  let sent = 0;
  for (const email of emails) {
    if (existing.has(email)) continue;
    const token = randomBytes(18).toString("base64url");
    await db.policyAck.create({ data: { organizationId, email, policyVersion: snap.version, token } });
    created++;
    if (on) {
      const r = await sendEmail({ to: email, ...ackEmail(snap.orgName, ackLink(token), sentBy, false) });
      if (r.sent) sent++;
    }
  }
  return { version: snap.version, people: emails.length, created, sent, emailOff: !on, reason: created ? undefined : "Everyone already has a link for this version of the policy." };
}

/** Promemoria: link personali non confermati da più di 7 giorni, al massimo MAX_REMINDERS volte. */
export async function sendAckReminders(organizationId: string, sentBy = "your IT team", now = new Date()) {
  if (!showsPeople(await orgPrivacyMode(organizationId))) return 0;
  const { sendEmail, emailEnabled } = await import("@/lib/mail");
  if (!emailEnabled()) return 0;
  const cutoff = new Date(now.getTime() - 7 * DAY);
  const due = await db.policyAck.findMany({
    where: {
      organizationId,
      email: { not: "" },
      acknowledgedAt: null,
      reminders: { lt: MAX_REMINDERS },
      sentAt: { lt: cutoff },
      OR: [{ remindedAt: null }, { remindedAt: { lt: cutoff } }],
    },
    take: MAX_PEOPLE,
  });
  if (!due.length) return 0;
  // Solo la versione più recente: le vecchie versioni non si ricordano più.
  const latest = await latestSnapshot(organizationId);
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  let n = 0;
  for (const r of due) {
    if (latest && r.policyVersion !== latest.version) continue;
    const res = await sendEmail({ to: r.email, ...ackEmail(org?.name ?? "Your company", ackLink(r.token), sentBy, true) });
    if (!res.sent) continue;
    await db.policyAck.update({ where: { id: r.id }, data: { remindedAt: now, reminders: { increment: 1 } } });
    n++;
  }
  return n;
}

export interface AckStats {
  version: string | null;
  publishedAt: string | null;
  currentVersion: string;
  changed: boolean; // la policy è cambiata dopo l'ultimo invio
  personal: boolean;
  total: number;
  acknowledged: number;
  opened: number;
  pending: number;
  reminded: number;
  avgScore: number | null; // 0..QUIZ_TOTAL
  generic: number; // completamenti dal link generico (senza persone)
  rows: { email: string; token: string; sentAt: Date; openedAt: Date | null; acknowledgedAt: Date | null; quizScore: number | null; reminders: number }[];
}

export async function policyAckStats(organizationId: string): Promise<AckStats> {
  const [latest, current, mode] = await Promise.all([latestSnapshot(organizationId), composePolicy(organizationId), orgPrivacyMode(organizationId)]);
  const personal = showsPeople(mode);
  const version = latest?.version ?? null;
  const rows = version ? await db.policyAck.findMany({ where: { organizationId, policyVersion: version }, orderBy: [{ acknowledgedAt: "asc" }, { email: "asc" }], take: 5000 }) : [];
  const named = rows.filter((r) => r.email !== "");
  const anon = rows.filter((r) => r.email === "" && r.acknowledgedAt);
  const done = rows.filter((r) => r.acknowledgedAt && r.quizScore != null);
  return {
    version,
    publishedAt: latest?.createdAt ?? null,
    currentVersion: current.version,
    changed: !!version && version !== current.version,
    personal,
    total: named.length,
    acknowledged: named.filter((r) => r.acknowledgedAt).length,
    opened: named.filter((r) => r.openedAt || r.acknowledgedAt).length,
    pending: named.filter((r) => !r.acknowledgedAt).length,
    reminded: named.filter((r) => r.reminders > 0 && !r.acknowledgedAt).length,
    avgScore: done.length ? Math.round((done.reduce((s, r) => s + (r.quizScore ?? 0), 0) / done.length) * 10) / 10 : null,
    generic: anon.length,
    // Nomi ed email solo in modalità per persona.
    rows: personal ? named.map((r) => ({ email: r.email, token: r.token, sentAt: r.sentAt, openedAt: r.openedAt, acknowledgedAt: r.acknowledgedAt, quizScore: r.quizScore, reminders: r.reminders })) : [],
  };
}

/** Per l'evidence pack: tasso di presa visione e misure di literacy (sempre aggregato). */
export async function ackSummaryForPack(organizationId: string) {
  const s = await policyAckStats(organizationId);
  return {
    policyVersion: s.version,
    publishedAt: s.publishedAt,
    changedSincePublished: s.changed,
    trackedPerPerson: s.personal,
    sent: s.total,
    acknowledged: s.acknowledged,
    acknowledgementRate: s.total ? Math.round((s.acknowledged / s.total) * 100) : null,
    pending: s.pending,
    anonymousCompletions: s.generic,
    averageQuizScore: s.avgScore,
    quizQuestions: QUIZ_TOTAL,
    measures: [
      "Company AI policy shared with employees, with the list of approved and not-allowed AI tools",
      `AI literacy mini-module (${QUIZ_TOTAL} multiple-choice questions: data protection, verifying output, approval of new tools, transparency, high-risk uses)`,
      s.personal ? "Personal acknowledgement links with up to 2 reminders" : "Generic acknowledgement link without per-person tracking (employee privacy mode)",
    ],
  };
}

export type AckTarget =
  | { kind: "personal"; row: PolicyAck; orgId: string; version: string }
  | { kind: "generic"; orgId: string; version: string };

/** Risolve il token del link (personale o generico firmato). */
export async function resolveAckToken(token: string): Promise<AckTarget | null> {
  if (!token || token.length > 120) return null;
  if (token.startsWith("g.")) {
    const g = verifyGenericToken(token);
    return g ? { kind: "generic", orgId: g.orgId, version: g.version } : null;
  }
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;
  const row = await db.policyAck.findUnique({ where: { token } });
  return row && row.email !== "" ? { kind: "personal", row, orgId: row.organizationId, version: row.policyVersion } : null;
}

/**
 * Registra la conferma (e il punteggio) e scrive l'evidenza di AI literacy:
 * una riga per persona in modalità per persona, una riga aggregata al giorno
 * per il link generico. Restituisce false se il link non è valido.
 */
export async function recordAck(target: AckTarget, score: number, lang: string): Promise<boolean> {
  const now = new Date();
  const s = Math.max(0, Math.min(QUIZ_TOTAL, Math.round(score)));
  if (target.kind === "personal") {
    // Solo la prima conferma conta (updateMany con acknowledgedAt null: niente doppioni in gara).
    const r = await db.policyAck.updateMany({ where: { id: target.row.id, acknowledgedAt: null }, data: { acknowledgedAt: now, quizScore: s, lang, openedAt: target.row.openedAt ?? now } });
    if (r.count === 0) return true;
    await db.evidence.create({
      data: {
        organizationId: target.orgId,
        type: LITERACY_EVIDENCE,
        summary: `AI policy ${target.version} acknowledged by an employee — literacy check ${s}/${QUIZ_TOTAL}`,
        payload: { kind: "policy_ack", policyVersion: target.version, email: target.row.email, quizScore: s, quizTotal: QUIZ_TOTAL, acknowledgedAt: now.toISOString() },
      },
    });
    return true;
  }
  // Link generico: la versione deve esistere per questa azienda.
  if (!(await findSnapshot(target.orgId, target.version))) return false;
  await db.policyAck.create({ data: { organizationId: target.orgId, email: "", policyVersion: target.version, token: "anon_" + randomBytes(15).toString("base64url"), acknowledgedAt: now, openedAt: now, quizScore: s, lang } });
  const day = now.toISOString().slice(0, 10);
  const where = {
    organizationId: target.orgId,
    type: LITERACY_EVIDENCE,
    AND: [{ payload: { path: ["kind"], equals: "policy_ack_aggregate" } }, { payload: { path: ["policyVersion"], equals: target.version } }, { payload: { path: ["day"], equals: day } }],
  };
  const agg = await db.policyAck.aggregate({
    where: { organizationId: target.orgId, policyVersion: target.version, email: "", acknowledgedAt: { gte: new Date(`${day}T00:00:00.000Z`) } },
    _count: { _all: true },
    _avg: { quizScore: true },
  });
  const count = agg._count._all;
  const avg = Math.round((agg._avg.quizScore ?? 0) * 10) / 10;
  const payload = { kind: "policy_ack_aggregate", policyVersion: target.version, day, completions: count, averageQuizScore: avg, quizTotal: QUIZ_TOTAL };
  const summary = `AI policy ${target.version}: ${count} anonymous acknowledgement${count === 1 ? "" : "s"} on ${day} — average literacy check ${avg}/${QUIZ_TOTAL}`;
  const existing = await db.evidence.findFirst({ where, select: { id: true } });
  if (existing) await db.evidence.update({ where: { id: existing.id }, data: { summary, payload } });
  else await db.evidence.create({ data: { organizationId: target.orgId, type: LITERACY_EVIDENCE, summary, payload } });
  return true;
}

import { createHash } from "crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";

/**
 * Registro di audit a prova di manomissione (AI Act / NIS2): ogni riga di
 * un'azienda porta l'hash della riga precedente (prevHash) e il proprio hash,
 * calcolato su prevHash + JSON canonico dei suoi campi. Cambiare, togliere o
 * inserire una riga nel mezzo rompe la catena e verifyAuditChain() lo trova.
 * Le righe scritte prima dell'introduzione della catena restano "legacy".
 */
export const AUDIT_GENESIS = "genesis";

/** JSON con chiavi ordinate e senza undefined: stesso testo prima e dopo jsonb. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value === undefined ? null : value));
}

function sortDeep(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : sortDeep(x)));
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>).sort()) {
    const x = (v as Record<string, unknown>)[k];
    if (x !== undefined) out[k] = sortDeep(x);
  }
  return out;
}

/** Come arriva meta dal database: già passato da JSON (niente Date, niente undefined). */
export function normalizeMeta(meta: unknown): unknown {
  if (meta === undefined || meta === null) return null;
  return JSON.parse(JSON.stringify(meta));
}

export interface ChainFields {
  orgId: string | null;
  actorEmail: string | null;
  action: string;
  target: string | null;
  meta: unknown;
  createdAt: Date;
}

export function auditHash(prevHash: string, f: ChainFields): string {
  const body = canonicalJson({
    orgId: f.orgId,
    actorEmail: f.actorEmail,
    action: f.action,
    target: f.target,
    meta: normalizeMeta(f.meta),
    createdAt: f.createdAt.toISOString(),
  });
  return createHash("sha256").update(prevHash + body).digest("hex");
}

export interface AuditEntry {
  orgId: string | null;
  actorEmail: string | null;
  action: string;
  target?: string | null;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
}

/**
 * Scrive una riga incatenata. Un lock di transazione per azienda
 * (pg_advisory_xact_lock) serializza le scritture concorrenti, così due
 * righe non possono agganciarsi allo stesso predecessore. createdAt è
 * sempre strettamente successivo a quello della riga precedente, anche con
 * orologi dei server leggermente sfasati: l'ordine (createdAt, id) della
 * verifica è quindi lo stesso della catena.
 */
export async function writeAuditEntry(e: AuditEntry) {
  const meta = normalizeMeta(e.meta);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"audit:" + (e.orgId ?? "platform")}::text))`;
    const last = await tx.auditLog.findFirst({
      where: { organizationId: e.orgId, hash: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { hash: true, createdAt: true },
    });
    const prevHash = last?.hash ?? AUDIT_GENESIS;
    const now = Date.now();
    const createdAt = new Date(last && last.createdAt.getTime() >= now ? last.createdAt.getTime() + 1 : now);
    const hash = auditHash(prevHash, { orgId: e.orgId, actorEmail: e.actorEmail, action: e.action, target: e.target ?? null, meta, createdAt });
    return tx.auditLog.create({
      data: {
        organizationId: e.orgId,
        actorEmail: e.actorEmail,
        action: e.action,
        target: e.target ?? null,
        meta: (meta as any) ?? undefined,
        ip: e.ip ?? null,
        createdAt,
        prevHash,
        hash,
      },
    });
  });
}

/**
 * Scrive una riga nel registro di audit. Non deve mai far fallire l'azione
 * che la chiama: in caso di errore lo registra nei log del server e basta.
 */
export async function audit(action: string, target?: string, meta?: Record<string, unknown>, override?: { orgId?: string | null; actorEmail?: string | null }) {
  try {
    const s = currentSession();
    let ip: string | null = null;
    try {
      ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    } catch {
      // fuori da una richiesta (es. webhook): nessun IP
    }
    await writeAuditEntry({
      orgId: override?.orgId !== undefined ? override.orgId : s?.orgId ?? null,
      actorEmail: override?.actorEmail !== undefined ? override.actorEmail : s?.email ?? null,
      action,
      target: target ?? null,
      meta: meta ?? null,
      ip,
    });
  } catch (err) {
    console.error("[audit] failed to write", action, err);
  }
}

export interface ChainRow {
  id: string;
  organizationId: string | null;
  actorEmail: string | null;
  action: string;
  target: string | null;
  meta: unknown;
  createdAt: Date;
  prevHash: string | null;
  hash: string | null;
}

export interface ChainResult {
  ok: boolean;
  /** Righe incatenate controllate. */
  checked: number;
  /** Prima riga dove la catena si rompe (hash sbagliato, predecessore sbagliato o riga senza hash dopo l'inizio della catena). */
  firstBrokenId?: string;
  brokenReason?: string;
  /** Righe scritte prima della catena (senza hash). */
  legacyUnchained: number;
  /** Hash dell'ultima riga: "testa" della catena, da annotare altrove per confronti futuri. */
  headHash?: string;
}

/** Verifica pura su righe già ordinate per (createdAt, id). */
export function verifyChainRows(rows: ChainRow[]): ChainResult {
  let expectedPrev = AUDIT_GENESIS;
  let started = false;
  let checked = 0;
  let legacy = 0;
  for (const r of rows) {
    if (!r.hash) {
      if (!started) {
        legacy++;
        continue;
      }
      return { ok: false, checked, legacyUnchained: legacy, firstBrokenId: r.id, brokenReason: "Entry without hash after chaining started" };
    }
    started = true;
    if (r.prevHash !== expectedPrev) {
      return { ok: false, checked, legacyUnchained: legacy, firstBrokenId: r.id, brokenReason: "Previous hash doesn't match (an entry was removed or inserted)" };
    }
    const h = auditHash(r.prevHash, { orgId: r.organizationId, actorEmail: r.actorEmail, action: r.action, target: r.target, meta: r.meta, createdAt: r.createdAt });
    if (h !== r.hash) {
      return { ok: false, checked, legacyUnchained: legacy, firstBrokenId: r.id, brokenReason: "Content doesn't match its hash (the entry was changed)" };
    }
    checked++;
    expectedPrev = r.hash;
  }
  return { ok: true, checked, legacyUnchained: legacy, headHash: started ? expectedPrev : undefined };
}

/** Rilegge tutto il registro dell'azienda, a pagine, e verifica la catena. */
export async function verifyAuditChain(orgId: string): Promise<ChainResult> {
  const rows: ChainRow[] = [];
  const PAGE = 5000;
  let cursor: { id: string } | undefined;
  for (;;) {
    const page = await db.auditLog.findMany({
      where: { organizationId: orgId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, organizationId: true, actorEmail: true, action: true, target: true, meta: true, createdAt: true, prevHash: true, hash: true },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor } : {}),
    });
    rows.push(...page);
    if (page.length < PAGE) break;
    cursor = { id: page[page.length - 1].id };
  }
  return verifyChainRows(rows);
}

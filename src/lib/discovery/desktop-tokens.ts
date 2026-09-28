import { randomBytes } from "crypto";
import type { DesktopToken, Organization } from "@prisma/client";
import { db } from "@/lib/db";
import { hashToken, orgForToken } from "./ingest";

/**
 * Token per singola installazione dell'app desktop (anti-spoofing): il link
 * aziendale dà a ogni installazione il suo token; il primo invio con un'email
 * lo lega a quella persona e da lì in poi non può più inviare a nome di altri.
 * Il vecchio token unico dell'azienda (angd_…) continua a funzionare per le
 * installazioni precedenti, che nella pagina Computers risultano "legacy".
 */
export const DESKTOP_TOKEN_PREFIX = "angdt_";

export async function newDesktopToken(organizationId: string): Promise<string> {
  const token = DESKTOP_TOKEN_PREFIX + randomBytes(24).toString("base64url");
  await db.desktopToken.create({ data: { organizationId, tokenHash: hashToken(token) } });
  return token;
}

export type UsageAuth = { org: Organization; desktopToken: DesktopToken | null; key: string };

/** Azienda (e token dell'installazione, se è uno per-dispositivo) di un Bearer token. */
export async function authUsageToken(token: string | null | undefined): Promise<UsageAuth | null> {
  if (!token) return null;
  if (token.startsWith(DESKTOP_TOKEN_PREFIX)) {
    if (token.length > 100) return null;
    const tokenHash = hashToken(token);
    const row = await db.desktopToken.findUnique({ where: { tokenHash }, include: { organization: true } });
    if (!row || row.revokedAt) return null;
    const { organization, ...desktopToken } = row;
    return { org: organization, desktopToken, key: tokenHash };
  }
  const org = await orgForToken(token);
  return org ? { org, desktopToken: null, key: hashToken(token) } : null;
}

/**
 * Lega il token alla persona al primo invio con un'email; dopo, un'altra email
 * è rifiutata. `identity` è lo pseudonimo dell'email (vale in ogni modalità privacy).
 * true = invio ammesso.
 */
export async function bindDesktopToken(t: DesktopToken, identity: string | null): Promise<boolean> {
  if (identity && t.email && t.email !== identity) return false;
  if (identity && !t.email) {
    // Due invii contemporanei: vince il primo, il secondo si ricontrolla.
    const bound = await db.desktopToken.updateMany({ where: { id: t.id, email: null }, data: { email: identity } });
    if (bound.count === 0) {
      const now = await db.desktopToken.findUnique({ where: { id: t.id }, select: { email: true } });
      if (now?.email !== identity) return false;
    }
  }
  return true;
}

/** Dopo un invio riuscito: ultimo uso e computer (per "legacy" nella pagina Computers). */
export async function touchDesktopToken(id: string, deviceKey: string | null) {
  await db.desktopToken.update({ where: { id }, data: { lastUsedAt: new Date(), ...(deviceKey ? { deviceKey } : {}) } });
}

/** Revoca tutti i token delle installazioni (quando l'azienda scollega l'app). */
export async function revokeDesktopTokens(organizationId: string) {
  await db.desktopToken.updateMany({ where: { organizationId, revokedAt: null }, data: { revokedAt: new Date() } });
}

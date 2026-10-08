import { revalidateTag, unstable_cache } from "next/cache";
import { db } from "@/lib/db";

/** Tag della cache dei dati della sidebar (primi passi + conteggio da rivedere) di un'organizzazione. */
export const orgSetupTag = (orgId: string) => `org:${orgId}:setup`;

/** Da chiamare dopo un'azione che cambia i primi passi o la coda "da rivedere", per non aspettare i 60 s. */
export function revalidateOrgSetup(orgId: string) {
  revalidateTag(orgSetupTag(orgId));
}

/** Connettori di identità / uso: bastano per sapere chi usa ogni AI anche senza app desktop. */
const IDENTITY_PROVIDERS = ["MICROSOFT_365", "GOOGLE_WORKSPACE", "OKTA"] as const;

export interface OrgSetupState {
  hasSpend: boolean;
  hasTeam: boolean;
  identityConnected: boolean;
  reviewCount: number;
}

/**
 * Dati della sidebar che non devono essere al secondo: letti al massimo una
 * volta ogni 60 s per organizzazione (prima erano 4 query a ogni navigazione).
 * Solo esistenza (findFirst / take 2), mai count su tabelle intere.
 */
export function orgSetupState(orgId: string): Promise<OrgSetupState> {
  return unstable_cache(
    async (): Promise<OrgSetupState> => {
      const [spend, members, identity, reviewCount] = await Promise.all([
        db.spendRecord.findFirst({ where: { organizationId: orgId }, select: { id: true } }),
        db.workspaceMember.findMany({ where: { organizationId: orgId }, select: { id: true }, take: 2 }),
        db.connector.findFirst({ where: { organizationId: orgId, provider: { in: [...IDENTITY_PROVIDERS] }, status: { in: ["CONNECTED", "SYNCING"] } }, select: { id: true } }),
        db.aiAsset.count({ where: { organizationId: orgId, deletedAt: null, status: { in: ["UNKNOWN", "UNREVIEWED"] } } }),
      ]);
      return { hasSpend: !!spend, hasTeam: members.length > 1, identityConnected: !!identity, reviewCount };
    },
    ["org-setup-state", orgId],
    { revalidate: 60, tags: [orgSetupTag(orgId)] }
  )();
}

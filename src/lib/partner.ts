/**
 * Console partner (commercialisti, MSP): i numeri chiave di ogni workspace
 * cliente di cui l'utente è membro. Mai workspace di altri.
 */
import { db } from "@/lib/db";
import { computeSavings, monthlyOf } from "@/lib/savings";

const ONLINE_MS = 70 * 60 * 1000;

export interface PartnerClient {
  id: string;
  name: string;
  plan: string;
  role: string;
  current: boolean;
  aiCount: number;
  monthlySpend: number;
  canSave: number;
  toReview: number;
  computersOnline: number;
  unreadAlerts: number;
}

export async function partnerClients(email: string, currentOrgId: string): Promise<PartnerClient[]> {
  // Solo membri attivi (più il workspace corrente, a cui la sessione dà già accesso).
  const orgs = await db.organization.findMany({
    where: { OR: [{ members: { some: { email, status: "active" } } }, { id: currentOrgId, members: { some: { email } } }] },
    select: { id: true, name: true, plan: true, members: { where: { email }, select: { role: true } } },
  });
  const since = new Date(Date.now() - ONLINE_MS);
  const rows = await Promise.all(
    orgs.map(async (o) => {
      // computeSavings carica già le AI (stesso filtro di loadAssets): niente doppia query.
      const [{ totalMonthly, assets }, toReview, computersOnline, unreadAlerts] = await Promise.all([
        computeSavings(o.id),
        db.aiAsset.count({ where: { organizationId: o.id, deletedAt: null, status: { in: ["UNKNOWN", "UNREVIEWED"] } } }),
        db.desktopDevice.count({ where: { organizationId: o.id, lastSeenAt: { gte: since } } }),
        db.alert.count({ where: { organizationId: o.id, readAt: null } }),
      ]);
      const monthlySpend = assets.reduce((t, a) => t + (monthlyOf(a)?.eur ?? 0), 0);
      return {
        id: o.id,
        name: o.name,
        plan: o.plan,
        role: o.members[0]?.role ?? "VIEWER",
        current: o.id === currentOrgId,
        aiCount: assets.length,
        monthlySpend,
        canSave: totalMonthly,
        toReview,
        computersOnline,
        unreadAlerts,
      } satisfies PartnerClient;
    })
  );
  return rows.sort((a, b) => b.canSave - a.canSave || b.monthlySpend - a.monthlySpend || a.name.localeCompare(b.name));
}

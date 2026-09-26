import { db } from "@/lib/db";

export interface Renewal {
  assetId: string;
  name: string;
  vendor: string | null;
  date: Date;
  amountEur: number;
  annual: boolean;
}

const DAY = 86400000;

/**
 * Prossimi rinnovi dagli addebiti reali: annuale = ultimo addebito + 12 mesi,
 * mensile = + 1 mese. Utile soprattutto per gli annuali (da decidere prima).
 */
export async function upcomingRenewals(organizationId: string, withinDays = 60): Promise<Renewal[]> {
  const assets = await db.aiAsset.findMany({
    where: { organizationId, deletedAt: null, status: { not: "UNAPPROVED" }, spendRecords: { some: {} } },
    include: { cost: true, spendRecords: { orderBy: { date: "desc" }, take: 1 } },
  });
  const now = Date.now();
  const out: Renewal[] = [];
  for (const a of assets) {
    const last = a.spendRecords[0];
    if (!last) continue;
    const annual = Boolean(a.cost?.annualBilling);
    const next = new Date(last.date);
    if (annual) next.setUTCFullYear(next.getUTCFullYear() + 1);
    else next.setUTCMonth(next.getUTCMonth() + 1);
    // Se la data è passata da tanto, l'abbonamento potrebbe essere già finito.
    if (next.getTime() < now - 20 * DAY) continue;
    while (next.getTime() < now - DAY) next.setUTCMonth(next.getUTCMonth() + (annual ? 12 : 1));
    if (next.getTime() - now <= withinDays * DAY) out.push({ assetId: a.id, name: a.name, vendor: a.vendor, date: next, amountEur: last.amountEur, annual });
  }
  return out.sort((x, y) => x.date.getTime() - y.date.getTime());
}

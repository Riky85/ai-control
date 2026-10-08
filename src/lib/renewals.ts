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
 * Data + n mesi (UTC) senza sforare: il 31 gennaio + 1 mese è il 28/29 febbraio, non
 * il 3 marzo. Sempre calcolata dalla data di partenza, così il giorno non "scivola".
 */
export function addMonthsClamped(from: Date, n: number): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = new Date(from);
  d.setUTCFullYear(y, m, Math.min(from.getUTCDate(), last));
  return d;
}

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
    const step = annual ? 12 : 1;
    let k = 1;
    let next = addMonthsClamped(last.date, step);
    // Se la data è passata da tanto, l'abbonamento potrebbe essere già finito.
    if (next.getTime() < now - 20 * DAY) continue;
    // Fine mese limitata all'ultimo giorno del mese: il mese (e la chiave dell'opportunità) resta giusto.
    while (next.getTime() < now - DAY) next = addMonthsClamped(last.date, step * ++k);
    if (next.getTime() - now <= withinDays * DAY) out.push({ assetId: a.id, name: a.name, vendor: a.vendor, date: next, amountEur: last.amountEur, annual });
  }
  return out.sort((x, y) => x.date.getTime() - y.date.getTime());
}

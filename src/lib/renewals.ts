import { db } from "@/lib/db";
import { lastRenewal } from "@/lib/engine/forecast";

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
  // Annuali: importo = addebito più grande del mese di rinnovo (lastRenewal), non l'ultima
  // riga (posti aggiunti, rimborsi). 25 mesi bastano: oltre, il rinnovo è comunque scaduto.
  const annualIds = assets.filter((a) => a.cost?.annualBilling).map((a) => a.id);
  const history = new Map<string, { date: Date; eur: number }[]>();
  if (annualIds.length) {
    const rows = await db.spendRecord.findMany({
      where: { organizationId, aiAssetId: { in: annualIds }, date: { gte: addMonthsClamped(new Date(now), -25) } },
      select: { aiAssetId: true, date: true, amountEur: true },
      orderBy: { date: "asc" },
    });
    for (const r of rows) if (r.aiAssetId) history.set(r.aiAssetId, [...(history.get(r.aiAssetId) ?? []), { date: r.date, eur: r.amountEur }]);
  }
  const out: Renewal[] = [];
  for (const a of assets) {
    const last = a.spendRecords[0];
    if (!last) continue;
    const annual = Boolean(a.cost?.annualBilling);
    const charges = annual ? history.get(a.id) : undefined;
    const amountEur = charges?.length ? lastRenewal(charges).eur : last.amountEur;
    const step = annual ? 12 : 1;
    let k = 1;
    let next = addMonthsClamped(last.date, step);
    // La data resta ancorata all'ultimo addebito come prima: il mese (e quindi la chiave
    // dell'opportunità "renewal:<asset>:<mese>") non cambia.
    // Se la data è passata da tanto, l'abbonamento potrebbe essere già finito.
    if (next.getTime() < now - 20 * DAY) continue;
    // Fine mese limitata all'ultimo giorno del mese: il mese (e la chiave dell'opportunità) resta giusto.
    while (next.getTime() < now - DAY) next = addMonthsClamped(last.date, step * ++k);
    if (next.getTime() - now <= withinDays * DAY) out.push({ assetId: a.id, name: a.name, vendor: a.vendor, date: next, amountEur, annual });
  }
  return out.sort((x, y) => x.date.getTime() - y.date.getTime());
}

/**
 * Chargeback / showback: il costo AI di un mese ripartito per reparto e
 * centro di costo. Regole semplici e spiegabili:
 *  - costo del mese = addebiti reali (SpendRecord) se ci sono, altrimenti il
 *    costo mensile corrente (run rate) per le AI senza addebiti tracciati;
 *  - strumenti a posto (assistenti, coding…): costo per posto × posti usati
 *    dalle persone del reparto; i posti non usati restano "non allocati";
 *  - strumenti condivisi (API, uso a consumo): in proporzione agli utenti
 *    attivi di ogni reparto;
 *  - nessun utente noto: reparto dichiarato sull'AI, altrimenti non allocato.
 */
import { db } from "@/lib/db";
import { categoryOf, monthlyOf } from "@/lib/savings";

export type ChargeMethod = "seats" | "users" | "ai-department";
export type UnallocatedReason = "Unused seats" | "People without a department" | "No known users" | "Charges not matched to an AI";

export interface ChargeLine {
  assetId: string | null;
  name: string;
  eur: number;
  method: ChargeMethod;
}

export interface ChargeRow {
  department: string;
  costCenter: { code: string; name: string | null } | null;
  eur: number;
  people: number;
  lines: ChargeLine[];
}

export interface UnallocatedLine {
  assetId: string | null;
  name: string;
  reason: UnallocatedReason;
  eur: number;
}

export interface Chargeback {
  month: string;
  from: Date;
  /** Esclusivo: primo giorno del mese successivo. */
  to: Date;
  rows: ChargeRow[];
  unallocated: UnallocatedLine[];
  allocatedEur: number;
  unallocatedEur: number;
  totalEur: number;
  /** Quanto del totale viene da addebiti reali e quanto dal costo mensile corrente. */
  actualEur: number;
  runRateEur: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** "aaaa-mm" valido → estremi del mese (UTC, come le date degli addebiti). */
export function monthRange(month: string): { from: Date; to: Date } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return { from: new Date(Date.UTC(y, mo - 1, 1)), to: new Date(Date.UTC(y, mo, 1)) };
}

export function currentMonth(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

/** Ultimi `n` mesi, dal corrente all'indietro. */
export function recentMonths(n = 12, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  return out;
}

export function monthLabel(month: string) {
  const r = monthRange(month);
  return r ? new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(r.from) : month;
}

/** Strumento a posto (licenza per persona) o condiviso (API / consumo). */
export function isPerSeat(a: { type: string; serviceId: string | null; name: string; vendor: string | null; cost?: { seats: number | null } | null }) {
  if (a.cost?.seats && a.cost.seats > 0) return true;
  if (a.type === "AI_API") return false;
  const cat = categoryOf(a);
  return cat !== null && cat !== "api" && cat !== "local";
}

export interface AllocUser {
  key: string;
  department: string | null;
}

/**
 * Ripartisce il costo di una AI. Pura (testabile): restituisce le quote per
 * reparto e il non allocato, in centesimi, con somma esatta pari al costo.
 */
export function allocateAsset(
  eur: number,
  opts: { perSeat: boolean; seats: number | null; users: AllocUser[]; assetDepartment: string | null }
): { shares: { department: string; eur: number; method: ChargeMethod; people: string[] }[]; unallocated: { reason: UnallocatedReason; eur: number }[] } {
  const total = cents(eur);
  const shares: { department: string; eur: number; method: ChargeMethod; people: string[] }[] = [];
  const unallocated: { reason: UnallocatedReason; eur: number }[] = [];
  if (total <= 0) return { shares, unallocated };

  const users = opts.users;
  if (users.length === 0) {
    const d = opts.assetDepartment?.trim();
    if (d) shares.push({ department: d, eur: total, method: "ai-department", people: [] });
    else unallocated.push({ reason: "No known users", eur: total });
    return { shares, unallocated };
  }

  // Persone per reparto (reparti uguali a meno delle maiuscole = stesso reparto).
  const byDept = new Map<string, { label: string; people: string[] }>();
  const noDept: string[] = [];
  for (const u of users) {
    const d = u.department?.trim();
    if (!d) {
      noDept.push(u.key);
      continue;
    }
    const k = d.toLowerCase();
    if (!byDept.has(k)) byDept.set(k, { label: d, people: [] });
    byDept.get(k)!.people.push(u.key);
  }

  const units = opts.perSeat ? Math.max(opts.seats ?? 0, users.length) : users.length;
  const method: ChargeMethod = opts.perSeat ? "seats" : "users";
  let used = 0;
  for (const g of Array.from(byDept.values())) {
    const share = cents((total * g.people.length) / units);
    shares.push({ department: g.label, eur: share, method, people: g.people });
    used += share;
  }
  if (noDept.length) {
    const share = cents((total * noDept.length) / units);
    unallocated.push({ reason: "People without a department", eur: share });
    used += share;
  }
  const rest = cents(total - used);
  if (opts.perSeat && units > users.length) {
    // Posti pagati ma senza persona: non allocati (più l'eventuale arrotondamento).
    unallocated.push({ reason: "Unused seats", eur: rest });
  } else if (rest !== 0) {
    // Solo arrotondamento: alla quota più grande, così i totali tornano al centesimo.
    const target = shares.length ? shares.reduce((m, s) => (s.eur > m.eur ? s : m)) : null;
    if (target) target.eur = cents(target.eur + rest);
    else if (unallocated.length) unallocated[0].eur = cents(unallocated[0].eur + rest);
  }
  return { shares: shares.filter((s) => s.eur !== 0), unallocated: unallocated.filter((u) => u.eur !== 0) };
}

export async function computeChargeback(organizationId: string, month: string, now = new Date()): Promise<Chargeback | null> {
  const range = monthRange(month);
  if (!range) return null;
  const { from, to } = range;
  const isCurrent = month === currentMonth(now);

  const [records, costCenters] = await Promise.all([
    db.spendRecord.findMany({ where: { organizationId, date: { gte: from, lt: to } }, select: { aiAssetId: true, service: true, amountEur: true } }),
    db.costCenter.findMany({ where: { organizationId } }),
  ]);
  const actualByAsset = new Map<string, number>();
  const unmatched = new Map<string, number>();
  for (const r of records) {
    if (r.aiAssetId) actualByAsset.set(r.aiAssetId, (actualByAsset.get(r.aiAssetId) ?? 0) + r.amountEur);
    else unmatched.set(r.service, (unmatched.get(r.service) ?? 0) + r.amountEur);
  }

  // AI attive (non rifiutate) più quelle con addebiti reali nel mese, anche se rifiutate o eliminate.
  const assets = await db.aiAsset.findMany({
    where: {
      organizationId,
      OR: [{ deletedAt: null, status: { not: "UNAPPROVED" } }, { id: { in: Array.from(actualByAsset.keys()) } }],
    },
    select: {
      id: true,
      name: true,
      vendor: true,
      type: true,
      serviceId: true,
      department: true,
      firstSeenAt: true,
      cost: true,
      _count: { select: { spendRecords: true } },
      usages: { select: { id: true, userId: true, externalUserRef: true, firstSeenAt: true, lastSeenAt: true, user: { select: { department: true } } } },
    },
  });

  const rows = new Map<string, { label: string; eur: number; people: Set<string>; lines: Map<string, ChargeLine> }>();
  const unallocated: UnallocatedLine[] = [];
  let actualEur = 0;
  let runRateEur = 0;

  for (const a of assets) {
    let eur = 0;
    const actual = actualByAsset.get(a.id);
    if (actual != null && actual > 0) {
      eur = actual;
      actualEur += cents(actual);
    } else if (a.firstSeenAt < to && (isCurrent || a._count.spendRecords === 0)) {
      // Nessun addebito nel mese: costo mensile corrente, ma solo nel mese in corso o
      // per le AI il cui costo non viene dagli addebiti (API, manuale, stima).
      const m = monthlyOf(a);
      if (m && m.eur > 0) {
        eur = m.eur;
        runRateEur += cents(m.eur);
      }
    }
    if (eur <= 0) continue;

    // Chi aveva l'AI nel mese (posti) e chi l'ha usata (condivisi).
    const holders = a.usages.filter((u) => u.firstSeenAt < to);
    const active = holders.filter((u) => !u.lastSeenAt || u.lastSeenAt >= from);
    const perSeat = isPerSeat(a);
    const pool = perSeat ? holders : active.length ? active : holders.length ? holders : a.usages;
    const users = pool.map((u) => ({ key: u.userId ?? u.externalUserRef ?? u.id, department: u.user?.department ?? null }));
    const res = allocateAsset(eur, { perSeat, seats: a.cost?.seats ?? null, users, assetDepartment: a.department });

    for (const s of res.shares) {
      const k = s.department.toLowerCase();
      let row = rows.get(k);
      if (!row) rows.set(k, (row = { label: s.department, eur: 0, people: new Set(), lines: new Map() }));
      row.eur = cents(row.eur + s.eur);
      s.people.forEach((p) => row!.people.add(p));
      const prev = row.lines.get(a.id);
      row.lines.set(a.id, { assetId: a.id, name: a.name, eur: cents((prev?.eur ?? 0) + s.eur), method: s.method });
    }
    for (const u of res.unallocated) unallocated.push({ assetId: a.id, name: a.name, reason: u.reason, eur: u.eur });
  }

  for (const [service, eur] of Array.from(unmatched.entries())) {
    if (cents(eur) === 0) continue;
    unallocated.push({ assetId: null, name: service, reason: "Charges not matched to an AI", eur: cents(eur) });
    actualEur += cents(eur);
  }

  const cc = new Map(costCenters.map((c) => [c.department.toLowerCase(), c]));
  const out: ChargeRow[] = Array.from(rows.entries())
    .map(([k, r]) => {
      const c = cc.get(k);
      return {
        department: r.label,
        costCenter: c ? { code: c.code, name: c.name } : null,
        eur: r.eur,
        people: r.people.size,
        lines: Array.from(r.lines.values()).sort((x, y) => y.eur - x.eur),
      };
    })
    .sort((x, y) => y.eur - x.eur || x.department.localeCompare(y.department));
  unallocated.sort((x, y) => x.reason.localeCompare(y.reason) || y.eur - x.eur);

  const allocatedEur = cents(out.reduce((s, r) => s + r.eur, 0));
  const unallocatedEur = cents(unallocated.reduce((s, u) => s + u.eur, 0));
  return {
    month,
    from,
    to,
    rows: out,
    unallocated,
    allocatedEur,
    unallocatedEur,
    totalEur: cents(allocatedEur + unallocatedEur),
    actualEur: cents(actualEur),
    runRateEur: cents(runRateEur),
  };
}

export const METHOD_LABEL: Record<ChargeMethod, string> = {
  seats: "Seats used by the team",
  users: "Share of active users",
  "ai-department": "Department set on the AI",
};

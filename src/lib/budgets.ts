/**
 * Budget AI per reparto. La spesa mensile di ogni AI (monthlyOf) viene
 * ripartita tra i reparti in proporzione alle persone che la usano: nessun
 * numero inventato, solo il costo che già vediamo diviso per chi lo usa.
 */
import { db } from "@/lib/db";
import { monthlyOf } from "@/lib/savings";
import { createAlert } from "@/lib/alerts";

export const UNASSIGNED = "Unassigned";

export interface DepartmentSpend {
  department: string;
  monthlyEur: number;
  aiCount: number;
  people: number;
  topAi: { name: string; eur: number }[];
}

/** Mese corrente "aaaa-mm" (fuso di Roma, come il resto della piattaforma). */
export function monthKey(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}

export async function departmentSpend(organizationId: string): Promise<DepartmentSpend[]> {
  const assets = await db.aiAsset.findMany({
    // Stesso perimetro della spesa mostrata altrove (loadAssets): esclude le AI rifiutate.
    where: { organizationId, deletedAt: null, status: { not: "UNAPPROVED" } },
    include: {
      cost: true,
      usages: { select: { id: true, userId: true, externalUserRef: true, user: { select: { department: true } } } },
    },
  });

  const acc = new Map<string, { eur: number; ai: Map<string, { name: string; eur: number }>; people: Set<string> }>();
  const bucket = (d: string) => {
    let b = acc.get(d);
    if (!b) acc.set(d, (b = { eur: 0, ai: new Map(), people: new Set() }));
    return b;
  };

  for (const a of assets) {
    const m = monthlyOf(a);
    const eur = m && m.eur > 0 ? m.eur : 0;

    // Persone note per reparto (chi non ha reparto → "Unassigned").
    const byDept = new Map<string, Set<string>>();
    for (const u of a.usages) {
      const dept = u.user?.department?.trim() || UNASSIGNED;
      const key = u.userId ?? u.externalUserRef ?? u.id;
      if (!byDept.has(dept)) byDept.set(dept, new Set());
      byDept.get(dept)!.add(key);
    }
    const total = Array.from(byDept.values()).reduce((s, x) => s + x.size, 0);

    if (total === 0) {
      if (eur <= 0) continue;
      // Nessun utente noto: si usa il reparto dichiarato sull'AI, se c'è.
      const b = bucket(a.department?.trim() || UNASSIGNED);
      b.eur += eur;
      b.ai.set(a.id, { name: a.name, eur });
      continue;
    }

    for (const [dept, people] of Array.from(byDept.entries())) {
      const b = bucket(dept);
      people.forEach((p) => b.people.add(p));
      const share = (eur * people.size) / total;
      b.eur += share;
      const prev = b.ai.get(a.id);
      b.ai.set(a.id, { name: a.name, eur: (prev?.eur ?? 0) + share });
    }
  }

  return Array.from(acc.entries())
    .map(([department, b]) => ({
      department,
      monthlyEur: Math.round(b.eur * 100) / 100,
      aiCount: b.ai.size,
      people: b.people.size,
      topAi: Array.from(b.ai.values())
        .filter((x) => x.eur > 0)
        .sort((x, y) => y.eur - x.eur)
        .slice(0, 3)
        .map((x) => ({ name: x.name, eur: Math.round(x.eur * 100) / 100 })),
    }))
    .sort((x, y) => y.monthlyEur - x.monthlyEur || x.department.localeCompare(y.department));
}

export interface BudgetCheck {
  department: string;
  budgetEur: number;
  spendEur: number;
  pct: number;
  level: "ok" | "warning" | "critical";
  alerted: boolean;
}

/**
 * Confronta ogni budget con la spesa del mese: all'80% avviso "warning",
 * al 100% "critical" (link a /budgets). Gli avvisi sono unici per
 * reparto + mese + soglia, quindi si può chiamare ogni giorno senza doppioni.
 */
export async function checkBudgets(organizationId: string, now = new Date()): Promise<BudgetCheck[]> {
  const [budgets, spend] = await Promise.all([db.budget.findMany({ where: { organizationId } }), departmentSpend(organizationId)]);
  const month = monthKey(now);
  const out: BudgetCheck[] = [];
  for (const b of budgets) {
    if (!(b.monthlyEur > 0)) continue;
    const spent = spend.find((s) => s.department.toLowerCase() === b.department.toLowerCase())?.monthlyEur ?? 0;
    const pct = (spent / b.monthlyEur) * 100;
    const level = pct >= 100 ? "critical" : pct >= 80 ? "warning" : "ok";
    let alerted = false;
    const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");
    if (level === "critical") {
      alerted = await createAlert(organizationId, {
        kind: "budget",
        severity: "critical",
        title: `${b.department} is over its AI budget`,
        body: `${b.department} is spending ${eur(spent)} this month on AI, ${Math.round(pct)}% of its ${eur(b.monthlyEur)} budget.`,
        href: "/budgets",
        dedupeKey: `budget:${b.department}:${month}:100`,
      });
    } else if (level === "warning") {
      alerted = await createAlert(organizationId, {
        kind: "budget",
        severity: "warning",
        title: `${b.department} has used ${Math.round(pct)}% of its AI budget`,
        body: `${b.department} is spending ${eur(spent)} this month on AI, out of a ${eur(b.monthlyEur)} budget.`,
        href: "/budgets",
        dedupeKey: `budget:${b.department}:${month}:80`,
      });
    }
    out.push({ department: b.department, budgetEur: b.monthlyEur, spendEur: spent, pct, level, alerted });
  }
  return out;
}

// ── Valore per team: spesa AI, persone attive vs posti, verdetto ──────────

/**
 * Una persona (o un posto) su un'AI: la riga base del "Value by team".
 * `person` null = costo senza persone note (reparto dichiarato sull'AI).
 */
export interface TeamValueRow {
  person: string | null;
  department: string | null;
  /** Quota del costo mensile dell'AI che porta questa riga. */
  eur: number;
  /** Strumento a posti (licenza per persona). */
  seat: boolean;
  /** Usata negli ultimi 30 giorni (stessa definizione di Usage e Savings). */
  active: boolean;
}

export type TeamVerdict = "high" | "fair" | "under" | "idle" | "none";

export interface TeamValue {
  department: string;
  merged: boolean;
  monthlyEur: number;
  people: number;
  activePeople: number;
  seats: number;
  activeSeats: number;
  /** Posti usati / posti (se a posti), altrimenti persone attive / persone. 0..1, null senza persone. */
  utilisation: number | null;
  /** Spesa / persone attive (null senza persone attive). */
  eurEachActive: number | null;
  /** Costo dei posti non usati da 30 giorni. */
  idleEur: number;
  verdict: TeamVerdict;
}

/** Soglie del verdetto (utilizzo). */
export const TEAM_VALUE = { high: 0.75, fair: 0.5, minIdleEur: 1 } as const;

export function teamVerdict(t: Pick<TeamValue, "monthlyEur" | "utilisation" | "idleEur" | "activePeople">): TeamVerdict {
  if (t.monthlyEur <= 0 || t.utilisation == null) return "none";
  if (t.activePeople === 0) return "idle";
  if (t.utilisation >= TEAM_VALUE.high) return "high";
  if (t.utilisation < TEAM_VALUE.fair && t.idleEur >= TEAM_VALUE.minIdleEur) return "under";
  return "fair";
}

/**
 * Righe → team, con il k-anonimato di privacy.ts (gruppi sotto MIN_GROUP
 * persone uniti in "Other (small teams)"). Pura: nessun nome esce da qui.
 */
export function computeTeamValue(rows: TeamValueRow[], group: <T>(rows: T[], personOf: (r: T) => string | null | undefined, departmentOf: (r: T) => string | null | undefined) => { department: string; merged: boolean; suppressed: boolean; rows: T[] }[]): { teams: TeamValue[]; suppressed: boolean } {
  const groups = group(rows, (r) => r.person, (r) => r.department);
  if (groups.length === 1 && groups[0].suppressed) return { teams: [], suppressed: true };
  const teams = groups.map((g) => {
    const people = new Set<string>();
    const active = new Set<string>();
    let eur = 0;
    let seats = 0;
    let activeSeats = 0;
    let idleEur = 0;
    for (const r of g.rows) {
      eur += r.eur;
      if (r.person) {
        people.add(r.person);
        if (r.active) active.add(r.person);
      }
      if (r.seat && r.person) {
        seats++;
        if (r.active) activeSeats++;
        else idleEur += r.eur;
      }
    }
    const utilisation = seats > 0 ? activeSeats / seats : people.size > 0 ? active.size / people.size : null;
    const t = {
      department: g.department,
      merged: g.merged,
      monthlyEur: Math.round(eur * 100) / 100,
      people: people.size,
      activePeople: active.size,
      seats,
      activeSeats,
      utilisation,
      eurEachActive: active.size > 0 ? Math.round((eur / active.size) * 100) / 100 : null,
      idleEur: Math.round(idleEur * 100) / 100,
    };
    return { ...t, verdict: teamVerdict(t) };
  });
  teams.sort((a, b) => Number(a.merged) - Number(b.merged) || b.monthlyEur - a.monthlyEur || a.department.localeCompare(b.department));
  return { teams, suppressed: false };
}

/**
 * Dal database: ogni AI non rifiutata, il suo costo mensile diviso per chi la
 * ha (a posti: costo / max(posti, persone); condivisa: costo / persone). I
 * posti pagati senza persona non vanno a nessun team (li mostra Chargeback).
 */
export async function teamValue(organizationId: string, now = new Date()) {
  const [{ isPerSeat }, { groupByDepartment }, { SEAT_WINDOW_DAYS }] = await Promise.all([import("@/lib/chargeback"), import("@/lib/privacy"), import("@/lib/seats")]);
  const cutoff = now.getTime() - SEAT_WINDOW_DAYS * 86400000;
  const assets = await db.aiAsset.findMany({
    where: { organizationId, deletedAt: null, status: { not: "UNAPPROVED" } },
    select: {
      id: true,
      name: true,
      vendor: true,
      type: true,
      serviceId: true,
      department: true,
      cost: true,
      usages: { select: { id: true, userId: true, externalUserRef: true, lastSeenAt: true, user: { select: { department: true } } } },
    },
  });
  const rows: TeamValueRow[] = [];
  let unassignedSeatsEur = 0;
  for (const a of assets) {
    const m = monthlyOf(a);
    const eur = m && m.eur > 0 ? m.eur : 0;
    if (eur <= 0) continue;
    if (a.usages.length === 0) {
      if (a.department?.trim()) rows.push({ person: null, department: a.department.trim(), eur, seat: false, active: false });
      continue;
    }
    const seat = isPerSeat(a);
    const units = seat ? Math.max(a.cost?.seats ?? 0, a.usages.length) : a.usages.length;
    const each = eur / units;
    if (seat && units > a.usages.length) unassignedSeatsEur += each * (units - a.usages.length);
    for (const u of a.usages) {
      rows.push({
        person: u.userId ?? u.externalUserRef ?? u.id,
        department: u.user?.department ?? null,
        eur: each,
        seat,
        active: !!u.lastSeenAt && u.lastSeenAt.getTime() >= cutoff,
      });
    }
  }
  return { ...computeTeamValue(rows, groupByDepartment), unassignedSeatsEur: Math.round(unassignedSeatsEur * 100) / 100 };
}

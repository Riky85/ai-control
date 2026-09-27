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

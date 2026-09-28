/**
 * Gruppi societari (holding): vista consolidata di più workspace. Come la
 * console partner, si vedono SOLO i workspace in cui l'utente è membro attivo
 * con ruolo OWNER o ADMIN — mai altri, anche se fanno parte dello stesso gruppo.
 */
import { db } from "@/lib/db";
import { computeSavings, monthlyOf } from "@/lib/savings";
import { savedSoFar } from "@/lib/savings-ledger";
import { departmentSpend } from "@/lib/budgets";
import { computeChargeback } from "@/lib/chargeback";

const ADMIN_ROLES = ["OWNER", "ADMIN"] as const;

/** Workspace dove l'utente è OWNER/ADMIN attivo (con il gruppo di appartenenza). */
export async function adminWorkspaces(email: string) {
  return db.organization.findMany({
    where: { members: { some: { email, status: "active", role: { in: [...ADMIN_ROLES] } } } },
    select: { id: true, name: true, country: true, groupId: true, group: { select: { id: true, name: true, createdBy: true } } },
    orderBy: { name: "asc" },
  });
}

/** Gruppi visibili all'utente: quelli che contengono almeno un suo workspace da admin. */
export async function myGroups(email: string) {
  const orgs = await adminWorkspaces(email);
  const groups = new Map<string, { id: string; name: string; createdBy: string; entities: { id: string; name: string; country: string | null }[] }>();
  for (const o of orgs) {
    if (!o.group) continue;
    if (!groups.has(o.group.id)) groups.set(o.group.id, { ...o.group, entities: [] });
    groups.get(o.group.id)!.entities.push({ id: o.id, name: o.name, country: o.country });
  }
  return { orgs, groups: Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name)) };
}

/** Il gruppo, solo se l'utente ne amministra almeno un workspace */
export async function groupForUser(email: string, groupId: string) {
  const { orgs, groups } = await myGroups(email);
  return { group: groups.find((g) => g.id === groupId) ?? null, orgs };
}

export interface EntityRow {
  id: string;
  name: string;
  country: string | null;
  aiCount: number;
  monthlySpend: number;
  canSave: number;
  savedMonthly: number;
  budget: number;
  budgetSpend: number;
  teamsOver: number;
}

/** Numeri per società (solo quelle passate, già filtrate per accesso). */
export async function entityRows(entities: { id: string; name: string; country: string | null }[]): Promise<EntityRow[]> {
  const rows = await Promise.all(
    entities.map(async (e) => {
      const [{ assets, totalMonthly }, saved, budgets, spend] = await Promise.all([
        computeSavings(e.id),
        savedSoFar(e.id).catch(() => null),
        db.budget.findMany({ where: { organizationId: e.id } }),
        departmentSpend(e.id),
      ]);
      const budget = budgets.reduce((s, b) => s + b.monthlyEur, 0);
      let budgetSpend = 0;
      let teamsOver = 0;
      for (const b of budgets) {
        const spent = spend.find((x) => x.department.toLowerCase() === b.department.toLowerCase())?.monthlyEur ?? 0;
        budgetSpend += spent;
        if (b.monthlyEur > 0 && spent > b.monthlyEur) teamsOver++;
      }
      return {
        id: e.id,
        name: e.name,
        country: e.country,
        aiCount: assets.length,
        monthlySpend: assets.reduce((t, a) => t + (monthlyOf(a)?.eur ?? 0), 0),
        canSave: totalMonthly,
        savedMonthly: saved?.savedMonthly ?? 0,
        budget,
        budgetSpend,
        teamsOver,
      } satisfies EntityRow;
    })
  );
  return rows.sort((a, b) => b.monthlySpend - a.monthlySpend || a.name.localeCompare(b.name));
}

/** Chargeback intercompany: costo AI del mese per società. */
export async function intercompany(entities: { id: string; name: string; country: string | null }[], month: string) {
  const rows = await Promise.all(
    entities.map(async (e) => {
      const cb = await computeChargeback(e.id, month);
      return { id: e.id, name: e.name, country: e.country, eur: cb?.totalEur ?? 0, actualEur: cb?.actualEur ?? 0, runRateEur: cb?.runRateEur ?? 0 };
    })
  );
  return rows.sort((a, b) => b.eur - a.eur || a.name.localeCompare(b.name));
}

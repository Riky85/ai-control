"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { checkBudgets } from "@/lib/budgets";

const BACK = "/budgets";

function parseEur(v: FormDataEntryValue | null): number | null {
  let s = String(v ?? "").replace(/[€\s]/g, "");
  // "1.500" o "1.500,50" (formato europeo): i punti sono migliaia.
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "");
  s = s.replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** Imposta (o toglie, se vuoto/0) il budget mensile di un reparto. */
export async function setBudgetAction(formData: FormData) {
  const s = await requireRole("EDITOR", BACK);
  const department = String(formData.get("department") ?? "").trim().slice(0, 100);
  if (!department) redirect(`${BACK}?error=${encodeURIComponent("Enter a team name.")}`);
  const monthlyEur = parseEur(formData.get("monthlyEur"));
  if (monthlyEur === null) redirect(`${BACK}?error=${encodeURIComponent("Enter the budget as a number of euros, e.g. 1500.")}`);

  if (!monthlyEur) {
    await db.budget.deleteMany({ where: { organizationId: s.orgId, department } });
    await audit("budget.delete", department);
  } else {
    await db.budget.upsert({
      where: { organizationId_department: { organizationId: s.orgId, department } },
      update: { monthlyEur },
      create: { organizationId: s.orgId, department, monthlyEur },
    });
    await audit("budget.set", department, { monthlyEur });
    // Se il nuovo budget è già superato, l'avviso arriva subito (non domani).
    await checkBudgets(s.orgId).catch(() => {});
  }
  revalidatePath(BACK);
}

export async function deleteBudgetAction(formData: FormData) {
  const s = await requireRole("EDITOR", BACK);
  const department = String(formData.get("department") ?? "").trim();
  if (department) {
    await db.budget.deleteMany({ where: { organizationId: s.orgId, department } });
    await audit("budget.delete", department);
  }
  revalidatePath(BACK);
}

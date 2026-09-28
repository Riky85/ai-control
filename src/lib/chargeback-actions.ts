"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

const back = (month: string) => `/budgets?view=chargeback${/^\d{4}-\d{2}$/.test(month) ? `&month=${month}` : ""}`;
const clean = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

/** Codice (e nome) del centro di costo di un reparto. Codice vuoto = rimuove. */
export async function setCostCenterAction(formData: FormData) {
  const month = clean(formData.get("month"), 7);
  const s = await requireRole("EDITOR", back(month));
  const department = clean(formData.get("department"), 100);
  const code = clean(formData.get("code"), 36);
  const name = clean(formData.get("name"), 100) || null;
  if (!department) redirect(`${back(month)}&error=${encodeURIComponent("Choose a department.")}`);
  if (code && !/^[\p{L}\p{N} ._\-/]+$/u.test(code)) redirect(`${back(month)}&error=${encodeURIComponent("Use letters, numbers, spaces, dots, dashes or slashes in the cost centre code.")}`);

  if (!code) {
    await db.costCenter.deleteMany({ where: { organizationId: s.orgId, department: { equals: department, mode: "insensitive" } } });
    await audit("costcenter.delete", department);
  } else {
    // Un solo centro di costo per reparto, ignorando le maiuscole.
    const existing = await db.costCenter.findFirst({ where: { organizationId: s.orgId, department: { equals: department, mode: "insensitive" } } });
    if (existing) await db.costCenter.update({ where: { id: existing.id }, data: { code, name } });
    else await db.costCenter.create({ data: { organizationId: s.orgId, department, code, name } });
    await audit("costcenter.set", department, { code, name });
  }
  revalidatePath("/budgets");
  redirect(back(month));
}

const account = (v: FormDataEntryValue | null) => {
  const s = clean(v, 20);
  return s || null;
};

/** Conti per gli export DATEV / TeamSystem. */
export async function setAccountingSettingsAction(formData: FormData) {
  const month = clean(formData.get("month"), 7);
  const s = await requireRole("ADMIN", back(month));
  const data = {
    expenseAccount: account(formData.get("expenseAccount")),
    clearingAccount: account(formData.get("clearingAccount")),
    datevConsultant: account(formData.get("datevConsultant")),
    datevClient: account(formData.get("datevClient")),
  };
  for (const [k, v] of Object.entries(data)) {
    if (v && !/^[A-Za-z0-9.\-]+$/.test(v)) redirect(`${back(month)}&error=${encodeURIComponent(`${k === "expenseAccount" ? "Expense account" : k === "clearingAccount" ? "Clearing account" : k === "datevConsultant" ? "DATEV consultant number" : "DATEV client number"}: use digits only.`)}`);
  }
  await db.accountingSettings.upsert({ where: { organizationId: s.orgId }, update: data, create: { organizationId: s.orgId, ...data } });
  await audit("accounting.settings", s.orgId, data);
  revalidatePath("/budgets");
  redirect(`${back(month)}&saved=accounts`);
}

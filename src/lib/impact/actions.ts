"use server";

/**
 * Impact Simulator: salvare e togliere uno scenario (solo la query dell'URL).
 * Serve almeno il ruolo editor; ogni azione nel registro di audit.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseScenario, scenarioQuery } from "./params";

const str = (f: FormData, k: string, max = 120) => String(f.get(k) ?? "").trim().slice(0, max);

export async function saveScenarioAction(f: FormData) {
  const raw = str(f, "query", 600);
  const back = `/impact?${raw}`;
  const s = await requireRole("EDITOR", back);
  // Si salva solo una query valida, riscritta in forma stabile.
  const { scenario } = parseScenario(Object.fromEntries(new URLSearchParams(raw)));
  if (!scenario) redirect(`/impact?error=${encodeURIComponent("Run a complete scenario first.")}`);
  const query = scenarioQuery(scenario);
  const name = str(f, "name", 80) || str(f, "title", 80) || "Scenario";
  try {
    const row = await db.impactScenario.create({ data: { organizationId: s.orgId, name, query, createdBy: s.email } });
    await audit("impact.scenario.save", row.id, { name, query });
  } catch {
    redirect(`/impact?${query}&error=${encodeURIComponent("Could not save the scenario.")}`);
  }
  revalidatePath("/impact");
  redirect(`/impact?${query}&saved=scenario`);
}

export async function deleteScenarioAction(f: FormData) {
  const id = str(f, "id", 40);
  const s = await requireRole("EDITOR", "/impact");
  await db.impactScenario.deleteMany({ where: { id, organizationId: s.orgId } });
  await audit("impact.scenario.delete", id);
  revalidatePath("/impact");
  redirect("/impact");
}

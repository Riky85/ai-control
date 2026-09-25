"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { seedDemoData } from "@/lib/demo-data";

/**
 * Svuota i dati del workspace corrente per ripartire da zero nei test.
 * Restano: account, membri, abbonamento, link condivisi, registro di audit.
 * Conferma obbligatoria scrivendo il nome esatto del workspace.
 */
export async function resetWorkspaceDataAction(formData: FormData) {
  const s = await requireRole("OWNER", "/settings");
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.orgId } });
  if (String(formData.get("confirm") ?? "").trim() !== org.name) {
    redirect(`/settings?error=${encodeURIComponent(`Type the workspace name exactly ("${org.name}") to confirm the reset.`)}#test-data`);
  }
  const where = { organizationId: s.orgId };
  const counts = await db.$transaction(async (tx) => {
    // I sistemi AI portano con sé (cascade) costi, alternative, rischio,
    // assurance, attività, cambiamenti, utilizzi e dipendenze.
    const assets = await tx.aiAsset.deleteMany({ where });
    const data = await tx.dataAsset.deleteMany({ where });
    const people = await tx.user.deleteMany({ where });
    const policies = await tx.policy.deleteMany({ where });
    const evidence = await tx.evidence.deleteMany({ where });
    const connectors = await tx.connector.deleteMany({ where });
    await tx.organization.update({ where: { id: s.orgId }, data: { onboardingCompletedAt: null } });
    return { assets: assets.count, data: data.count, people: people.count, policies: policies.count, evidence: evidence.count, connectors: connectors.count };
  });
  await audit("workspace.reset_data", org.name, counts);
  revalidatePath("/", "layout");
  redirect("/settings?reset=1#test-data");
}

/** Carica i dati di esempio nel workspace corrente. */
export async function loadDemoDataAction(formData?: FormData) {
  const s = await requireRole("OWNER", "/settings");
  await seedDemoData(db, s.orgId);
  await db.organization.update({ where: { id: s.orgId }, data: { onboardingCompletedAt: new Date() } });
  await audit("workspace.load_demo_data");
  revalidatePath("/", "layout");
  redirect(formData?.get("next") === "review" ? "/review?from=demo" : "/?demo=1");
}

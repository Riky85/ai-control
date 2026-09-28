"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/plan-gate";
import { audit } from "@/lib/audit";

const BACK = "/partner";
const fail = (msg: string): never => redirect(`${BACK}?error=${encodeURIComponent(msg)}`);

/**
 * Segna (o toglie) un workspace cliente come "gestito da me". L'identificativo
 * del partner è il workspace corrente della sessione (il workspace dello MSP).
 * Serve essere ADMIN+ nel workspace del partner e OWNER/ADMIN attivo nel
 * workspace cliente: mai workspace di cui l'utente non è membro.
 */
export async function setManagedByMeAction(formData: FormData) {
  const s = await requireRole("ADMIN", BACK);
  await requireFeature("partnerConsole", BACK);
  const clientId = String(formData.get("orgId") ?? "");
  const managed = String(formData.get("managed") ?? "") === "1";
  const view = String(formData.get("view") ?? "") === "fleet" ? "fleet" : "clients";
  if (!clientId) fail("Choose a client workspace.");
  if (clientId === s.orgId) fail("This is your own partner workspace — switch to it to manage clients, don't mark it as a client.");

  const member = await db.workspaceMember.findUnique({
    where: {
      organizationId_email: { organizationId: clientId, email: s.email },
    },
    select: { role: true, status: true },
  });
  if (!member || member.status !== "active") fail("You're not a member of that workspace.");
  if (member!.role !== "OWNER" && member!.role !== "ADMIN") fail("You need to be an owner or admin in the client workspace to mark it as managed.");

  const org = await db.organization.findUnique({
    where: { id: clientId },
    select: { name: true, managedByPartnerId: true },
  });
  if (!org) fail("Workspace not found.");

  if (managed) {
    if (org!.managedByPartnerId && org!.managedByPartnerId !== s.orgId) fail(`${org!.name} is already managed by another partner. They need to release it first.`);
    if (org!.managedByPartnerId === s.orgId) redirect(`${BACK}?view=${view}`);
    await db.organization.update({
      where: { id: clientId },
      data: { managedByPartnerId: s.orgId },
    });
  } else {
    if (org!.managedByPartnerId !== s.orgId) fail(`${org!.name} isn't managed by this partner workspace.`);
    await db.organization.update({
      where: { id: clientId },
      data: { managedByPartnerId: null },
    });
  }

  // Traccia in entrambi i registri: quello del cliente (chi lo gestisce) e quello del partner.
  const action = managed ? "partner.manage" : "partner.unmanage";
  await audit(action, clientId, { partnerOrgId: s.orgId, client: org!.name }, { orgId: clientId });
  await audit(action, clientId, { client: org!.name }, { orgId: s.orgId });
  revalidatePath(BACK);
  redirect(`${BACK}?view=${view}`);
}

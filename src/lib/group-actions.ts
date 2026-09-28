"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentSession, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { myGroups } from "@/lib/groups";

const BACK = "/group";
const fail = (msg: string, groupId?: string): never => redirect(`${BACK}?${groupId ? `id=${encodeURIComponent(groupId)}&` : ""}error=${encodeURIComponent(msg)}`);
const clean = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

/** Sessione + membro attivo OWNER/ADMIN del workspace indicato (dal database, mai dal form). */
async function adminOf(email: string, orgId: string) {
  const m = await db.workspaceMember.findUnique({ where: { organizationId_email: { organizationId: orgId, email } }, select: { role: true, status: true } });
  return !!m && m.status === "active" && (m.role === "OWNER" || m.role === "ADMIN");
}

/** Crea un gruppo e ci mette il workspace corrente. */
export async function createGroupAction(formData: FormData) {
  const s = await requireRole("ADMIN", BACK);
  const name = clean(formData.get("name"), 100);
  if (!name) fail("Give the group a name.");
  const org = await db.organization.findUnique({ where: { id: s.orgId }, select: { groupId: true, name: true } });
  if (org?.groupId) fail(`${org.name} is already in a group — remove it there first.`, org.groupId);
  const group = await db.orgGroup.create({ data: { name, createdBy: s.email } });
  await db.organization.update({ where: { id: s.orgId }, data: { groupId: group.id } });
  await audit("group.create", group.id, { name });
  revalidatePath(BACK);
  redirect(`${BACK}?id=${group.id}`);
}

/** Aggiunge un workspace (di cui l'utente è OWNER/ADMIN) a un gruppo che l'utente vede già. */
export async function addToGroupAction(formData: FormData) {
  const s = currentSession();
  if (!s) redirect("/login");
  const groupId = clean(formData.get("groupId"), 40);
  const orgId = clean(formData.get("orgId"), 40);
  const { groups } = await myGroups(s!.email);
  const group = groups.find((g) => g.id === groupId);
  if (!group) fail("Group not found.");
  if (!orgId || !(await adminOf(s!.email, orgId))) fail("You need to be an owner or admin of that workspace.", groupId);
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { name: true, groupId: true } });
  if (!org) fail("Workspace not found.", groupId);
  if (org!.groupId === groupId) redirect(`${BACK}?id=${groupId}`);
  if (org!.groupId) fail(`${org!.name} is already in another group — remove it there first.`, groupId);
  await db.organization.update({ where: { id: orgId }, data: { groupId } });
  await audit("group.add", groupId, { group: group!.name, workspace: org!.name }, { orgId });
  revalidatePath(BACK);
  redirect(`${BACK}?id=${groupId}`);
}

/** Toglie un workspace dal gruppo; un gruppo rimasto vuoto viene cancellato. */
export async function removeFromGroupAction(formData: FormData) {
  const s = currentSession();
  if (!s) redirect("/login");
  const groupId = clean(formData.get("groupId"), 40);
  const orgId = clean(formData.get("orgId"), 40);
  if (!orgId || !(await adminOf(s!.email, orgId))) fail("You need to be an owner or admin of that workspace.", groupId);
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { name: true, groupId: true } });
  if (!org || org.groupId !== groupId) fail("That workspace isn't in this group.", groupId);
  await db.organization.update({ where: { id: orgId }, data: { groupId: null } });
  await audit("group.remove", groupId, { workspace: org!.name }, { orgId });
  const left = await db.organization.count({ where: { groupId } });
  if (left === 0) await db.orgGroup.deleteMany({ where: { id: groupId } });
  revalidatePath(BACK);
  redirect(left === 0 ? BACK : `${BACK}?id=${groupId}`);
}

export async function renameGroupAction(formData: FormData) {
  const s = currentSession();
  if (!s) redirect("/login");
  const groupId = clean(formData.get("groupId"), 40);
  const name = clean(formData.get("name"), 100);
  const { groups } = await myGroups(s!.email);
  if (!groups.some((g) => g.id === groupId)) fail("Group not found.");
  if (!name) fail("Give the group a name.", groupId);
  await db.orgGroup.update({ where: { id: groupId }, data: { name } });
  await audit("group.rename", groupId, { name });
  revalidatePath(BACK);
  redirect(`${BACK}?id=${groupId}`);
}

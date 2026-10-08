"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { approveTask, dismissTask, retryTask, markStepDone, syncAutopilot, isMode } from "@/lib/engine/autopilot";

// L'Autopilot è una scheda di Opportunities (prima su /savings).
const PATH = "/opportunities";
const fail = (m: string) => redirect(`${PATH}?view=autopilot&error=${encodeURIComponent(m)}`);

/** Il piano esiste ed è di questa azienda (mai fidarsi dell'id del form). */
async function ownTask(orgId: string, formData: FormData) {
  const id = String(formData.get("id") ?? "").slice(0, 64);
  const task = id ? await db.autopilotTask.findFirst({ where: { id, organizationId: orgId }, select: { id: true } }) : null;
  if (!task) fail("That plan isn't there any more.");
  return task!.id;
}

const done = () => {
  revalidatePath(PATH);
  revalidatePath("/", "layout");
};

/** Approva: registro dei risparmi + passi automatici subito. */
export async function approveAutopilotAction(formData: FormData) {
  const s = await requireRole("EDITOR", PATH);
  const id = await ownTask(s.orgId, formData);
  const r = await approveTask(s.orgId, id, s.email);
  done();
  if (!r.ok) fail(r.error);
}

/** "Not for us". */
export async function dismissAutopilotAction(formData: FormData) {
  const s = await requireRole("EDITOR", PATH);
  const id = await ownTask(s.orgId, formData);
  await dismissTask(s.orgId, id, s.email);
  done();
}

/** Riprova un piano fermo. */
export async function retryAutopilotAction(formData: FormData) {
  const s = await requireRole("EDITOR", PATH);
  const id = await ownTask(s.orgId, formData);
  await retryTask(s.orgId, id, s.email);
  done();
}

/** Passo della persona fatto. */
export async function markAutopilotStepAction(formData: FormData) {
  const s = await requireRole("EDITOR", PATH);
  const id = await ownTask(s.orgId, formData);
  const index = Number(formData.get("step"));
  if (!Number.isInteger(index) || index < 0 || index > 50) fail("Unknown step.");
  await markStepDone(s.orgId, id, index, s.email);
  done();
}

/** Modalità: Off / Ask me / Automatic (solo admin). */
export async function setAutopilotModeAction(formData: FormData) {
  const s = await requireRole("ADMIN", PATH);
  const mode = String(formData.get("mode") ?? "");
  if (!isMode(mode)) fail("Unknown mode.");
  await db.organization.update({ where: { id: s.orgId }, data: { autopilotMode: mode } });
  await audit("autopilot.mode", mode);
  // Accesa: i piani compaiono subito, senza aspettare il lavoro della notte.
  if (mode !== "off") await syncAutopilot(s.orgId).catch((err) => console.error("[autopilot] sync failed", err));
  done();
}

"use server";

/**
 * AI Estate: dichiarare processi e applicazioni, collegarli agli AI system, confermare o
 * rifiutare gli archi dedotti, scrivere i requisiti e registrare una prova. Solo admin,
 * ogni azione nel registro di audit.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

const CRIT = ["low", "medium", "high", "critical"];
const CAPS = ["toolCalling", "structuredOutput", "mcp", "reasoning", "streaming", "caching", "batch", "embeddings", "fineTuning", "vision", "audio"];

const str = (f: FormData, k: string, max = 120) => String(f.get(k) ?? "").trim().slice(0, max);
const safeBack = (f: FormData) => {
  const b = str(f, "back", 300);
  return b.startsWith("/") && !b.startsWith("//") ? b : "/";
};
const withMsg = (back: string, k: string, v: string) => `${back}${back.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(v)}`;

export async function createProcessAction(f: FormData) {
  const back = safeBack(f);
  const s = await requireRole("ADMIN", back);
  const name = str(f, "name");
  const criticality = CRIT.includes(str(f, "criticality")) ? str(f, "criticality") : "medium";
  if (!name) redirect(withMsg(back, "error", "Give the process a name."));
  const p = await db.businessProcess.upsert({ where: { organizationId_name: { organizationId: s.orgId, name } }, update: { criticality }, create: { organizationId: s.orgId, name, criticality, createdBy: s.email } });
  await linkIfAsked(s.orgId, s.email, f, "process", p.id);
  await audit("estate.process.save", p.id, { name, criticality });
  revalidatePath(back.split("?")[0]);
  redirect(withMsg(back, "saved", "estate"));
}

export async function createApplicationAction(f: FormData) {
  const back = safeBack(f);
  const s = await requireRole("ADMIN", back);
  const name = str(f, "name");
  if (!name) redirect(withMsg(back, "error", "Give the application a name."));
  const app = await db.application.create({ data: { organizationId: s.orgId, name, vendor: str(f, "vendor") || null, kind: str(f, "kind") === "saas" ? "saas" : "internal", source: "declared", createdBy: s.email } });
  await linkIfAsked(s.orgId, s.email, f, "application", app.id);
  await audit("estate.application.create", app.id, { name });
  revalidatePath(back.split("?")[0]);
  redirect(withMsg(back, "saved", "estate"));
}

/** Collega un processo o un'applicazione esistente a un AI system (o un processo a un'applicazione). */
export async function linkDependencyAction(f: FormData) {
  const back = safeBack(f);
  const s = await requireRole("ADMIN", back);
  const [fromType, fromId] = str(f, "from", 80).split(":");
  if (!["process", "application"].includes(fromType) || !fromId) redirect(withMsg(back, "error", "Choose what depends on it."));
  const ok = fromType === "process" ? await db.businessProcess.findFirst({ where: { id: fromId, organizationId: s.orgId } }) : await db.application.findFirst({ where: { id: fromId, organizationId: s.orgId } });
  if (!ok) redirect(withMsg(back, "error", "Not found."));
  await linkIfAsked(s.orgId, s.email, f, fromType as "process" | "application", fromId);
  revalidatePath(back.split("?")[0]);
  redirect(withMsg(back, "saved", "estate"));
}

async function linkIfAsked(orgId: string, email: string, f: FormData, fromType: "process" | "application", fromId: string) {
  const [toType, toId] = str(f, "to", 80).split(":");
  if (!toId || !["system", "application"].includes(toType)) return;
  if (toType === fromType) return;
  const exists = toType === "system" ? await db.aiAsset.findFirst({ where: { id: toId, organizationId: orgId, deletedAt: null } }) : await db.application.findFirst({ where: { id: toId, organizationId: orgId } });
  if (!exists) return;
  const observedKey = `user|${fromType}:${fromId}|uses|${toType}:${toId}`;
  await db.dependency.upsert({
    where: { organizationId_observedKey: { organizationId: orgId, observedKey } },
    update: { status: "confirmed", reviewedBy: email, reviewedAt: new Date() },
    create: { organizationId: orgId, fromType, fromId, toType, toId, relation: "uses", source: "declared", origin: "user", confidence: "HIGH", evidence: { text: `Declared by ${email}` }, observedKey, createdBy: email },
  });
  await audit("estate.edge.declare", observedKey, { fromType, fromId, toType, toId });
}

/** Conferma o rifiuta un arco dedotto (o osservato), oppure toglie un arco dichiarato. */
export async function reviewEdgeAction(f: FormData) {
  const back = safeBack(f);
  const s = await requireRole("ADMIN", back);
  const id = str(f, "id", 40);
  const decision = str(f, "decision", 10);
  if (!["confirm", "reject"].includes(decision)) redirect(back);
  const data = { status: decision === "confirm" ? "confirmed" : "rejected", reviewedBy: s.email, reviewedAt: new Date() };
  if (str(f, "table", 20) === "model_use") {
    const r = await db.aiAssetModelUse.updateMany({ where: { id, organizationId: s.orgId }, data });
    if (r.count) await audit(`estate.model_use.${decision}`, id);
  } else {
    const dep = await db.dependency.findFirst({ where: { id, organizationId: s.orgId } });
    if (dep?.origin === "user" && decision === "reject") await db.dependency.delete({ where: { id } });
    else if (dep) await db.dependency.update({ where: { id }, data });
    if (dep) await audit(`estate.edge.${decision}`, id, { from: `${dep.fromType}:${dep.fromId}`, to: `${dep.toType}:${dep.toId}` });
  }
  revalidatePath(back.split("?")[0]);
  redirect(back);
}

/** Requisiti dichiarati di un AI system (rendono Replaceability più precisa). */
export async function saveProfileAction(f: FormData) {
  const back = safeBack(f);
  const s = await requireRole("ADMIN", back);
  const assetId = str(f, "assetId", 40);
  const asset = await db.aiAsset.findFirst({ where: { id: assetId, organizationId: s.orgId } });
  if (!asset) redirect(back);
  const required = f.getAll("required").map(String).filter((k) => CAPS.includes(k));
  const notRequired = f.getAll("notRequired").map(String).filter((k) => CAPS.includes(k) && !required.includes(k));
  const ctx = Number(str(f, "minContextK", 10));
  const tri = (k: string) => (str(f, k, 5) === "yes" ? true : str(f, k, 5) === "no" ? false : null);
  const data = {
    requiredCapabilities: required,
    notRequired,
    minContextTokens: Number.isFinite(ctx) && ctx > 0 ? Math.round(ctx * 1000) : null,
    providerSpecific: str(f, "providerSpecific", 300).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8),
    euResidencyRequired: tri("eu"),
    dataExport: tri("export"),
    updatedBy: s.email,
  };
  await db.aiSystemProfile.upsert({ where: { aiAssetId: assetId }, update: data, create: { aiAssetId: assetId, ...data } });
  await audit("estate.requirements.save", assetId, data);
  revalidatePath(back.split("?")[0]);
  redirect(withMsg(back, "saved", "estate"));
}

/** Registra una prova dell'alternativa (eval suite, pilota): i numeri li scrive la persona. */
export async function recordEvaluationAction(f: FormData) {
  const back = safeBack(f);
  const s = await requireRole("ADMIN", back);
  const assetId = str(f, "assetId", 40);
  const asset = await db.aiAsset.findFirst({ where: { id: assetId, organizationId: s.orgId } });
  const [candidateType, candidateId] = [str(f, "candidateType", 10), str(f, "candidateId", 80)];
  const tasks = Math.round(Number(str(f, "tasks", 8)));
  const rate = Number(str(f, "passRate", 6));
  if (!asset || !["model", "product"].includes(candidateType) || !candidateId || !(tasks > 0) || !(rate >= 0 && rate <= 100)) redirect(withMsg(back, "error", "Fill in the tasks tested and the pass rate."));
  const passed = str(f, "passed", 5) === "yes";
  await db.aiEvaluation.create({ data: { organizationId: s.orgId, aiAssetId: assetId, candidateType, candidateId, tasks, passRate: rate / 100, passed, method: str(f, "method", 40) || null, notes: str(f, "notes", 300) || null, createdBy: s.email } });
  await audit("estate.evaluation.record", assetId, { candidateType, candidateId, tasks, passRate: rate / 100, passed });
  revalidatePath(back.split("?")[0]);
  redirect(withMsg(back, "saved", "estate"));
}

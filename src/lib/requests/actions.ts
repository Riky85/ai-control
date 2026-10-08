"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { appUrl, createAlert } from "@/lib/alerts";
import { sendEmail } from "@/lib/mail";
import { planGate } from "@/lib/plan-gate";
import { assessAsset } from "@/lib/asset-assess";
import { assetForService } from "@/lib/spend/ingest";
import { aiHref } from "@/lib/links";
import { DATA_TYPES, parseRequestForm, type RequestStatus } from "./types";
import { matchService } from "./preview";

/**
 * Richieste di nuove AI: chiunque nel workspace (anche viewer) invia il modulo; admin e owner
 * decidono (approva → AI APPROVED nell'estate, rifiuta, chiedi informazioni). Chi ha chiesto
 * riceve un'email a ogni decisione. Ogni passaggio va nel registro di audit.
 */
const QUEUE = "/estate/requests";
const safeBack = (v: FormDataEntryValue | null) => {
  const b = String(v ?? "").slice(0, 200);
  return b === "/estate/requests/new" || b.startsWith("/estate/requests?") || b === QUEUE ? b : QUEUE;
};
const withParam = (path: string, k: string, v: string) => `${path}${path.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(v)}`;
const DAY = 86400000;

export async function submitRequestAction(formData: FormData) {
  const back = safeBack(formData.get("back"));
  const s = await requireRole("VIEWER", back);
  const parsed = parseRequestForm(formData);
  if (!parsed.ok) redirect(withParam(back, "error", parsed.error));
  const input = parsed.ok ? parsed.input : null!;
  // Un freno contro gli invii ripetuti: al massimo 20 richieste al giorno a persona.
  const recent = await db.aiRequest.count({ where: { organizationId: s.orgId, requesterEmail: s.email.toLowerCase(), createdAt: { gt: new Date(Date.now() - DAY) } } });
  if (recent >= 20) redirect(withParam(back, "error", "You've sent 20 requests today — wait for a decision on those first."));

  const r = await db.aiRequest.create({
    data: {
      organizationId: s.orgId,
      requesterEmail: s.email.toLowerCase(),
      name: input.name,
      vendor: input.vendor,
      url: input.url,
      purpose: input.purpose,
      team: input.team,
      expectedUsers: input.expectedUsers,
      dataTypes: input.dataTypes,
      estMonthlyEur: input.estMonthlyEur,
      status: "REQUESTED",
    },
  });
  await audit("ai_request.create", input.name, { requestId: r.id, dataTypes: input.dataTypes, expectedUsers: input.expectedUsers });
  // Avviso nella campanella degli amministratori (una volta sola per richiesta).
  await createAlert(s.orgId, {
    kind: "info",
    title: `New AI request: ${input.name}`,
    body: `${s.email} asked for ${input.name}${input.team ? ` (${input.team})` : ""}: ${input.purpose.slice(0, 200)}`,
    href: QUEUE,
    dedupeKey: `ai-request:${r.id}`,
  }).catch(() => false);
  revalidatePath(QUEUE);
  redirect(withParam(back === "/estate/requests/new" ? QUEUE : back, "sent", "1"));
}

const DECISIONS = { approve: "APPROVED", reject: "REJECTED", needs_info: "NEEDS_INFO" } as const satisfies Record<string, RequestStatus>;

/** AI dell'estate per una richiesta approvata: stesso servizio o stesso nome, altrimenti nuova. Sempre APPROVED. */
async function linkAsset(orgId: string, req: { name: string; vendor: string | null; url: string | null; team: string | null; requesterEmail: string; dataTypes: string[]; estMonthlyEur: number | null }) {
  const svc = matchService(req);
  let asset =
    (svc ? await db.aiAsset.findFirst({ where: { organizationId: orgId, deletedAt: null, serviceId: svc.id } }) : null) ??
    (await db.aiAsset.findFirst({ where: { organizationId: orgId, deletedAt: null, name: { equals: req.name, mode: "insensitive" } } }));
  let created = false;
  if (!asset) {
    const gate = await planGate(orgId, "aiSystems");
    if (!gate.ok) return { error: gate.message } as const;
    if (svc) {
      const r = await assetForService(orgId, svc.id);
      asset = r.asset;
      created = r.created;
    } else {
      asset = await db.aiAsset.create({
        data: { organizationId: orgId, name: req.name, vendor: req.vendor, type: "AI_APPLICATION", status: "APPROVED", firstSeenAt: new Date(), lastSeenAt: new Date() },
      });
      created = true;
    }
  }
  // Chi ha chiesto diventa responsabile se non ce n'è uno; il team come reparto.
  const owner = await db.user.upsert({
    where: { organizationId_email: { organizationId: orgId, email: req.requesterEmail } },
    update: {},
    create: { organizationId: orgId, email: req.requesterEmail },
  });
  await db.aiAsset.update({
    where: { id: asset.id },
    data: { status: "APPROVED", ...(asset.ownerId ? {} : { ownerId: owner.id }), ...(asset.department || !req.team ? {} : { department: req.team }) },
  });
  // Dati dichiarati → accessi ai dati (letti dal motore di rischio).
  for (const id of req.dataTypes) {
    const d = DATA_TYPES.find((x) => x.id === id);
    if (!d || d.id === "public") continue;
    const da = await db.dataAsset.upsert({
      where: { organizationId_name: { organizationId: orgId, name: d.label } },
      update: {},
      create: { organizationId: orgId, name: d.label, sensitivity: d.sensitivity },
    });
    await db.aiAssetDataAccess.upsert({ where: { aiAssetId_dataAssetId: { aiAssetId: asset.id, dataAssetId: da.id } }, update: {}, create: { aiAssetId: asset.id, dataAssetId: da.id } });
  }
  if (req.estMonthlyEur != null && req.estMonthlyEur > 0) {
    const cost = await db.aiSystemCost.findUnique({ where: { aiAssetId: asset.id }, select: { id: true } });
    if (!cost) await db.aiSystemCost.create({ data: { aiAssetId: asset.id, monthlyCostEstimate: req.estMonthlyEur, basis: "manual", confidence: "LOW", notes: "Estimate from the AI request" } });
  }
  await assessAsset(asset.id).catch((err) => console.error("[requests] assess failed", (err as Error).message));
  return { asset, created } as const;
}

export async function decideRequestAction(formData: FormData) {
  const back = safeBack(formData.get("back"));
  const s = await requireRole("ADMIN", back);
  const id = String(formData.get("id") ?? "").slice(0, 64);
  const decision = String(formData.get("decision") ?? "") as keyof typeof DECISIONS;
  const note = String(formData.get("note") ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, " ").trim().slice(0, 1000);
  if (!id || !(decision in DECISIONS)) redirect(withParam(back, "error", "Choose approve, reject or ask for more information."));
  if (decision !== "approve" && note.length < 3) redirect(withParam(back, "error", decision === "reject" ? "Add a short reason so the requester knows why." : "Say what information you need."));
  const to = DECISIONS[decision];

  const req = await db.aiRequest.findFirst({ where: { id, organizationId: s.orgId } });
  if (!req) redirect(withParam(back, "error", "That request isn't there any more."));
  // Presa in carico atomica: due amministratori che decidono insieme non creano due AI.
  const claimed = await db.aiRequest.updateMany({
    where: { id: req!.id, organizationId: s.orgId, status: { in: ["REQUESTED", "NEEDS_INFO"] } },
    data: { status: to, decidedBy: s.email, decidedAt: new Date(), decisionNote: note || null },
  });
  if (claimed.count === 0) redirect(withParam(back, "error", "Someone already decided on this request."));

  let assetId: string | null = null;
  let created = false;
  if (to === "APPROVED") {
    const revert = () => db.aiRequest.updateMany({ where: { id: req!.id, organizationId: s.orgId }, data: { status: req!.status, decidedBy: null, decidedAt: null, decisionNote: null } });
    let r: Awaited<ReturnType<typeof linkAsset>> | null = null;
    try {
      r = await linkAsset(s.orgId, req!);
    } catch (err) {
      console.error("[requests] approve failed", (err as Error).message);
    }
    if (!r || "error" in r) {
      await revert();
      redirect(withParam(back, "error", (r && "error" in r && r.error) || "The AI system couldn't be added — try again."));
    }
    assetId = r!.asset!.id;
    created = !!r!.created;
    await db.aiRequest.updateMany({ where: { id: req!.id, organizationId: s.orgId }, data: { aiAssetId: assetId } });
  }

  await audit(`ai_request.${decision}`, req!.name, { requestId: req!.id, requester: req!.requesterEmail, note: note || null, ...(assetId ? { assetId, created } : {}) });

  // Email a chi ha chiesto (se l'email è configurata). Mai bloccante.
  const link = assetId ? `${appUrl()}${aiHref(assetId)}` : `${appUrl()}/estate/requests`;
  const subject =
    to === "APPROVED" ? `Approved: you can use ${req!.name}` : to === "REJECTED" ? `Not approved: ${req!.name}` : `More information needed: ${req!.name}`;
  const lead =
    to === "APPROVED"
      ? `Good news — your request for ${req!.name} was approved by ${s.email}. You can start using it under the company's AI policy.`
      : to === "REJECTED"
        ? `Your request for ${req!.name} wasn't approved by ${s.email}.`
        : `${s.email} needs a bit more information about your request for ${req!.name} before deciding.`;
  const mail = await sendEmail({
    to: req!.requesterEmail,
    subject,
    text: `Hello,\n\n${lead}${note ? `\n\nNote: ${note}` : ""}\n\n${to === "NEEDS_INFO" ? "Reply to this person, or send a new request with the details: " : "Details: "}${to === "NEEDS_INFO" ? `${appUrl()}/estate/requests/new` : link}\n`,
  }).catch(() => ({ sent: false }));

  revalidatePath(QUEUE);
  revalidatePath("/estate");
  redirect(withParam(back, "decided", `${decision}${mail.sent ? "" : "-nomail"}`));
}

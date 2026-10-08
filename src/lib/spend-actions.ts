"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseSpendFile, type ParseResult } from "@/lib/spend/parse";
import { ingestSpend } from "@/lib/spend/ingest";

const MAX = 30 * 1024 * 1024;

/** Estratti conto e fatture: si leggono, si tengono solo le righe AI. */
export async function uploadSpendAction(formData: FormData) {
  const s = await requireRole("EDITOR", "/sources");
  const back = String(formData.get("back") ?? "/sources");
  const files = formData.getAll("file").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).size > 0);
  if (files.length === 0) redirect(`${back}?error=${encodeURIComponent("Choose a file first.")}`);
  let all: ParseResult = { charges: [], rowsRead: 0, periodStart: null, periodEnd: null, warnings: [] };
  for (const f of files) {
    if (f.size > MAX) {
      all.warnings.push(`${f.name}: larger than 30 MB, skipped.`);
      continue;
    }
    const r = await parseSpendFile(f.name, new Uint8Array(await f.arrayBuffer()));
    all = { charges: [...all.charges, ...r.charges], rowsRead: all.rowsRead + r.rowsRead, periodStart: r.periodStart ?? all.periodStart, periodEnd: r.periodEnd ?? all.periodEnd, warnings: [...all.warnings, ...r.warnings] };
  }
  if (all.charges.length === 0) {
    const why = all.warnings[0] ?? `Read ${all.rowsRead} rows — no AI subscriptions or AI invoices found.`;
    redirect(`${back}?error=${encodeURIComponent(why)}`);
  }
  const found = await ingestSpend(s.orgId, all);
  await audit("spend.upload", `${files.length} file(s), ${found.length} AI services`);
  revalidatePath("/", "layout");
  redirect(`/?spend=${found.length}`);
}

export async function dismissSavingAction(formData: FormData) {
  const s = await requireRole("EDITOR", "/opportunities");
  const key = String(formData.get("key") ?? "").slice(0, 500);
  if (key) {
    const { db } = await import("@/lib/db");
    await db.savingDismissal.upsert({ where: { organizationId_key: { organizationId: s.orgId, key } }, update: {}, create: { organizationId: s.orgId, key } });
  }
  revalidatePath("/", "layout");
}

export async function restoreSavingsAction() {
  const s = await requireRole("EDITOR", "/opportunities");
  const { db } = await import("@/lib/db");
  await db.savingDismissal.deleteMany({ where: { organizationId: s.orgId } });
  revalidatePath("/", "layout");
}

export async function sendReportNowAction() {
  const s = await requireRole("VIEWER", "/report");
  const { buildReport, reportText } = await import("@/lib/report");
  const { sendEmail, appOrigin } = await import("@/lib/mail");
  const r = await buildReport(s.orgId);
  const res = await sendEmail({ to: s.email, subject: `Your AI in ${r.month}`, text: reportText(r, appOrigin()) });
  redirect(res.sent ? "/report?sent=1" : `/report?error=${encodeURIComponent(res.reason ?? "Couldn't send the email.")}`);
}

/** Chiede a chi non usa un'AI da 30 giorni se il posto serve ancora (link personale tengo/libera). */
export async function remindInactiveAction(formData: FormData) {
  const s = await requireRole("EDITOR", "/");
  const { sendSeatReminders } = await import("@/lib/seats");
  const assetId = String(formData.get("assetId") ?? "");
  const r = await sendSeatReminders(s.orgId, assetId, s.email);
  await audit("seats.remind_inactive", assetId, { asked: r.asked, sent: r.sent });
  redirect(`/assets/${assetId}?tab=people&${r.sent ? `reminded=${r.sent}` : `error=${encodeURIComponent(r.reason || "Nobody to ask right now.")}`}`);
}

export async function setEmployeesAction(formData: FormData) {
  const s = await requireRole("ADMIN", "/settings");
  const { db } = await import("@/lib/db");
  const n = Math.round(Number(formData.get("employees")));
  await db.organization.update({ where: { id: s.orgId }, data: { employees: Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : null } });
  revalidatePath("/", "layout");
  redirect("/settings");
}

export async function syncFattureInCloudAction() {
  const s = await requireRole("EDITOR", "/sources");
  const { syncFattureInCloud } = await import("@/lib/connectors/fatture-in-cloud");
  try {
    const r = await syncFattureInCloud(s.orgId);
    revalidatePath("/", "layout");
    redirect(`/?spend=${r.services}`);
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;
    redirect(`/sources?error=${encodeURIComponent((err as Error).message)}`);
  }
}

export async function startBankAuthAction(formData: FormData) {
  const s = await requireRole("ADMIN", "/sources/bank");
  await (await import("@/lib/plan-gate")).requireFeature("connections", "/sources/bank", { provider: "BANK" });
  const { startBankAuth } = await import("@/lib/connectors/bank");
  const { signState } = await import("@/lib/oauth-state");
  const { appOrigin } = await import("@/lib/mail");
  const { headers } = await import("next/headers");
  const name = String(formData.get("name") ?? "");
  const country = String(formData.get("country") ?? "");
  let url = "";
  try {
    url = await startBankAuth({ name, country }, `${appOrigin(headers())}/api/connectors/bank/callback`, signState({ orgId: s.orgId, email: s.email }));
  } catch (err) {
    redirect(`/sources/bank?country=${country}&error=${encodeURIComponent((err as Error).message)}`);
  }
  redirect(url);
}

export async function syncBankAction() {
  const s = await requireRole("EDITOR", "/sources");
  const { syncBank } = await import("@/lib/connectors/bank");
  let services = 0;
  try {
    services = (await syncBank(s.orgId)).services;
  } catch (err) {
    redirect(`/sources?error=${encodeURIComponent((err as Error).message)}`);
  }
  revalidatePath("/", "layout");
  redirect(`/?spend=${services}`);
}

export async function syncAccountingAction() {
  const s = await requireRole("EDITOR", "/sources");
  const { syncAccounting } = await import("@/lib/connectors/chift");
  let services = 0;
  try {
    services = (await syncAccounting(s.orgId)).services;
  } catch (err) {
    redirect(`/sources?error=${encodeURIComponent((err as Error).message)}`);
  }
  revalidatePath("/", "layout");
  redirect(`/?spend=${services}`);
}

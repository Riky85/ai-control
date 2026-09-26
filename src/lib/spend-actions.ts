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
  const s = await requireRole("EDITOR", "/savings");
  const key = String(formData.get("key") ?? "").slice(0, 500);
  if (key) {
    const { db } = await import("@/lib/db");
    await db.savingDismissal.upsert({ where: { organizationId_key: { organizationId: s.orgId, key } }, update: {}, create: { organizationId: s.orgId, key } });
  }
  revalidatePath("/", "layout");
}

export async function restoreSavingsAction() {
  const s = await requireRole("EDITOR", "/savings");
  const { db } = await import("@/lib/db");
  await db.savingDismissal.deleteMany({ where: { organizationId: s.orgId } });
  revalidatePath("/", "layout");
}

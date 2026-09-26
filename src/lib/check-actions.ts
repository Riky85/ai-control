"use server";

import { parseSpendFile } from "@/lib/spend/parse";
import { summarize } from "@/lib/spend/parse";
import { quickReport } from "@/lib/spend/quick";

export type CheckResult =
  | { ok: true; rowsRead: number; months: number; report: ReturnType<typeof quickReport> }
  | { ok: false; error: string };

/** AI Spend Check pubblico: legge i file in memoria e non salva nulla. */
export async function checkSpendAction(formData: FormData): Promise<CheckResult> {
  const files = formData.getAll("file").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).size > 0);
  if (!files.length) return { ok: false, error: "Choose a file first." };
  if (files.reduce((t, f) => t + f.size, 0) > 15 * 1024 * 1024) return { ok: false, error: "Files are over 15 MB — export a shorter period." };
  const charges = [];
  let rows = 0;
  let start: Date | null = null;
  let end: Date | null = null;
  const warnings: string[] = [];
  for (const f of files.slice(0, 20)) {
    const r = await parseSpendFile(f.name, new Uint8Array(await f.arrayBuffer()));
    charges.push(...r.charges);
    rows += r.rowsRead;
    warnings.push(...r.warnings);
    if (r.periodStart && (!start || r.periodStart < start)) start = r.periodStart;
    if (r.periodEnd && (!end || r.periodEnd > end)) end = r.periodEnd;
  }
  if (!charges.length) return { ok: false, error: warnings[0] ?? `Read ${rows} rows — no AI subscriptions found in this file.` };
  const months = start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / (30.4 * 86400000))) : 1;
  return { ok: true, rowsRead: rows, months, report: quickReport(summarize(charges)) };
}

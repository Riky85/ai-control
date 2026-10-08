"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ingestSpend, serviceById } from "@/lib/spend/ingest";
import type { Charge, ParseResult } from "@/lib/spend/parse";
import { revalidateOrgSetup } from "@/lib/layout-data";

/** Limiti del passaggio Spend check → workspace (il dato arriva dal browser: mai fidarsi). */
const MAX_ROWS = 5000;
const MAX_TEXT = 200;
const MAX_AMOUNT = 10_000_000;
const OLDEST = Date.UTC(2015, 0, 1);

export type CheckImportResult = { ok: true; services: number; charges: number } | { ok: false; error: string };

/** Una riga dello snapshot del check, controllata campo per campo; null se non valida. */
function cleanCharge(raw: unknown): Charge | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const service = typeof r.service === "string" ? r.service.trim() : "";
  // Solo servizi del catalogo: niente AI con nomi arbitrari create dal browser.
  if (!service || service.length > MAX_TEXT || !serviceById(service)) return null;
  const amount = typeof r.amountEur === "number" ? r.amountEur : Number.NaN;
  if (!Number.isFinite(amount) || Math.abs(amount) > MAX_AMOUNT) return null;
  const dateRaw = typeof r.date === "string" ? r.date : "";
  if (!dateRaw || dateRaw.length > 40) return null;
  const date = new Date(dateRaw);
  const t = date.getTime();
  if (!Number.isFinite(t) || t < OLDEST || t > Date.now() + 2 * 86_400_000) return null;
  const description = typeof r.description === "string" ? r.description.slice(0, MAX_TEXT) : "";
  const seats = typeof r.seats === "number" && Number.isInteger(r.seats) && r.seats > 0 && r.seats <= 100_000 ? r.seats : undefined;
  // Fonte "check": addebiti arrivati dall'AI Spend Check pubblico (il tipo di Charge prevede bank/invoice).
  return { date, amountEur: Math.round(amount * 100) / 100, description, service, source: "check" as Charge["source"], ...(seats ? { seats } : {}) };
}

/**
 * Importa nel workspace gli addebiti AI dell'AI Spend Check fatto prima della registrazione
 * (snapshot nel browser). Stesso percorso di un caricamento (ingestSpend), fonte "check".
 */
export async function importCheckSnapshotAction(charges: unknown): Promise<CheckImportResult> {
  const s = await requireRole("EDITOR", "/");
  if (!Array.isArray(charges) || charges.length === 0) return { ok: false, error: "Nothing to import." };
  if (charges.length > MAX_ROWS) return { ok: false, error: `Too many charges (over ${MAX_ROWS.toLocaleString("en-GB")}). Upload the statement instead.` };
  // Solo in un workspace ancora vuoto: altrimenti si caricano i file veri da Sources.
  const existing = await db.spendRecord.findFirst({ where: { organizationId: s.orgId }, select: { id: true } });
  if (existing) return { ok: false, error: "This workspace already has spend data." };
  const clean = charges.map(cleanCharge).filter((c): c is Charge => c !== null);
  if (!clean.length) return { ok: false, error: "The saved Spend check has no charges angar can read. Upload the statement instead." };
  const times = clean.map((c) => c.date.getTime());
  const parsed: ParseResult = { charges: clean, rowsRead: clean.length, periodStart: new Date(Math.min(...times)), periodEnd: new Date(Math.max(...times)), warnings: [] };
  const found = await ingestSpend(s.orgId, parsed);
  await audit("spend.import_check", `${clean.length} charges, ${found.length} AI services`);
  revalidateOrgSetup(s.orgId);
  revalidatePath("/", "layout");
  return { ok: true, services: found.length, charges: clean.length };
}

"use server";

/**
 * Contratti e fatture da PDF: 1) si legge il testo del PDF, 2) le regole di
 * contract-extract.ts trovano i campi, 3) se c'è una chiave Anthropic e non
 * siamo on-prem Claude li rifinisce (le regole restano sempre il ripiego),
 * 4) la persona controlla e corregge, 5) "Apply" scrive costo e contratto
 * dell'AI, con una riga di audit. Il PDF non viene mai salvato.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isOnPrem } from "@/lib/edition";
import { serviceOf } from "@/lib/savings";
import { AI_SERVICES } from "@/lib/discovery/catalog";
import { PLANS, USD_TO_EUR } from "@/lib/pricing/catalog";
import { extractContract, matchAsset, normalizeText, parseOneDate, EMPTY_FIELDS, type ContractFields } from "@/lib/contract-extract";

const BACK = "/contracts/upload";
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 40;

export type ReadState =
  | null
  | { ok: false; error: string }
  | { ok: true; fileName: string; pages: number; fields: ContractFields; assetId: string | null; refined: boolean };

async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const pages = Math.min(pdf.numPages, MAX_PAGES);
  const parts: string[] = [];
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Ricompone le righe: un salto quando l'elemento lo dice (hasEOL).
    let line = "";
    for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
      if (typeof item.str !== "string") continue;
      line += item.str;
      if (item.hasEOL) {
        parts.push(line);
        line = "";
      }
    }
    if (line) parts.push(line);
    parts.push("");
  }
  await (pdf as { cleanup?: () => Promise<void> }).cleanup?.().catch(() => {});
  return { text: parts.join("\n"), pages: pdf.numPages };
}

export async function readContractAction(_prev: ReadState, formData: FormData): Promise<ReadState> {
  const s = await requireRole("EDITOR", BACK);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a PDF first." };
  if (file.size > MAX_BYTES) return { ok: false, error: "This PDF is over 15 MB — upload the contract or invoice pages only." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...Array.from(bytes.slice(0, 5))) !== "%PDF-") return { ok: false, error: "This is not a PDF. For bank exports and e-invoices use Sources." };

  let text = "";
  let pages = 0;
  try {
    ({ text, pages } = await pdfText(bytes));
  } catch {
    return { ok: false, error: "angar could not read this PDF (protected or damaged). Try another copy." };
  }
  text = normalizeText(text);
  if (text.replace(/\s/g, "").length < 40) return { ok: false, error: "This PDF has no text to read — it looks like a scan. Enter the contract by hand on the AI's page." };

  let fields = extractContract(text);
  let refined = false;
  if (process.env.ANTHROPIC_API_KEY && !isOnPrem()) {
    const better = await refineWithClaude(text, fields).catch(() => null);
    if (better) {
      fields = better;
      refined = true;
    }
  }

  const assets = await db.aiAsset.findMany({
    where: { organizationId: s.orgId, deletedAt: null },
    select: { id: true, name: true, vendor: true, serviceId: true },
    orderBy: { name: "asc" },
    take: 1000,
  });
  const assetId = matchAsset(fields, assets, text, (a) => serviceOf(a));
  return { ok: true, fileName: file.name.slice(0, 200), pages, fields, assetId, refined };
}

// ── Claude (facoltativo) ───────────────────────────────────────────────

const SYSTEM =
  "You read AI software contracts, order forms and invoices (English, Italian, German or French). " +
  "Return ONLY a JSON object with these keys (null when the document does not say it; never guess): " +
  'kind ("contract"|"order"|"invoice"), vendor (company selling the AI), product (e.g. "ChatGPT Business"), seats (integer), ' +
  "seatPrice (number, price of one seat), seatPricePeriod (\"month\"|\"year\"), total (number, total before VAT if shown, else total), " +
  'currency ("EUR"|"USD"|"GBP"), billing ("monthly"|"annual"), contractStart (YYYY-MM-DD), contractEnd (YYYY-MM-DD, last day of the current term), ' +
  "noticeDays (integer, days of notice needed to cancel before the end), autoRenew (true|false).";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

async function refineWithClaude(text: string, base: ContractFields): Promise<ContractFields | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.CONTRACT_MODEL ?? process.env.ASSISTANT_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: SYSTEM,
      messages: [{ role: "user", content: `Document text:\n"""\n${text.slice(0, 30000)}\n"""` }],
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const out = (json.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(m[0]);
  } catch {
    return null;
  }

  // Ogni valore di Claude passa dai controlli; se non passa resta quello delle regole.
  const f: ContractFields = { ...EMPTY_FIELDS, ...base };
  const product = typeof c.product === "string" ? c.product : "";
  if (product) {
    const fromProduct = extractContract(product);
    if (fromProduct.planId) {
      f.planId = fromProduct.planId;
      f.plan = fromProduct.plan;
      f.serviceId = fromProduct.serviceId;
    } else if (!f.plan) f.plan = product.slice(0, 80);
    if (!f.serviceId && fromProduct.serviceId) f.serviceId = fromProduct.serviceId;
  }
  if (!f.serviceId && typeof c.vendor === "string") f.serviceId = extractContract(c.vendor).serviceId;
  f.vendor = (f.serviceId && AI_SERVICES.find((x) => x.id === f.serviceId)?.vendor) || (typeof c.vendor === "string" ? c.vendor.slice(0, 80) : f.vendor);
  if (["contract", "order", "invoice"].includes(String(c.kind))) f.kind = c.kind as ContractFields["kind"];
  const seats = num(c.seats);
  if (seats && Number.isInteger(seats) && seats <= 100000) f.seats = seats;
  if (["EUR", "USD", "GBP"].includes(String(c.currency))) f.currency = c.currency as ContractFields["currency"];
  if (c.billing === "monthly" || c.billing === "annual") f.billing = c.billing;
  const rate = f.currency === "USD" ? USD_TO_EUR : f.currency === "GBP" ? 1.17 : 1;
  const sp = num(c.seatPrice);
  if (sp) f.seatPriceEur = r2((c.seatPricePeriod === "year" ? sp / 12 : sp) * rate);
  const total = num(c.total);
  if (total) f.totalEur = r2(total * rate);
  const start = parseOneDate(typeof c.contractStart === "string" ? c.contractStart : null);
  const end = parseOneDate(typeof c.contractEnd === "string" ? c.contractEnd : null);
  if (start) f.contractStart = start;
  if (end && (!f.contractStart || end > f.contractStart)) f.contractEnd = end;
  const notice = num(c.noticeDays);
  if (notice != null && Number.isInteger(notice) && notice <= 730) f.noticeDays = notice;
  if (typeof c.autoRenew === "boolean") f.autoRenew = c.autoRenew;
  // Costo mensile ricalcolato dagli stessi numeri.
  if (f.seatPriceEur && f.seats) f.monthlyEur = r2(f.seatPriceEur * f.seats);
  else if (f.totalEur) f.monthlyEur = r2(f.billing === "annual" ? f.totalEur / 12 : f.totalEur);
  return f;
}

// ── Apply ──────────────────────────────────────────────────────────────

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

export async function applyContractAction(formData: FormData) {
  const s = await requireRole("EDITOR", BACK);
  const assetId = str(formData.get("assetId"));
  const err = (m: string) => redirect(`${BACK}?error=${encodeURIComponent(m)}`);
  if (!assetId) err("Pick the AI this document is for.");
  const asset = await db.aiAsset.findFirst({ where: { id: assetId, organizationId: s.orgId, deletedAt: null }, select: { id: true, name: true } });
  if (!asset) err("That AI no longer exists.");

  const contractStart = parseOneDate(str(formData.get("contractStart")));
  const contractEnd = parseOneDate(str(formData.get("contractEnd")));
  const noticeRaw = str(formData.get("noticeDays"));
  const noticeDays = noticeRaw === "" ? null : Math.round(Number(noticeRaw));
  const seatsRaw = str(formData.get("seats"));
  const seats = seatsRaw === "" ? null : Math.round(Number(seatsRaw));
  const monthlyRaw = str(formData.get("monthlyEur")).replace(",", ".");
  const monthly = monthlyRaw === "" ? null : Number(monthlyRaw);
  const renew = str(formData.get("autoRenew"));
  const billing = str(formData.get("billing"));
  const planId = str(formData.get("planId"));
  const kind = str(formData.get("kind"));
  const fileName = str(formData.get("fileName")).slice(0, 200);
  const clauses = formData.getAll("clause").map((c) => String(c).slice(0, 60)).slice(0, 10);

  if (noticeDays != null && (!Number.isFinite(noticeDays) || noticeDays < 0 || noticeDays > 730)) err("Notice must be between 0 and 730 days.");
  if (seats != null && (!Number.isFinite(seats) || seats < 1 || seats > 100000)) err("Seats must be a whole number above 0.");
  if (monthly != null && (!Number.isFinite(monthly) || monthly < 0 || monthly > 10_000_000)) err("The monthly cost must be a positive amount.");
  if (contractStart && contractEnd && contractEnd <= contractStart) err("The contract must end after it starts.");

  // Solo i campi compilati: un campo vuoto non cancella quello che c'era.
  const data: Record<string, unknown> = {};
  if (contractStart) data.contractStart = new Date(contractStart + "T00:00:00Z");
  if (contractEnd) data.contractEnd = new Date(contractEnd + "T00:00:00Z");
  if (noticeDays != null) data.noticeDays = noticeDays;
  if (renew === "yes" || renew === "no") data.autoRenew = renew === "yes";
  if (seats != null) data.seats = seats;
  if (planId && PLANS.some((p) => p.id === planId)) data.planId = planId;
  if (billing === "annual" || billing === "monthly") data.annualBilling = billing === "annual";
  if (monthly != null) {
    data.monthlyCostEstimate = Math.round(monthly * 100) / 100;
    data.basis = kind === "invoice" ? "invoice" : "manual";
    data.confidence = "HIGH";
  }
  if (Object.keys(data).length === 0) err("Nothing to apply — fill at least one field.");

  await db.aiSystemCost.upsert({ where: { aiAssetId: asset!.id }, update: data, create: { aiAssetId: asset!.id, ...data } });
  await audit("contract.import", asset!.name, {
    assetId: asset!.id,
    file: fileName || null,
    kind: kind || null,
    fields: Object.keys(data),
    contractEnd: contractEnd ?? null,
    noticeDays,
    monthlyEur: monthly,
    dataClauses: clauses,
  });
  revalidatePath("/", "layout");
  redirect(`/assets/${encodeURIComponent(asset!.id)}?saved=contract`);
}

/**
 * Software di contabilità europei tramite Chift (API unificata): DATEV,
 * Pennylane, Exact Online, Sage, Odoo, Xero, QuickBooks, Holded… Il cliente
 * collega il proprio software da una pagina Chift; angar legge le fatture
 * passive e tiene solo quelle AI (con la quantità = posti).
 * Credenziali di angar: CHIFT_CLIENT_ID, CHIFT_CLIENT_SECRET, CHIFT_ACCOUNT_ID.
 * API: https://api.chift.eu (docs.chift.eu).
 */
import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { matchMerchant } from "@/lib/pricing/merchants";
import { USD_TO_EUR } from "@/lib/pricing/catalog";
import { parseDate, type Charge } from "@/lib/spend/parse";
import { ingestSpend } from "@/lib/spend/ingest";

const CHIFT = "https://api.chift.eu";
export const chiftConfigured = () => Boolean(process.env.CHIFT_CLIENT_ID && process.env.CHIFT_CLIENT_SECRET && process.env.CHIFT_ACCOUNT_ID);

let cached: { token: string; until: number } | null = null;
async function token() {
  if (cached && Date.now() < cached.until) return cached.token;
  const res = await fetch(`${CHIFT}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: process.env.CHIFT_CLIENT_ID, clientSecret: process.env.CHIFT_CLIENT_SECRET, accountId: process.env.CHIFT_ACCOUNT_ID }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Accounting connection sign-in failed (${res.status}).`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, until: Date.now() + (Math.min(j.expires_in, 1800) - 60) * 1000 };
  return cached.token;
}

async function chift(path: string, init?: RequestInit) {
  const res = await fetch(`${CHIFT}${path}`, { ...init, headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  if (!res.ok) throw new Error(`Accounting ${path.split("?")[0].replace(/[0-9a-f-]{36}/g, "…")} → ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

/** Crea (una volta) il "consumer" Chift del workspace e restituisce il link per collegare il software. */
export async function accountingConnectLink(organizationId: string, orgName: string, redirectUrl: string) {
  const row = await db.connector.findUnique({ where: { organizationId_provider: { organizationId, provider: "ACCOUNTING" } } });
  let consumerId = decryptJson<{ consumerId?: string }>(row?.credentialsEncrypted)?.consumerId;
  if (!consumerId) {
    const c = await chift("/consumers", { method: "POST", body: JSON.stringify({ name: orgName.slice(0, 255), internal_reference: organizationId, redirect_url: redirectUrl }) });
    consumerId = c.consumerid as string;
    await db.connector.upsert({
      where: { organizationId_provider: { organizationId, provider: "ACCOUNTING" } },
      update: { credentialsEncrypted: encryptJson({ consumerId }), status: "SYNCING" },
      create: { organizationId, provider: "ACCOUNTING", credentialsEncrypted: encryptJson({ consumerId }), status: "SYNCING", scopes: ["accounting:read"] },
    });
  }
  const link = await chift(`/consumers/${consumerId}/connections`, { method: "POST", body: JSON.stringify({ redirect: true }) });
  return link.url as string;
}

/** Fatture passive degli ultimi 6 mesi: tiene solo quelle AI. */
export async function syncAccounting(organizationId: string) {
  const row = await db.connector.findUnique({ where: { organizationId_provider: { organizationId, provider: "ACCOUNTING" } } });
  const consumerId = decryptJson<{ consumerId?: string }>(row?.credentialsEncrypted)?.consumerId;
  if (!row || !consumerId) throw new Error("No accounting software connected.");
  const from = new Date(Date.now() - 183 * 86400000).toISOString().slice(0, 10);
  const charges: Charge[] = [];
  let rows = 0;
  for (let page = 1; page <= 30; page++) {
    const q = new URLSearchParams({ date_from: from, page: String(page), size: "100", include_invoice_lines: "true", include_partner_info: "true" });
    const j = await chift(`/consumers/${consumerId}/accounting/invoices/type/supplier_invoice?${q}`);
    const items: any[] = j.items ?? [];
    for (const inv of items) {
      rows++;
      const partner = inv.partner?.name ?? inv.partner?.company_name ?? "";
      const lines: any[] = inv.lines ?? [];
      const service = matchMerchant(`${partner} ${lines.map((l) => l.description ?? "").join(" ")}`);
      const date = parseDate(String(inv.invoice_date ?? ""));
      const net = Number(inv.untaxed_amount ?? inv.total ?? 0);
      if (!service || !date || !(net > 0)) continue;
      const eur = String(inv.currency ?? "EUR").toUpperCase() === "USD" ? net * USD_TO_EUR : net;
      const qty = Math.max(0, ...lines.map((l) => Number(l.quantity) || 0));
      charges.push({ date, amountEur: Math.round(eur * 100) / 100, description: `${partner} — ${lines[0]?.description ?? inv.invoice_number ?? ""}`.slice(0, 200), service, source: "invoice", seats: qty > 1 && Number.isInteger(qty) ? qty : undefined });
    }
    if (items.length < 100 || (typeof j.total === "number" && page * 100 >= j.total)) break;
  }
  const found = await ingestSpend(organizationId, { charges, rowsRead: rows, periodStart: null, periodEnd: null, warnings: [] });
  await db.connector.update({ where: { id: row.id }, data: { status: "CONNECTED", lastSyncedAt: new Date(), lastSyncError: null } });
  return { invoices: rows, services: found.length };
}

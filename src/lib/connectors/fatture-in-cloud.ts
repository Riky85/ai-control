/**
 * Fatture in Cloud (TeamSystem) — fatture passive: i costi AI arrivano da
 * soli ogni mese, senza caricare file. OAuth2 con scope di sola lettura
 * "received_documents:r". Credenziali dell'app angar: FIC_CLIENT_ID, FIC_CLIENT_SECRET.
 * API: https://api-v2.fattureincloud.it (developers.fattureincloud.it).
 */
import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { matchMerchant } from "@/lib/pricing/merchants";
import { USD_TO_EUR } from "@/lib/pricing/catalog";
import { parseDate, type Charge, type ParseResult } from "@/lib/spend/parse";
import { ingestSpend } from "@/lib/spend/ingest";

export const FIC_BASE = "https://api-v2.fattureincloud.it";
export const FIC_SCOPE = "received_documents:r";
export const ficConfigured = () => Boolean(process.env.FIC_CLIENT_ID && process.env.FIC_CLIENT_SECRET);

interface FicCreds {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  companyId?: number;
}

export async function ficTokenRequest(params: Record<string, string>) {
  const res = await fetch(`${FIC_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: process.env.FIC_CLIENT_ID, client_secret: process.env.FIC_CLIENT_SECRET, ...params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Fatture in Cloud sign-in failed (${res.status}): ${(await res.text()).slice(0, 160)}`);
  const j = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + (j.expires_in - 60) * 1000 };
}

async function token(connectorId: string, creds: FicCreds) {
  if (Date.now() < creds.expiresAt) return creds;
  const fresh = { ...creds, ...(await ficTokenRequest({ grant_type: "refresh_token", refresh_token: creds.refreshToken })) };
  await db.connector.update({ where: { id: connectorId }, data: { credentialsEncrypted: encryptJson(fresh) } });
  return fresh;
}

async function ficGet(path: string, accessToken: string) {
  const res = await fetch(`${FIC_BASE}${path}`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Fatture in Cloud ${path.split("?")[0]} → ${res.status}`);
  return res.json();
}

/** Legge le fatture passive degli ultimi 6 mesi e aggiorna costi e piani. */
export async function syncFattureInCloud(organizationId: string) {
  const row = await db.connector.findUnique({ where: { organizationId_provider: { organizationId, provider: "FATTURE_IN_CLOUD" } } });
  const creds = decryptJson<FicCreds>(row?.credentialsEncrypted);
  if (!row || !creds) throw new Error("Fatture in Cloud isn't connected.");
  const t = await token(row.id, creds);
  let companyId = t.companyId;
  if (!companyId) {
    const me = await ficGet("/user/companies", t.accessToken);
    companyId = me?.data?.companies?.[0]?.id;
    if (!companyId) throw new Error("No company found in this Fatture in Cloud account.");
    await db.connector.update({ where: { id: row.id }, data: { credentialsEncrypted: encryptJson({ ...t, companyId }) } });
  }
  const since = new Date(Date.now() - 183 * 86400000).toISOString().slice(0, 10);
  const charges: Charge[] = [];
  let rows = 0;
  for (let page = 1; page <= 20; page++) {
    const q = new URLSearchParams({ type: "expense", fieldset: "detailed", per_page: "100", page: String(page), q: `date >= '${since}'` });
    const j = await ficGet(`/c/${companyId}/received_documents?${q}`, t.accessToken);
    const docs: any[] = j?.data ?? [];
    for (const d of docs) {
      rows++;
      const supplier = String(d.entity?.name ?? "");
      const items = (d.items_list ?? []).map((i: any) => `${i.name ?? ""} ${i.description ?? ""}`).join(" ");
      const service = matchMerchant(`${supplier} ${d.description ?? ""} ${items}`);
      const date = parseDate(String(d.date ?? ""));
      const net = Number(d.amount_net ?? d.amount_gross ?? 0);
      if (!service || !date || !(net > 0)) continue;
      const eur = String(d.currency?.id ?? "EUR").toUpperCase() === "USD" ? net * USD_TO_EUR : net;
      const qty = Math.max(0, ...(d.items_list ?? []).map((i: any) => Number(i.qty) || 0));
      charges.push({ date, amountEur: Math.round(eur * 100) / 100, description: `${supplier} — ${d.description ?? items}`.slice(0, 200), service, source: "invoice", seats: qty > 1 && Number.isInteger(qty) ? qty : undefined });
    }
    if (!j?.next_page_url || docs.length === 0) break;
  }
  const parsed: ParseResult = { charges, rowsRead: rows, periodStart: null, periodEnd: null, warnings: [] };
  const found = await ingestSpend(organizationId, parsed);
  await db.connector.update({ where: { id: row.id }, data: { status: "CONNECTED", lastSyncedAt: new Date(), lastSyncError: null } });
  return { invoices: rows, services: found.length };
}

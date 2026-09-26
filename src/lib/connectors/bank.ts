/**
 * Conti bancari (PSD2) tramite Enable Banking: il cliente sceglie la banca,
 * autorizza in sola lettura sul sito della banca (90 giorni), e angar legge
 * gli addebiti riconoscendo SOLO quelli AI. Nessun altro movimento salvato.
 * Credenziali dell'app angar: ENABLEBANKING_APP_ID, ENABLEBANKING_PRIVATE_KEY (PEM, RS256).
 * API: https://api.enablebanking.com (enablebanking.com/docs).
 */
import { createSign } from "crypto";
import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { matchMerchant } from "@/lib/pricing/merchants";
import { USD_TO_EUR } from "@/lib/pricing/catalog";
import { parseDate, type Charge } from "@/lib/spend/parse";
import { ingestSpend } from "@/lib/spend/ingest";

const EB = "https://api.enablebanking.com";
export const bankConfigured = () => Boolean(process.env.ENABLEBANKING_APP_ID && process.env.ENABLEBANKING_PRIVATE_KEY);

function jwt() {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ typ: "JWT", alg: "RS256", kid: process.env.ENABLEBANKING_APP_ID });
  const body = b64({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 });
  const key = (process.env.ENABLEBANKING_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(key).toString("base64url");
  return `${head}.${body}.${sig}`;
}

async function eb(path: string, init?: RequestInit) {
  const res = await fetch(`${EB}${path}`, { ...init, headers: { Authorization: `Bearer ${jwt()}`, "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  if (!res.ok) throw new Error(`Bank connection ${path.split("?")[0]} → ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

export interface Bank {
  name: string;
  country: string;
  logo?: string;
}

export async function listBanks(country: string): Promise<Bank[]> {
  const j = await eb(`/aspsps?country=${encodeURIComponent(country)}&psu_type=business`);
  return (j.aspsps ?? []).map((a: any) => ({ name: a.name, country: a.country, logo: a.logo })).sort((a: Bank, b: Bank) => a.name.localeCompare(b.name));
}

export async function startBankAuth(bank: { name: string; country: string }, redirectUrl: string, state: string) {
  const validUntil = new Date(Date.now() + 89 * 86400000).toISOString();
  const j = await eb("/auth", {
    method: "POST",
    body: JSON.stringify({ aspsp: { name: bank.name, country: bank.country }, access: { valid_until: validUntil }, redirect_url: redirectUrl, state, psu_type: "business" }),
  });
  return j.url as string;
}

interface BankSession {
  sessionId: string;
  bank: string;
  accounts: string[];
  validUntil: string;
}

export async function finishBankAuth(organizationId: string, code: string, bankName: string) {
  const j = await eb("/sessions", { method: "POST", body: JSON.stringify({ code }) });
  const session: BankSession = {
    sessionId: j.session_id,
    bank: j.aspsp?.name ?? bankName,
    accounts: (j.accounts ?? []).map((a: any) => a.uid).filter(Boolean),
    validUntil: j.access?.valid_until ?? new Date(Date.now() + 89 * 86400000).toISOString(),
  };
  const row = await db.connector.findUnique({ where: { organizationId_provider: { organizationId, provider: "BANK" } } });
  const prev = decryptJson<{ sessions: BankSession[] }>(row?.credentialsEncrypted)?.sessions ?? [];
  const sessions = [...prev.filter((s) => s.bank !== session.bank), session];
  await db.connector.upsert({
    where: { organizationId_provider: { organizationId, provider: "BANK" } },
    update: { credentialsEncrypted: encryptJson({ sessions }), status: "CONNECTED", lastSyncError: null },
    create: { organizationId, provider: "BANK", credentialsEncrypted: encryptJson({ sessions }), status: "CONNECTED", scopes: ["accounts:read"] },
  });
  return session;
}

export async function bankSessions(organizationId: string) {
  const row = await db.connector.findUnique({ where: { organizationId_provider: { organizationId, provider: "BANK" } } });
  return decryptJson<{ sessions: BankSession[] }>(row?.credentialsEncrypted)?.sessions ?? [];
}

/** Legge gli ultimi 6 mesi di addebiti di tutti i conti collegati. */
export async function syncBank(organizationId: string) {
  const sessions = await bankSessions(organizationId);
  if (!sessions.length) throw new Error("No bank connected.");
  const from = new Date(Date.now() - 183 * 86400000).toISOString().slice(0, 10);
  const charges: Charge[] = [];
  let rows = 0;
  const errors: string[] = [];
  for (const s of sessions) {
    if (new Date(s.validUntil).getTime() < Date.now()) {
      errors.push(`${s.bank}: access expired — reconnect it.`);
      continue;
    }
    for (const uid of s.accounts) {
      let key: string | undefined;
      let pages = 0;
      do {
        const q = new URLSearchParams({ date_from: from, ...(key ? { continuation_key: key } : {}) });
        let j: any;
        try {
          j = await eb(`/accounts/${uid}/transactions?${q}`);
        } catch (err) {
          errors.push(`${s.bank}: ${(err as Error).message}`);
          break;
        }
        for (const t of j.transactions ?? []) {
          rows++;
          if (t.credit_debit_indicator !== "DBIT") continue;
          const text = [t.creditor?.name, ...(Array.isArray(t.remittance_information) ? t.remittance_information : [])].filter(Boolean).join(" ");
          const service = matchMerchant(text);
          const date = parseDate(String(t.booking_date ?? t.transaction_date ?? t.value_date ?? ""));
          const amount = Math.abs(Number(t.transaction_amount?.amount ?? 0));
          if (!service || !date || !(amount > 0)) continue;
          const eur = String(t.transaction_amount?.currency ?? "EUR").toUpperCase() === "USD" ? amount * USD_TO_EUR : amount;
          charges.push({ date, amountEur: Math.round(eur * 100) / 100, description: text.slice(0, 200), service, source: "bank" });
        }
        key = j.continuation_key || undefined;
      } while (key && ++pages < 30);
    }
  }
  const found = await ingestSpend(organizationId, { charges, rowsRead: rows, periodStart: null, periodEnd: null, warnings: [] });
  await db.connector.update({
    where: { organizationId_provider: { organizationId, provider: "BANK" } },
    data: { lastSyncedAt: new Date(), status: errors.length && !rows ? "ERROR" : "CONNECTED", lastSyncError: errors.join(" · ") || null },
  });
  return { transactions: rows, services: found.length, errors };
}

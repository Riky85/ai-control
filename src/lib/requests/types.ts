/**
 * Richieste di nuove AI (intake): tipi, elenchi chiusi e validazione del modulo. Puro.
 */
import type { DataSensitivity } from "@prisma/client";

export const REQUEST_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "NEEDS_INFO"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const isRequestStatus = (v: string): v is RequestStatus => (REQUEST_STATUSES as readonly string[]).includes(v);

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  REQUESTED: "Waiting",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  NEEDS_INFO: "Needs info",
};

/** Tipi di dati che l'AI riceverà. sensitivity → DataAsset collegato all'approvazione; weight → suggerimento di rischio. */
export const DATA_TYPES = [
  { id: "public", label: "Public information", sensitivity: "PUBLIC", weight: 0 },
  { id: "internal", label: "Internal documents", sensitivity: "INTERNAL", weight: 1 },
  { id: "confidential", label: "Confidential (contracts, plans, IP)", sensitivity: "CONFIDENTIAL", weight: 2 },
  { id: "customer_pii", label: "Customer personal data", sensitivity: "PII", weight: 3 },
  { id: "employee_pii", label: "Employee personal data", sensitivity: "PII", weight: 3 },
  { id: "health", label: "Health or other special category data", sensitivity: "PII", weight: 4 },
  { id: "financial", label: "Financial data", sensitivity: "FINANCIAL", weight: 2 },
  { id: "source_code", label: "Source code", sensitivity: "SOURCE_CODE", weight: 2 },
] as const satisfies readonly { id: string; label: string; sensitivity: DataSensitivity; weight: number }[];
export type DataTypeId = (typeof DATA_TYPES)[number]["id"];
export const DATA_TYPE_LABEL: Record<string, string> = Object.fromEntries(DATA_TYPES.map((d) => [d.id, d.label]));

export interface RequestInput {
  name: string;
  vendor: string | null;
  url: string | null;
  purpose: string;
  team: string | null;
  expectedUsers: number | null;
  dataTypes: DataTypeId[];
  estMonthlyEur: number | null;
}

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, max);

/** https://… valido (aggiunge https:// se manca), oppure null. */
export function normaliseUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || u.username || u.password) return null;
    return u.toString().slice(0, 300);
  } catch {
    return null;
  }
}

/** Dal modulo ai campi validati, o un messaggio d'errore leggibile. */
export function parseRequestForm(f: FormData): { ok: true; input: RequestInput } | { ok: false; error: string } {
  const name = clean(f.get("name"), 120);
  const vendor = clean(f.get("vendor"), 120) || null;
  const rawUrl = clean(f.get("url"), 300);
  const url = rawUrl ? normaliseUrl(rawUrl) : null;
  const purpose = clean(f.get("purpose"), 1000);
  const team = clean(f.get("team"), 80) || null;
  const usersRaw = clean(f.get("expectedUsers"), 10);
  const costRaw = clean(f.get("estMonthlyEur"), 12).replace(",", ".");
  const known = new Set<string>(DATA_TYPES.map((d) => d.id));
  const dataTypes = Array.from(new Set(f.getAll("dataTypes").map((v) => String(v)))).filter((v): v is DataTypeId => known.has(v));

  if (name.length < 2) return { ok: false, error: "Give the AI system a name, like “Perplexity” or “Fireflies”." };
  if (rawUrl && !url) return { ok: false, error: "The link doesn't look like a web address — try something like perplexity.ai." };
  if (purpose.length < 10) return { ok: false, error: "Say in a sentence what you want to use it for." };
  if (!dataTypes.length) return { ok: false, error: "Pick the kinds of data it will see (choose “Public information” if none)." };
  let expectedUsers: number | null = null;
  if (usersRaw) {
    const n = Number(usersRaw);
    if (!Number.isInteger(n) || n < 1 || n > 100_000) return { ok: false, error: "Expected users should be a whole number, like 5." };
    expectedUsers = n;
  }
  let estMonthlyEur: number | null = null;
  if (costRaw) {
    const n = Number(costRaw);
    if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return { ok: false, error: "The monthly cost should be a number in euro, like 40." };
    estMonthlyEur = Math.round(n * 100) / 100;
  }
  return { ok: true, input: { name, vendor, url, purpose, team, expectedUsers, dataTypes, estMonthlyEur } };
}

/** Suggerimento di rischio sui dati dichiarati. */
export function dataRisk(types: string[]): { level: "Low" | "Medium" | "High"; text: string } {
  const picked = DATA_TYPES.filter((d) => types.includes(d.id));
  const top = picked.reduce((m, d) => Math.max(m, d.weight), 0);
  if (top >= 3)
    return {
      level: "High",
      text: `Personal data (${picked.filter((d) => d.weight >= 3).map((d) => d.label.toLowerCase()).join(", ")}): check the DPA, EU data residency and that the vendor doesn't train on your data.`,
    };
  if (top >= 2) return { level: "Medium", text: `Business-sensitive data (${picked.filter((d) => d.weight === 2).map((d) => d.label.toLowerCase()).join(", ")}): use a business plan with no training on your data.` };
  return { level: "Low", text: "Public or internal information only." };
}

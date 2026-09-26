/**
 * Lettura di estratti conto (CSV, Excel) e fatture elettroniche (FatturaPA
 * XML, anche .p7m e .zip). Funzioni pure: nessun accesso al database, così
 * la stessa logica serve alla pagina pubblica "AI Spend Check" senza
 * salvare nulla. Si tengono SOLO le righe riconosciute come servizi AI.
 */
import { unzipSync } from "fflate";
import * as XLSX from "xlsx";
import { matchMerchant } from "@/lib/pricing/merchants";
import { USD_TO_EUR, guessPlan } from "@/lib/pricing/catalog";

export interface Charge {
  date: Date;
  amountEur: number;
  description: string;
  service: string;
  source: "bank" | "invoice";
}

export interface ParseResult {
  charges: Charge[];
  rowsRead: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  warnings: string[];
}

const empty = (): ParseResult => ({ charges: [], rowsRead: 0, periodStart: null, periodEnd: null, warnings: [] });

function merge(a: ParseResult, b: ParseResult): ParseResult {
  const dates = [a.periodStart, a.periodEnd, b.periodStart, b.periodEnd].filter((d): d is Date => !!d);
  return {
    charges: [...a.charges, ...b.charges],
    rowsRead: a.rowsRead + b.rowsRead,
    periodStart: dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null,
    periodEnd: dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null,
    warnings: [...a.warnings, ...b.warnings],
  };
}

export async function parseSpendFile(name: string, data: Uint8Array): Promise<ParseResult> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".zip")) {
    let out = empty();
    try {
      const files = unzipSync(data);
      for (const [n, d] of Object.entries(files)) {
        if (n.endsWith("/") || n.startsWith("__MACOSX")) continue;
        out = merge(out, await parseSpendFile(n, d));
      }
    } catch {
      out.warnings.push(`${name}: could not open the zip file.`);
    }
    return out;
  }
  if (lower.endsWith(".xml") || lower.endsWith(".p7m")) return parseInvoice(name, data);
  if (lower.endsWith(".pdf")) return { ...empty(), warnings: [`${name}: PDF statements aren't supported yet — export CSV or Excel from your bank.`] };
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".ods")) {
    try {
      const wb = XLSX.read(data, { type: "array", cellDates: true });
      let out = empty();
      for (const sn of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: false, dateNF: "yyyy-mm-dd", defval: "" });
        out = merge(out, parseRows(rows.map((r) => r.map((c) => String(c ?? "")))));
      }
      return out;
    } catch {
      return { ...empty(), warnings: [`${name}: could not read this spreadsheet.`] };
    }
  }
  const text = decodeText(data);
  if (/<\?xml|FatturaElettronica/i.test(text.slice(0, 2000))) return parseInvoice(name, data);
  return parseRows(splitCsv(text));
}

function decodeText(data: Uint8Array) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(data);
  // File bancari italiani spesso in Windows-1252: se l'UTF-8 ha caratteri rotti, riprova.
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(data) : utf8;
}

function splitCsv(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const sample = lines.slice(0, 20).join("\n");
  const delim = [";", "\t", ",", "|"].map((d) => ({ d, n: sample.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  return lines.map((line) => {
    const cells: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (ch === delim && !q) {
        cells.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  });
}

export function parseAmount(raw: string): number | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (/-\s*$/.test(s)) {
    neg = true;
    s = s.replace(/-\s*$/, "");
  }
  s = s.replace(/[€$£\s]|EUR|USD|GBP/gi, "");
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^[\d.,']+$/.test(s)) return null;
  s = s.replace(/'/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export function parseDate(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return valid(y, +m[2], +m[1]);
  }
  m = s.match(/^(\d{1,2})\s+([a-zA-Z]{3,})\.?\s+(\d{4})/);
  if (m) {
    const mi = MONTHS.findIndex((x) => m![2].toLowerCase().startsWith(x));
    if (mi >= 0) return valid(+m[3], (mi % 12) + 1, +m[1]);
  }
  return null;
}
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec", "gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
function valid(y: number, mo: number, d: number) {
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

const H = {
  date: /^(data( contabile| operazione| registrazione)?|date|booking date|transaction date|started date|completed date|data valuta|valuta|value date)$/i,
  amount: /^(importo|amount|ammontare|valore|importo \(eur\)|importo eur|totale|movimento)$/i,
  debit: /uscit|addebit|^dare$|debit|withdraw|money out|paid out/i,
  credit: /entrat|accredit|^avere$|credit|money in|paid in/i,
  desc: /descri|causale|dettagl|merchant|beneficiar|payee|counterparty|controparte|esercente|reference|riferimento|narrative|note|operazione|description/i,
  currency: /^(divisa|valuta divisa|currency|moneta)$/i,
};

function parseRows(rows: string[][]): ParseResult {
  const out = empty();
  let header = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = rows[i].map((c) => c.toLowerCase().trim());
    if (r.some((c) => H.date.test(c)) && r.some((c) => H.amount.test(c) || H.debit.test(c) || H.credit.test(c))) {
      header = i;
      break;
    }
  }
  const cols = header >= 0 ? rows[header].map((c) => c.toLowerCase().trim()) : [];
  const idx = (re: RegExp) => cols.findIndex((c) => re.test(c));
  const dateCol = idx(H.date);
  const amountCol = idx(H.amount);
  const debitCol = idx(H.debit);
  const creditCol = idx(H.credit);
  const currencyCol = idx(H.currency);
  const descCols = cols.map((c, i) => (H.desc.test(c) && i !== dateCol && i !== amountCol ? i : -1)).filter((i) => i >= 0);

  const body = rows.slice(header + 1);
  // Se nel file ci sono importi negativi, le spese sono quelle negative.
  const hasNegative = amountCol >= 0 && body.some((r) => (parseAmount(r[amountCol]) ?? 0) < 0);
  const dates: number[] = [];

  for (const r of body) {
    if (r.every((c) => !c)) continue;
    out.rowsRead++;
    const date = dateCol >= 0 ? parseDate(r[dateCol]) : r.map(parseDate).find(Boolean) ?? null;
    if (!date) continue;
    dates.push(date.getTime());
    const text = (descCols.length ? descCols.map((i) => r[i]) : r.filter((c) => parseAmount(c) === null && !parseDate(c))).join(" ").trim();
    const service = matchMerchant(text);
    if (!service) continue;
    let amount: number | null = null;
    if (debitCol >= 0 && parseAmount(r[debitCol])) amount = Math.abs(parseAmount(r[debitCol])!);
    else if (amountCol >= 0) {
      const a = parseAmount(r[amountCol]);
      if (a !== null) amount = hasNegative ? (a < 0 ? -a : null) : Math.abs(a);
    } else if (header < 0) {
      const nums = r.map(parseAmount).filter((n): n is number => n !== null && Math.abs(n) < 1_000_000);
      const last = nums[nums.length - 1];
      if (last !== undefined) amount = Math.abs(last);
    }
    if (!amount || amount <= 0) continue; // accrediti, rimborsi
    const cur = currencyCol >= 0 ? r[currencyCol].toUpperCase() : "EUR";
    const eur = cur.includes("USD") ? amount * USD_TO_EUR : amount;
    out.charges.push({ date, amountEur: Math.round(eur * 100) / 100, description: text.slice(0, 200), service, source: "bank" });
  }
  if (dates.length) {
    out.periodStart = new Date(Math.min(...dates));
    out.periodEnd = new Date(Math.max(...dates));
  }
  if (out.rowsRead > 0 && dates.length === 0) out.warnings.push("Couldn't find dates in this file — is it a bank statement export?");
  return out;
}

// ---------- Fatture elettroniche (FatturaPA) ----------

function extractXml(data: Uint8Array): string | null {
  let text = new TextDecoder("latin1").decode(data);
  if (/^MII/.test(text.trim())) {
    try {
      text = Buffer.from(text.replace(/\s+/g, ""), "base64").toString("latin1");
    } catch {
      /* non base64 */
    }
  }
  const start = text.search(/<\?xml|<([a-zA-Z0-9]+:)?FatturaElettronica[\s>]/);
  const endMatch = text.match(/<\/([a-zA-Z0-9]+:)?FatturaElettronica>/);
  if (start < 0 || !endMatch) return null;
  const end = text.indexOf(endMatch[0]) + endMatch[0].length;
  // In un .p7m l'XML può essere spezzato da byte di lunghezza: si tolgono i caratteri di controllo.
  return text.slice(start, end).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<(?:[a-zA-Z0-9]+:)?${name}>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${name}>`));
  return m ? m[1].trim() : null;
};
const tags = (xml: string, name: string) => Array.from(xml.matchAll(new RegExp(`<(?:[a-zA-Z0-9]+:)?${name}>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${name}>`, "g"))).map((m) => m[1].trim());

function parseInvoice(name: string, data: Uint8Array): ParseResult {
  const out = empty();
  const xml = extractXml(data);
  if (!xml) {
    out.warnings.push(`${name}: not a readable e-invoice.`);
    return out;
  }
  out.rowsRead = 1;
  const cedente = tag(xml, "CedentePrestatore") ?? "";
  const supplier = tag(cedente, "Denominazione") ?? [tag(cedente, "Nome"), tag(cedente, "Cognome")].filter(Boolean).join(" ");
  const generali = tag(xml, "DatiGeneraliDocumento") ?? xml;
  const date = parseDate(tag(generali, "Data") ?? "");
  const currency = (tag(generali, "Divisa") ?? "EUR").toUpperCase();
  const descriptions = tags(xml, "Descrizione").join(" ");
  const imponibile = tags(xml, "ImponibileImporto").map((v) => Number(v)).filter(Number.isFinite).reduce((a, b) => a + b, 0);
  const total = imponibile || Number(tag(generali, "ImportoTotaleDocumento") ?? 0);
  if (date) out.periodStart = out.periodEnd = date;
  const service = matchMerchant(`${supplier} ${descriptions}`);
  if (!service || !date || !(total > 0)) return out;
  const eur = currency === "USD" ? total * USD_TO_EUR : total;
  out.charges.push({ date, amountEur: Math.round(eur * 100) / 100, description: `${supplier} — ${descriptions}`.slice(0, 200), service, source: "invoice" });
  return out;
}

// ---------- Riepilogo per servizio ----------

export interface ServiceSpend {
  service: string;
  monthlyEur: number;
  total: number;
  count: number;
  first: Date;
  last: Date;
  planId: string | null;
  planName: string | null;
  seats: number | null;
  annual: boolean;
  source: "bank" | "invoice";
}

const DAY = 86400000;

export function summarize(charges: Charge[], _periodEnd?: Date | null): ServiceSpend[] {
  const by = new Map<string, Charge[]>();
  for (const c of charges) by.set(c.service, [...(by.get(c.service) ?? []), c]);
  return Array.from(by, ([service, list]) => {
    const total = list.reduce((s, c) => s + c.amountEur, 0);
    const first = Math.min(...list.map((c) => c.date.getTime()));
    const last = Math.max(...list.map((c) => c.date.getTime()));
    // Mesi coperti dagli addebiti (estremi inclusi): 3 addebiti mensili = 3 mesi,
    // più ricariche nello stesso mese = 1 mese.
    const months = Math.max(1, Math.round((last - first) / (30.4 * DAY)) + 1);
    let monthly = total / months;
    let annual = false;
    let guess = guessPlan(service, monthly);
    if (list.length === 1 && !guess) {
      const yearly = guessPlan(service, total / 12);
      if (yearly) {
        guess = { ...yearly, annual: true };
        monthly = total / 12;
        annual = true;
      }
    }
    return {
      service,
      monthlyEur: Math.round(monthly * 100) / 100,
      total: Math.round(total * 100) / 100,
      count: list.length,
      first: new Date(first),
      last: new Date(last),
      planId: guess?.plan.id ?? null,
      planName: guess?.plan.name ?? null,
      seats: guess?.seats ?? null,
      annual: annual || !!guess?.annual,
      source: list.some((c) => c.source === "invoice") ? "invoice" : "bank",
    } satisfies ServiceSpend;
  }).sort((a, b) => b.monthlyEur - a.monthlyEur);
}

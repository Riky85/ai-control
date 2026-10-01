/**
 * Fatture elettroniche europee oltre a FatturaPA:
 *  - UBL 2.1 Invoice / CreditNote (Peppol BIS Billing 3.0, XRechnung UBL, EHF, Svefaktura…)
 *  - UN/CEFACT CII CrossIndustryInvoice (XRechnung CII, ZUGFeRD 2.x, Factur-X)
 *    e il vecchio ZUGFeRD 1.0 (CrossIndustryDocument)
 *  - PDF ZUGFeRD / Factur-X: PDF/A-3 con l'XML CII allegato.
 * Funzioni pure (nessun database), stesso risultato del parser FatturaPA:
 * si tengono solo gli addebiti riconosciuti come servizi AI (matchMerchant).
 */
import { inflateSync, constants as zc } from "node:zlib";
import { matchMerchant } from "@/lib/pricing/merchants";
import { toEur, fxNote } from "./fx";
import type { Charge, ParseResult } from "./parse";

const emptyResult = (): ParseResult => ({ charges: [], rowsRead: 0, periodStart: null, periodEnd: null, warnings: [] });

export type XmlInvoiceKind = "fatturapa" | "ubl" | "cii" | null;

// ---------- Lettura XML minimale (indipendente dai prefissi di namespace) ----------

function decodeEntities(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const elRe = (name: string, flags = "") => new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, flags);

/** Contenuto grezzo del primo elemento `name` (qualsiasi prefisso). */
function block(xml: string | null, name: string): string | null {
  if (!xml) return null;
  const m = xml.match(elRe(name));
  return m ? m[1] : null;
}
/** Tutti gli elementi `name`. */
function blocks(xml: string | null, name: string): string[] {
  if (!xml) return [];
  return Array.from(xml.matchAll(elRe(name, "g"))).map((m) => m[1]);
}
/** Testo del primo elemento `name`. */
function text(xml: string | null, name: string): string | null {
  const b = block(xml, name);
  if (b === null) return null;
  const t = decodeEntities(b.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return t || null;
}
/** Percorso di elementi annidati, es. path(xml, "Party", "PartyName", "Name"). */
function path(xml: string | null, ...names: string[]): string | null {
  let cur = xml;
  for (const n of names.slice(0, -1)) cur = block(cur, n);
  return text(cur, names[names.length - 1]);
}
function num(s: string | null | undefined): number | null {
  if (s == null) return null;
  const n = Number(String(s).trim());
  return Number.isFinite(n) ? n : null;
}
/** Attributo del primo elemento `name`, es. currencyID. */
function attr(xml: string | null, name: string, attribute: string): string | null {
  if (!xml) return null;
  const m = xml.match(new RegExp(`<(?:[\\w.-]+:)?${name}\\s[^>]*\\b${attribute}\\s*=\\s*["']([^"']+)["']`));
  return m ? m[1] : null;
}

function isoDate(raw: string | null): Date | null {
  const s = (raw ?? "").trim();
  const m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/); // YYYY-MM-DD oppure formato 102 (YYYYMMDD)
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

/** Decodifica i byte di un XML rispettando l'encoding dichiarato. */
export function decodeXml(data: Uint8Array): string {
  const head = new TextDecoder("latin1").decode(data.slice(0, 200));
  const enc = head.match(/encoding\s*=\s*["']([\w-]+)["']/i)?.[1]?.toLowerCase();
  let label = "utf-8";
  if (enc && /^(iso-8859-1|latin1|windows-1252|cp1252|iso-8859-15)$/.test(enc)) label = "windows-1252";
  else if (enc && /^utf-16/.test(enc)) label = enc;
  try {
    return new TextDecoder(label).decode(data).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("utf-8").decode(data).replace(/^﻿/, "");
  }
}

/** Elemento radice (nome locale + tag di apertura), saltando dichiarazione, commenti e PI. */
function rootElement(xml: string): { local: string; open: string; index: number } | null {
  const s = xml.replace(/<\?[\s\S]*?\?>/g, (m) => " ".repeat(m.length)).replace(/<!--[\s\S]*?-->/g, (m) => " ".repeat(m.length)).replace(/<!DOCTYPE[^>]*>/gi, (m) => " ".repeat(m.length));
  const m = s.match(/<([\w.-]+:)?([\w.-]+)(\s[^>]*)?>/);
  if (!m || m.index === undefined) return null;
  return { local: m[2], open: m[0], index: m.index };
}

const UBL_NS = /urn:oasis:names:specification:ubl:schema:xsd:(Invoice|CreditNote)-2/;

/**
 * Riconosce il formato dal contenuto (radice e namespace), non dall'estensione.
 * Restituisce anche l'XML della fattura (es. dentro una busta Peppol SBDH).
 */
export function detectXmlInvoice(xml: string): { kind: XmlInvoiceKind; xml: string } {
  const root = rootElement(xml);
  if (!root) return { kind: null, xml };
  if (root.local === "FatturaElettronica") return { kind: "fatturapa", xml };
  if (root.local === "CrossIndustryInvoice" || root.local === "CrossIndustryDocument") return { kind: "cii", xml };
  if ((root.local === "Invoice" || root.local === "CreditNote") && (UBL_NS.test(root.open) || UBL_NS.test(xml.slice(0, 4000)))) return { kind: "ubl", xml };
  // Busta Peppol (StandardBusinessDocument) o altri contenitori: si cerca la fattura dentro.
  const inner = xml.match(/<([\w.-]+:)?(Invoice|CreditNote)\s[^>]*urn:oasis:names:specification:ubl:schema:xsd:(?:Invoice|CreditNote)-2[^>]*>[\s\S]*?<\/\1?\2>/);
  if (inner) return { kind: "ubl", xml: inner[0] };
  const cii = xml.match(/<([\w.-]+:)?(CrossIndustryInvoice|CrossIndustryDocument)[\s>][\s\S]*?<\/\1?\2>/);
  if (cii) return { kind: "cii", xml: cii[0] };
  if (/<([\w.-]+:)?FatturaElettronica[\s>]/.test(xml)) return { kind: "fatturapa", xml };
  return { kind: null, xml };
}

// ---------- Modello comune e trasformazione in addebiti ----------

interface InvoiceLine {
  name: string;
  quantity: number | null;
  amount: number | null;
}
interface InvoiceDoc {
  supplier: string;
  date: Date | null;
  currency: string;
  credit: boolean;
  lines: InvoiceLine[];
  total: number | null; // imponibile (IVA esclusa), senza segno della nota di credito
  note: string;
}

const SEATS_RE = /(\d{1,4})\s*(seats?|users?|utent[ie]|licen[sz]e?s?|lizenzen|nutzer|posti|members?|plätze|platser|brukere|anv[äa]ndare)/i;

function seatsOf(lines: InvoiceLine[], descriptions: string): number | undefined {
  const qty = lines.map((l) => l.quantity).filter((n): n is number => n !== null && Number.isInteger(n) && n >= 1 && n <= 5000);
  const t = descriptions.match(SEATS_RE);
  const seats = qty.length ? Math.max(...qty) : t ? Number(t[1]) : undefined;
  return seats && seats > 1 ? seats : undefined;
}

function toCharges(name: string, doc: InvoiceDoc): ParseResult {
  const out = emptyResult();
  out.rowsRead = 1;
  if (doc.date) out.periodStart = out.periodEnd = doc.date;
  if (!doc.date) {
    out.warnings.push(`${name}: e-invoice without an issue date, skipped.`);
    return out;
  }
  const sign = doc.credit ? -1 : 1;
  const pending: { service: string; amount: number; description: string; seats?: number }[] = [];
  const names = doc.lines.map((l) => l.name).filter(Boolean);
  const supplierService = doc.supplier ? matchMerchant(doc.supplier) : null;

  if (supplierService) {
    // Fornitore AI (OpenAI, Anthropic…): tutta la fattura, come per FatturaPA.
    const lineSum = doc.lines.reduce((t, l) => t + (l.amount ?? 0), 0);
    const total = doc.total ?? lineSum;
    // Fornitore + righe, come FatturaPA: "OpenAI … ChatGPT Team" è ChatGPT, non l'API.
    const service = matchMerchant(`${doc.supplier} ${names.join(" ")}`) ?? supplierService;
    pending.push({ service, amount: total * sign, description: [doc.supplier, names.join(" ")].filter(Boolean).join(" — "), seats: seatsOf(doc.lines, names.join(" ")) });
  } else if (doc.lines.length) {
    // Rivenditore o fattura mista: solo le righe AI, raggruppate per servizio.
    const by = new Map<string, InvoiceLine[]>();
    for (const l of doc.lines) {
      const svc = matchMerchant(`${l.name}`);
      if (svc) by.set(svc, [...(by.get(svc) ?? []), l]);
    }
    for (const [service, list] of by) {
      const amount = list.reduce((t, l) => t + (l.amount ?? 0), 0);
      const desc = list.map((l) => l.name).join(" ");
      pending.push({ service, amount: amount * sign, description: `${doc.supplier} — ${desc}`, seats: seatsOf(list, desc) });
    }
  } else {
    // Profili senza righe (es. Factur-X MINIMUM): fornitore + note, importo totale.
    const service = matchMerchant(`${doc.supplier} ${doc.note}`);
    if (service && doc.total !== null) pending.push({ service, amount: doc.total * sign, description: [doc.supplier, doc.note].filter(Boolean).join(" — ") });
  }

  let unconverted = false;
  for (const p of pending) {
    if (!p.amount) continue;
    const fx = toEur(p.amount, doc.currency);
    if (!fx.convertible) unconverted = true;
    const note = fxNote(p.amount, fx);
    const charge: Charge = {
      date: doc.date,
      amountEur: Math.round(fx.eur * 100) / 100,
      description: (p.description.slice(0, 200 - note.length) + note).trim(),
      service: p.service,
      source: "invoice",
      seats: p.amount > 0 ? p.seats : undefined,
    };
    if (fx.currency !== "EUR") {
      charge.currency = fx.currency;
      charge.amountOriginal = Math.round(p.amount * 100) / 100;
    }
    out.charges.push(charge);
  }
  if (unconverted) out.warnings.push(`${name}: amounts in ${doc.currency} were kept as they are (no exchange rate available).`);
  return out;
}

// ---------- UBL 2.1 ----------

export function parseUblXml(name: string, xml: string): ParseResult {
  const root = rootElement(xml);
  const isCreditNote = root?.local === "CreditNote";
  // Le righe si tolgono prima di leggere i dati di testata.
  const lineTag = isCreditNote ? "CreditNoteLine" : "InvoiceLine";
  const rawLines = blocks(xml, lineTag);
  const header = xml.replace(elRe(lineTag, "g"), "");
  const party = block(header, "AccountingSupplierParty");
  const supplier = path(party, "PartyName", "Name") ?? path(party, "PartyLegalEntity", "RegistrationName") ?? text(party, "RegistrationName") ?? text(party, "Name") ?? "";
  const typeCode = text(header, "InvoiceTypeCode") ?? text(header, "CreditNoteTypeCode");
  const totals = block(header, "LegalMonetaryTotal") ?? block(header, "RequestedMonetaryTotal");
  const total = num(text(totals, "TaxExclusiveAmount")) ?? num(text(totals, "LineExtensionAmount")) ?? num(text(totals, "PayableAmount"));
  const currency = text(header, "DocumentCurrencyCode") ?? attr(totals, "PayableAmount", "currencyID") ?? attr(totals, "TaxExclusiveAmount", "currencyID") ?? "EUR";
  const lines: InvoiceLine[] = rawLines.map((l) => {
    const item = block(l, "Item");
    return {
      name: [text(item, "Name"), text(item, "Description")].filter(Boolean).join(" — ") || text(l, "Note") || "",
      quantity: num(text(l, "InvoicedQuantity") ?? text(l, "CreditedQuantity")),
      amount: num(text(l, "LineExtensionAmount")),
    };
  });
  return toCharges(name, {
    supplier,
    date: isoDate(text(header, "IssueDate")),
    currency,
    // 381 = nota di credito anche se la radice è Invoice; 384/389/380 restano fatture.
    credit: isCreditNote || typeCode === "381",
    lines,
    total,
    note: blocks(header, "Note").map((n) => decodeEntities(n).trim()).join(" "),
  });
}

// ---------- UN/CEFACT CII (ZUGFeRD 2.x, Factur-X, XRechnung CII; anche ZUGFeRD 1.0) ----------

export function parseCiiXml(name: string, xml: string): ParseResult {
  const rawLines = blocks(xml, "IncludedSupplyChainTradeLineItem");
  const header = xml.replace(elRe("IncludedSupplyChainTradeLineItem", "g"), "");
  const doc = block(header, "ExchangedDocument") ?? block(header, "HeaderExchangedDocument") ?? header;
  const seller = block(header, "SellerTradeParty");
  const sums = block(header, "SpecifiedTradeSettlementHeaderMonetarySummation") ?? block(header, "SpecifiedTradeSettlementMonetarySummation");
  const total = num(text(sums, "TaxBasisTotalAmount")) ?? num(text(sums, "LineTotalAmount")) ?? num(text(sums, "DuePayableAmount")) ?? num(text(sums, "GrandTotalAmount"));
  const currency = text(header, "InvoiceCurrencyCode") ?? attr(sums, "TaxBasisTotalAmount", "currencyID") ?? attr(sums, "GrandTotalAmount", "currencyID") ?? "EUR";
  const lines: InvoiceLine[] = rawLines.map((l) => {
    const product = block(l, "SpecifiedTradeProduct");
    // ZUGFeRD 2.x: SpecifiedLineTradeSettlement; ZUGFeRD 1.0: SpecifiedSupplyChainTradeSettlement.
    const lineSums = block(l, "SpecifiedTradeSettlementLineMonetarySummation") ?? block(l, "SpecifiedTradeSettlementMonetarySummation");
    return {
      name: [text(product, "Name"), text(product, "Description")].filter(Boolean).join(" — "),
      quantity: num(text(l, "BilledQuantity")),
      amount: num(text(lineSums, "LineTotalAmount")),
    };
  });
  const typeCode = text(doc, "TypeCode");
  return toCharges(name, {
    supplier: text(seller, "Name") ?? "",
    date: isoDate(path(doc, "IssueDateTime", "DateTimeString")),
    currency,
    credit: typeCode === "381",
    lines,
    total,
    note: blocks(doc, "Content").map((n) => decodeEntities(n).trim()).join(" "),
  });
}

// ---------- PDF ZUGFeRD / Factur-X ----------

const ATTACHMENT_NAME = /(factur-x|zugferd|xrechnung|order-x).*\.xml$|\.xml$/i;

/** Allegati di un PDF letti con pdf.js (unpdf). */
async function pdfAttachments(data: Uint8Array): Promise<{ name: string; content: Uint8Array }[]> {
  try {
    const { getDocumentProxy } = await import("unpdf");
    // Copia: pdf.js può trasferire (staccare) il buffer originale.
    const pdf = await getDocumentProxy(new Uint8Array(data), { verbosity: 0 });
    type Att = { filename?: string; content?: Uint8Array };
    const doc = pdf as unknown as { getAttachmentContent?: (key: string) => Promise<Uint8Array | null>; cleanup?: () => Promise<void> };
    // pdf.js 5 restituisce una Map senza contenuto (si chiede con getAttachmentContent); le versioni precedenti un oggetto con content.
    const att = (await pdf.getAttachments()) as Map<string, Att> | Record<string, Att> | null;
    const entries: [string, Att][] = att instanceof Map ? Array.from(att.entries()) : Object.entries(att ?? {});
    const list: { name: string; content: Uint8Array }[] = [];
    for (const [key, a] of entries.slice(0, 20)) {
      const content = a?.content ?? (doc.getAttachmentContent ? await doc.getAttachmentContent(key).catch(() => null) : null);
      if (content?.length) list.push({ name: a?.filename || key, content });
    }
    await doc.cleanup?.().catch(() => {});
    return list;
  } catch {
    /* PDF non leggibile da pdf.js: si prova la lettura diretta */
    return [];
  }
}

/**
 * Lettura diretta: cerca i flussi del PDF che contengono XML (di solito
 * /Type /EmbeddedFile con /Filter /FlateDecode) e li decomprime con zlib.
 * I flussi non possono stare negli object stream, quindi basta scorrerli.
 */
function rawEmbeddedFiles(data: Uint8Array): { name: string; content: Uint8Array }[] {
  const bin = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const s = bin.toString("latin1");
  const out: { name: string; content: Uint8Array }[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(s)) && n < 500) {
    if (s.slice(Math.max(0, m.index - 3), m.index) === "end") continue;
    n++;
    const start = m.index + m[0].length;
    const end = s.indexOf("endstream", start);
    if (end < 0) break;
    const dictStart = s.lastIndexOf("obj", m.index);
    const dict = dictStart >= 0 ? s.slice(dictStart, m.index) : "";
    re.lastIndex = end + 9;
    // Solo flussi non immagine/font, con filtro Flate o senza filtro.
    if (/\/Subtype\s*\/Image|\/FontFile|\/Type\s*\/XObject/.test(dict)) continue;
    const filters = dict.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/)?.[1] ?? "";
    if (filters && !/^\/?\[?\s*\/FlateDecode\s*\]?$/.test(filters.trim())) continue;
    let content = bin.subarray(start, end);
    if (filters) {
      try {
        content = inflateSync(content, { finishFlush: zc.Z_SYNC_FLUSH });
      } catch {
        continue;
      }
    }
    const head = content.subarray(0, 3000).toString("latin1");
    if (/<([\w.-]+:)?(CrossIndustryInvoice|CrossIndustryDocument|Invoice|CreditNote|FatturaElettronica)[\s>]/.test(head)) {
      out.push({ name: /\/Type\s*\/EmbeddedFile/.test(dict) ? "embedded.xml" : "stream.xml", content: new Uint8Array(content) });
    }
  }
  return out;
}

export const NOT_AN_EINVOICE_PDF = "This PDF has no e-invoice data — use Read a contract (PDF) or upload the bank statement.";

/** XML della fattura allegata a un PDF ZUGFeRD / Factur-X / XRechnung (o null). */
export async function pdfInvoiceXml(data: Uint8Array): Promise<{ xml: string; kind: Exclude<XmlInvoiceKind, null> } | null> {
  const pick = (files: { name: string; content: Uint8Array }[]) => {
    const sorted = [...files].sort((a, b) => Number(!ATTACHMENT_NAME.test(a.name)) - Number(!ATTACHMENT_NAME.test(b.name)));
    for (const f of sorted) {
      const det = detectXmlInvoice(decodeXml(f.content));
      if (det.kind) return { xml: det.xml, kind: det.kind };
    }
    return null;
  };
  // Prima pdf.js; se non trova l'XML (PDF rovinato, allegato fuori dall'albero /EmbeddedFiles) si leggono i flussi.
  return pick(await pdfAttachments(data)) ?? pick(rawEmbeddedFiles(data));
}

/**
 * PDF ZUGFeRD / Factur-X: legge l'XML allegato. PDF senza XML: risultato vuoto
 * con notEInvoice = true e un avviso chiaro (il PDF va letto come contratto).
 */
export async function parseInvoicePdf(name: string, data: Uint8Array, parseFatturaPA: (name: string, data: Uint8Array) => ParseResult): Promise<ParseResult> {
  let found: Awaited<ReturnType<typeof pdfInvoiceXml>> = null;
  try {
    found = await pdfInvoiceXml(data);
  } catch {
    found = null;
  }
  if (!found) return { ...emptyResult(), notEInvoice: true, warnings: [`${name}: ${NOT_AN_EINVOICE_PDF}`] };
  if (found.kind === "cii") return parseCiiXml(name, found.xml);
  if (found.kind === "ubl") return parseUblXml(name, found.xml);
  return parseFatturaPA(name, new TextEncoder().encode(found.xml));
}

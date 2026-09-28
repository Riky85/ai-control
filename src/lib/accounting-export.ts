/**
 * Export contabili del chargeback: CSV generico, DATEV Buchungsstapel (EXTF)
 * e prima nota "TeamSystem-friendly". Funzioni pure: ricevono il chargeback
 * già calcolato e restituiscono il testo del file.
 *
 * Scrittura: una riga per centro di costo, Dare conto di costo (con KOST1 =
 * codice del centro di costo), Avere conto di transito. Il non allocato va sul
 * conto di costo senza centro di costo, così il conto di transito si chiude.
 */
import type { Chargeback } from "@/lib/chargeback";

export interface AccountingConfig {
  expenseAccount: string | null;
  clearingAccount: string | null;
  datevConsultant: string | null;
  datevClient: string | null;
}

export interface Posting {
  department: string;
  costCenter: string;
  costCenterName: string;
  eur: number;
  text: string;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Righe contabili: una per reparto, più una per il non allocato. */
export function postings(cb: Chargeback): Posting[] {
  const out: Posting[] = cb.rows
    .filter((r) => r.eur > 0)
    .map((r) => ({
      department: r.department,
      costCenter: r.costCenter?.code ?? "",
      costCenterName: r.costCenter?.name ?? "",
      eur: cents(r.eur),
      text: `AI ${cb.month} ${r.department}`,
    }));
  if (cb.unallocatedEur > 0) out.push({ department: "Unallocated", costCenter: "", costCenterName: "", eur: cents(cb.unallocatedEur), text: `AI ${cb.month} unallocated` });
  return out;
}

/** Campo CSV con separatore ";" (formato europeo): virgolette solo se servono. */
function cell(v: string | number | null | undefined, sep = ";") {
  const s = v == null ? "" : String(v);
  return s.includes(sep) || s.includes('"') || s.includes("\n") || s.includes("\r") ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Numero con la virgola decimale: 1234.5 → "1234,50". */
export const deNumber = (n: number) => cents(n).toFixed(2).replace(".", ",");

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][], sep = ";") {
  return [headers, ...rows].map((r) => r.map((v) => cell(v, sep)).join(sep)).join("\r\n") + "\r\n";
}

/** CSV di dettaglio: una riga per reparto × AI, più il non allocato. */
export function detailCsv(cb: Chargeback): string {
  const rows: (string | number)[][] = [];
  for (const r of cb.rows)
    for (const l of r.lines) rows.push([cb.month, r.department, r.costCenter?.code ?? "", r.costCenter?.name ?? "", l.name, l.method, deNumber(l.eur)]);
  for (const u of cb.unallocated) rows.push([cb.month, "Unallocated", "", "", u.name, u.reason, deNumber(u.eur)]);
  return toCsv(["Month", "Department", "Cost centre", "Cost centre name", "AI", "Method", "Amount EUR"], rows);
}

// ── DATEV ───────────────────────────────────────────────────────────────
const q = (s: string) => `"${s.replace(/"/g, "")}"`;
/** DATEV: testo in Windows-1252, niente caratteri fuori da Latin-1. */
const latin1 = (s: string) => s.normalize("NFC").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Intestazioni delle prime 38 colonne del Buchungsstapel (formato 700, versione 13). */
export const DATEV_COLUMNS = [
  "Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs", "Basis-Umsatz", "WKZ Basis-Umsatz", "Konto",
  "Gegenkonto (ohne BU-Schlüssel)", "BU-Schlüssel", "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto", "Buchungstext",
  "Postensperre", "Diverse Adressnummer", "Geschäftspartnerbank", "Sachverhalt", "Zinssperre", "Beleglink",
  "Beleginfo - Art 1", "Beleginfo - Inhalt 1", "Beleginfo - Art 2", "Beleginfo - Inhalt 2", "Beleginfo - Art 3", "Beleginfo - Inhalt 3",
  "Beleginfo - Art 4", "Beleginfo - Inhalt 4", "Beleginfo - Art 5", "Beleginfo - Inhalt 5", "Beleginfo - Art 6", "Beleginfo - Inhalt 6",
  "Beleginfo - Art 7", "Beleginfo - Inhalt 7", "Beleginfo - Art 8", "Beleginfo - Inhalt 8", "KOST1 - Kostenstelle", "KOST2 - Kostenstelle",
];

/**
 * DATEV-Format "EXTF" Buchungsstapel. Riga 1: intestazione del lotto; riga 2:
 * nomi delle colonne; poi una registrazione per centro di costo.
 * Restituisce il testo: codificarlo in latin1 (Windows-1252) prima di inviarlo.
 */
export function datevExtf(cb: Chargeback, cfg: AccountingConfig, now = new Date()): string {
  const konto = digits(cfg.expenseAccount);
  const gegen = digits(cfg.clearingAccount);
  const accountLength = Math.max(4, Math.min(9, konto.length || 4));
  const lastDay = new Date(cb.to.getTime() - 86400_000);
  const created = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 17); // aaaammgghhmmssmmm
  const header = [
    q("EXTF"), "700", "21", q("Buchungsstapel"), "13", created, "", q("RE"), q("angar"), q(""),
    digits(cfg.datevConsultant) || "", digits(cfg.datevClient) || "", `${cb.from.getUTCFullYear()}0101`, String(accountLength),
    ymd(cb.from), ymd(lastDay), q(latin1(`AI chargeback ${cb.month}`).slice(0, 30)), q(""), "1", "0", "0", q("EUR"),
    "", q(""), "", "", q(""), "", "", q(""), q(""),
  ].join(";");
  const belegdatum = `${String(lastDay.getUTCDate()).padStart(2, "0")}${String(lastDay.getUTCMonth() + 1).padStart(2, "0")}`;
  const lines = postings(cb).map((p) => {
    const row = new Array(DATEV_COLUMNS.length).fill("");
    row[0] = deNumber(p.eur);
    row[1] = q("S");
    row[2] = q("EUR");
    row[6] = konto;
    row[7] = gegen;
    row[9] = belegdatum;
    row[10] = q(`AI${cb.month.replace("-", "")}`);
    row[13] = q(latin1(p.text).slice(0, 60));
    row[36] = p.costCenter ? q(latin1(p.costCenter).slice(0, 36)) : "";
    return row.join(";");
  });
  return [header, DATEV_COLUMNS.map((c) => q(latin1(c))).join(";"), ...lines].join("\r\n") + "\r\n";
}

// ── TeamSystem (prima nota generica) ────────────────────────────────────
/** Prima nota: una riga per centro di costo sul conto di costo, più la contropartita sul conto di transito. */
export function teamSystemCsv(cb: Chargeback, cfg: AccountingConfig): string {
  const last = new Date(cb.to.getTime() - 86400_000);
  const data = `${String(last.getUTCDate()).padStart(2, "0")}/${String(last.getUTCMonth() + 1).padStart(2, "0")}/${last.getUTCFullYear()}`;
  const conto = (cfg.expenseAccount ?? "").trim();
  const p = postings(cb);
  const rows: (string | number)[][] = p.map((x) => [data, conto, x.costCenter, deNumber(x.eur), x.department === "Unallocated" ? `Costi AI ${cb.month} non allocati` : `Costi AI ${cb.month} - ${x.department}`]);
  const total = cents(p.reduce((s, x) => s + x.eur, 0));
  if (cfg.clearingAccount?.trim() && total > 0) rows.push([data, cfg.clearingAccount.trim(), "", deNumber(-total), `Costi AI ${cb.month} - giroconto`]);
  return toCsv(["Data", "Conto", "Centro di costo", "Importo", "Descrizione"], rows);
}

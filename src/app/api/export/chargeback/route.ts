import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { currentSession, activeMember } from "@/lib/auth";
import { computeChargeback, currentMonth, METHOD_LABEL } from "@/lib/chargeback";
import { maskCount, orgPrivacyMode, showsPeople } from "@/lib/privacy";
import { datevExtf, detailCsv, teamSystemCsv, type AccountingConfig } from "@/lib/accounting-export";

export const dynamic = "force-dynamic";

const FORMATS = ["csv", "xlsx", "datev", "teamsystem"] as const;
type Format = (typeof FORMATS)[number];

/** Export del chargeback di un mese: ?month=aaaa-mm&format=csv|xlsx|datev|teamsystem */
export async function GET(req: Request) {
  const s = currentSession();
  if (!s) return new Response("Not signed in", { status: 401 });
  const member = await activeMember(s);
  if (!member || member.status !== "active") return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const month = url.searchParams.get("month") || currentMonth();
  const format = (url.searchParams.get("format") ?? "csv") as Format;
  if (!FORMATS.includes(format)) return new Response("Unknown format", { status: 400 });

  const [org, cb, settings, mode] = await Promise.all([
    db.organization.findUnique({ where: { id: s.orgId }, select: { name: true } }),
    computeChargeback(s.orgId, month),
    db.accountingSettings.findUnique({ where: { organizationId: s.orgId } }),
    orgPrivacyMode(s.orgId),
  ]);
  // Privacy per reparto / solo totali: i conteggi sotto le 5 persone diventano "<5".
  const people = (n: number) => (mode === "anonymous" ? "" : showsPeople(mode) ? n : maskCount(n));
  if (!cb) return new Response("Invalid month — use YYYY-MM", { status: 400 });
  const cfg: AccountingConfig = {
    expenseAccount: settings?.expenseAccount ?? null,
    clearingAccount: settings?.clearingAccount ?? null,
    datevConsultant: settings?.datevConsultant ?? null,
    datevClient: settings?.datevClient ?? null,
  };
  const slug = `${(org?.name ?? "angar").replace(/[^a-z0-9]+/gi, "-")}-ai-chargeback-${month}`.toLowerCase();
  const file = (body: BodyInit, type: string, name: string) =>
    new Response(body, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });

  if (format === "csv") return file("﻿" + detailCsv(cb), "text/csv; charset=utf-8", `${slug}.csv`);
  if (format === "teamsystem") return file("﻿" + teamSystemCsv(cb, cfg), "text/csv; charset=utf-8", `${slug}-prima-nota.csv`);
  if (format === "datev") {
    // DATEV legge Windows-1252: il testo è già ridotto a Latin-1, qui si codifica.
    const bytes = Buffer.from(datevExtf(cb, cfg), "latin1");
    return file(new Uint8Array(bytes), "text/csv; charset=windows-1252", `EXTF_Buchungsstapel_${month.replace("-", "")}.csv`);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "angar";
  wb.created = new Date();
  const sheet = (name: string, headers: string[], rows: (string | number)[][]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.min(48, Math.max(12, h.length + 2, ...rows.map((r) => String(r[headers.indexOf(h)] ?? "").length + 2))) }));
    rows.forEach((r) => ws.addRow(r));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FF141418" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F6F8" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    headers.forEach((h, i) => {
      if (/€/.test(h)) ws.getColumn(i + 1).numFmt = '#,##0.00 "€"';
    });
  };
  sheet(
    "By cost centre",
    ["Month", "Department", "Cost centre", "Cost centre name", "People", "Amount €"],
    [
      ...cb.rows.map((r) => [month, r.department, r.costCenter?.code ?? "", r.costCenter?.name ?? "", people(r.people), r.eur]),
      [month, "Unallocated", "", "", "", cb.unallocatedEur],
      [month, "Total", "", "", "", cb.totalEur],
    ]
  );
  sheet(
    "Detail",
    ["Month", "Department", "Cost centre", "AI", "Method", "Amount €"],
    [
      ...cb.rows.flatMap((r) => r.lines.map((l) => [month, r.department, r.costCenter?.code ?? "", l.name, METHOD_LABEL[l.method], l.eur])),
      ...cb.unallocated.map((u) => [month, "Unallocated", "", u.name, u.reason, u.eur]),
    ]
  );
  const buffer = await wb.xlsx.writeBuffer();
  return file(buffer as ArrayBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${slug}.xlsx`);
}

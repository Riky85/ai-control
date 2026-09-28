/**
 * Registro contratti e rinnovi: date del contratto, preavviso di disdetta,
 * rinnovo automatico, ordine d'acquisto, centro di costo, responsabile.
 * L'avviso arriva 14 giorni prima della SCADENZA DEL PREAVVISO (non del
 * rinnovo): dopo quella data non si può più disdire né ridurre.
 */
import { db } from "@/lib/db";
import { createAlert } from "@/lib/alerts";
import { fmtDate, fmtEur } from "@/lib/format";
import { monthlyOf } from "@/lib/savings";

const DAY = 86400000;
export const NOTICE_ALERT_DAYS = 14;

export interface ContractTerms {
  contractStart: Date | null;
  contractEnd: Date | null;
  noticeDays: number | null;
  autoRenew: boolean | null;
}

/**
 * Fine del periodo in corso: con il rinnovo automatico, una data passata si
 * sposta avanti di un periodo (durata del contratto, altrimenti 12 mesi).
 */
export function currentTermEnd(c: ContractTerms, now = Date.now()): Date | null {
  if (!c.contractEnd) return null;
  const end = new Date(c.contractEnd);
  if (end.getTime() >= now - DAY || !c.autoRenew) return end;
  const months = c.contractStart ? Math.max(1, Math.round((c.contractEnd.getTime() - c.contractStart.getTime()) / (30.44 * DAY))) : 12;
  for (let i = 0; i < 100 && end.getTime() < now - DAY; i++) end.setUTCMonth(end.getUTCMonth() + months);
  return end;
}

/** Ultimo giorno utile per disdire (fine periodo − preavviso). */
export function noticeDeadline(c: ContractTerms, now = Date.now()): Date | null {
  const end = currentTermEnd(c, now);
  if (!end) return null;
  return new Date(end.getTime() - (c.noticeDays ?? 0) * DAY);
}

export const daysUntil = (d: Date, now = Date.now()) => Math.ceil((d.getTime() - now) / DAY);

export type ContractRow = Awaited<ReturnType<typeof contractRows>>[number];

/** Tutte le AI con dati di contratto, ordinate per scadenza del preavviso. */
export async function contractRows(organizationId: string) {
  const assets = await db.aiAsset.findMany({
    where: {
      organizationId,
      deletedAt: null,
      cost: { OR: [{ contractEnd: { not: null } }, { contractStart: { not: null } }, { poNumber: { not: null } }, { costCenter: { not: null } }, { contractOwnerEmail: { not: null } }, { contractUrl: { not: null } }] },
    },
    include: { cost: true, usages: { select: { id: true } } },
    orderBy: { name: "asc" },
  });
  const now = Date.now();
  return assets
    .map((a) => {
      const c = a.cost!;
      const end = currentTermEnd(c, now);
      const deadline = noticeDeadline(c, now);
      return {
        assetId: a.id,
        name: a.name,
        vendor: a.vendor,
        monthlyEur: monthlyOf(a)?.eur ?? null,
        annualBilling: c.annualBilling,
        contractStart: c.contractStart,
        contractEnd: c.contractEnd,
        termEnd: end,
        noticeDays: c.noticeDays,
        autoRenew: c.autoRenew,
        deadline,
        daysLeft: deadline ? daysUntil(deadline, now) : null,
        poNumber: c.poNumber,
        costCenter: c.costCenter,
        owner: c.contractOwnerEmail,
        contractUrl: c.contractUrl,
      };
    })
    .sort((x, y) => (x.deadline?.getTime() ?? Infinity) - (y.deadline?.getTime() ?? Infinity));
}

/** Lavoro giornaliero: "Notice deadline in 14 days" per i contratti con date. */
export async function noticeDeadlineAlerts(organizationId: string, now = Date.now()) {
  const rows = await contractRows(organizationId);
  let n = 0;
  for (const r of rows) {
    if (!r.deadline || r.daysLeft == null || r.daysLeft < 0 || r.daysLeft > NOTICE_ALERT_DAYS) continue;
    const yearly = r.monthlyEur ? ` — about ${fmtEur(r.monthlyEur * 12)} a year` : "";
    const created = await createAlert(organizationId, {
      kind: "renewal",
      severity: "warning",
      title: `${r.name}: notice deadline in ${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"} (${fmtDate(r.deadline)})`,
      body: `${r.autoRenew === false ? "The contract ends" : "The contract renews"} on ${fmtDate(r.termEnd!)}${yearly}. To cancel or reduce seats, give notice by ${fmtDate(r.deadline)}${r.owner ? ` — contract owner: ${r.owner}` : ""}.`,
      href: `/assets/${r.assetId}`,
      dedupeKey: `notice:${r.assetId}:${r.deadline.toISOString().slice(0, 10)}`,
    });
    if (created) n++;
  }
  return n;
}

/** CSV per la vista Contratti (separatore ";" per Excel in italiano/tedesco). */
export function contractsCsv(rows: ContractRow[]) {
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // Niente formule quando il file si apre in Excel.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = ["AI", "Vendor", "Cost EUR/month", "Billing", "Contract start", "Contract end", "Current term end", "Notice days", "Notice deadline", "Auto-renew", "PO number", "Cost centre", "Contract owner", "Contract link"];
  const lines = rows.map((r) =>
    [r.name, r.vendor, r.monthlyEur != null ? r.monthlyEur.toFixed(2) : "", r.annualBilling ? "yearly" : "monthly", day(r.contractStart), day(r.contractEnd), day(r.termEnd), r.noticeDays ?? "", day(r.deadline), r.autoRenew == null ? "" : r.autoRenew ? "yes" : "no", r.poNumber, r.costCenter, r.owner, r.contractUrl].map(cell).join(";"),
  );
  return "﻿" + [head.join(";"), ...lines].join("\r\n");
}

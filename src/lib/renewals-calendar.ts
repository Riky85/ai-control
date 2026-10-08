/**
 * Calendario dei rinnovi (/spend/renewals): termini di contratto (con preavviso) e rinnovi
 * ricavati dagli addebiti, un'AI una volta sola (le date del contratto vincono), raggruppati
 * per mese. Più l'export .ics delle scadenze di preavviso (e di un singolo rinnovo, "Set reminder").
 */
import { db } from "@/lib/db";
import { contractRows, daysUntil, NOTICE_ALERT_DAYS } from "@/lib/contracts";
import { upcomingRenewals } from "@/lib/renewals";

const DAY = 86400000;
export const HORIZON_DAYS = 365;

export interface RenewalRow {
  assetId: string;
  name: string;
  vendor: string | null;
  /** Fine del periodo in corso (contratto) o prossimo addebito (addebiti). */
  date: Date;
  /** Il contratto finisce senza rinnovo automatico. */
  endsOnly: boolean;
  autoRenew: boolean | null;
  noticeBy: Date | null;
  noticeDays: number | null;
  /** Giorni alla scadenza del preavviso (null = nessun preavviso noto). */
  noticeLeft: number | null;
  /** Arancio: scadenza del preavviso entro NOTICE_ALERT_DAYS. */
  noticeSoon: boolean;
  yearlyEur: number | null;
  billing: "yearly" | "monthly";
  owner: string | null;
  from: "contract" | "charges";
}

export interface RenewalMonth {
  key: string; // 2026-11
  label: string; // November 2026
  rows: RenewalRow[];
  yearlyEur: number;
}

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Europe/Rome" });

export async function renewalCalendar(organizationId: string, now = Date.now()) {
  const [contracts, charges] = await Promise.all([contractRows(organizationId), upcomingRenewals(organizationId, HORIZON_DAYS)]);
  const rows: RenewalRow[] = [];
  const seen = new Set<string>();
  for (const c of contracts) {
    if (!c.termEnd || c.termEnd.getTime() < now - DAY || c.termEnd.getTime() - now > HORIZON_DAYS * DAY) continue;
    seen.add(c.assetId);
    const left = c.deadline ? daysUntil(c.deadline, now) : null;
    rows.push({
      assetId: c.assetId,
      name: c.name,
      vendor: c.vendor,
      date: c.termEnd,
      endsOnly: c.autoRenew === false,
      autoRenew: c.autoRenew,
      noticeBy: c.deadline && c.noticeDays ? c.deadline : null,
      noticeDays: c.noticeDays,
      noticeLeft: c.noticeDays ? left : null,
      noticeSoon: !!c.noticeDays && left != null && left >= 0 && left <= NOTICE_ALERT_DAYS,
      yearlyEur: c.monthlyEur != null ? c.monthlyEur * 12 : null,
      billing: c.annualBilling ? "yearly" : "monthly",
      owner: c.owner?.toLowerCase() ?? null,
      from: "contract",
    });
  }
  for (const r of charges) {
    if (seen.has(r.assetId)) continue;
    seen.add(r.assetId);
    rows.push({
      assetId: r.assetId,
      name: r.name,
      vendor: r.vendor,
      date: r.date,
      endsOnly: false,
      autoRenew: null,
      noticeBy: null,
      noticeDays: null,
      noticeLeft: null,
      noticeSoon: false,
      yearlyEur: r.annual ? r.amountEur : r.amountEur * 12,
      billing: r.annual ? "yearly" : "monthly",
      owner: null,
      from: "charges",
    });
  }
  // Responsabile: quello del contratto, altrimenti l'owner dell'AI.
  const missing = rows.filter((r) => !r.owner).map((r) => r.assetId);
  if (missing.length) {
    const owners = await db.aiAsset.findMany({ where: { organizationId, id: { in: missing } }, select: { id: true, owner: { select: { email: true } } } });
    const by = new Map(owners.map((o) => [o.id, o.owner?.email?.toLowerCase() ?? null]));
    for (const r of rows) if (!r.owner) r.owner = by.get(r.assetId) ?? null;
  }
  rows.sort((a, b) => a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name));

  const months: RenewalMonth[] = [];
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 7);
    let m = months.find((x) => x.key === key);
    if (!m) months.push((m = { key, label: MONTH.format(r.date), rows: [], yearlyEur: 0 }));
    m.rows.push(r);
    m.yearlyEur += r.yearlyEur ?? 0;
  }

  const in90 = rows.filter((r) => r.date.getTime() - now <= 90 * DAY);
  const deadlines30 = rows.filter((r) => r.noticeLeft != null && r.noticeLeft >= 0 && r.noticeLeft <= 30);
  return {
    rows,
    months,
    stats: {
      renewing90: in90.length,
      renewing90Eur: in90.reduce((t, r) => t + (r.yearlyEur ?? 0), 0),
      deadlines30: deadlines30.length,
      nextDeadline: deadlines30[0]?.noticeBy ?? null,
      autoRenewOff: rows.filter((r) => r.autoRenew === false).length,
    },
  };
}

// ── iCalendar (RFC 5545) ─────────────────────────────────────────────────

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDay = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Righe lunghe piegate a 75 ottetti (continuazione con uno spazio). */
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export interface IcsEvent {
  uid: string;
  date: Date;
  summary: string;
  description: string;
  url?: string;
  /** Promemoria N giorni prima (VALARM). */
  alarmDays?: number;
}

export function buildIcs(events: IcsEvent[], name = "Angar renewals", now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Angar//Renewals//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsText(name)}`];
  for (const e of events) {
    const next = new Date(e.date.getTime() + DAY);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${icsStamp(now)}`,
      `DTSTART;VALUE=DATE:${icsDay(e.date)}`,
      `DTEND;VALUE=DATE:${icsDay(next)}`,
      `SUMMARY:${icsText(e.summary)}`,
      `DESCRIPTION:${icsText(e.description)}`,
      ...(e.url ? [`URL:${e.url}`] : []),
      "TRANSP:TRANSPARENT",
    );
    if (e.alarmDays) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.summary)}`, `TRIGGER:-P${e.alarmDays}D`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// Date in formato europeo (gg/mm/aaaa, 24 ore) e fuso orario di Roma: il
// server gira in UTC, quindi senza timeZone gli orari sarebbero sfasati.
const TZ = "Europe/Rome";
const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

type DateInput = Date | string | number | null | undefined;
const toDate = (d: DateInput) => (d == null ? null : d instanceof Date ? d : new Date(d));

export function fmtDate(d: DateInput) {
  const x = toDate(d);
  return x ? dateFmt.format(x) : "—";
}

export function fmtTime(d: DateInput) {
  const x = toDate(d);
  return x ? timeFmt.format(x) : "—";
}

export function fmtDateTime(d: DateInput) {
  const x = toDate(d);
  return x ? `${dateFmt.format(x)}, ${timeFmt.format(x)}` : "—";
}

/** Euro senza decimali (o con, per importi piccoli): €1,234 · €24.40 */
export function fmtEur(n: number, opts: { decimals?: boolean } = {}) {
  n = Math.round(n * 100) / 100;
  const d = opts.decimals ?? (Math.abs(n) < 100 && Math.abs(n % 1) >= 0.01);
  return "€" + n.toLocaleString("en-GB", { minimumFractionDigits: d ? 2 : 0, maximumFractionDigits: d ? 2 : 0 });
}

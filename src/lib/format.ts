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

/** "just now", "3 min ago", "2 h ago", "yesterday", altrimenti la data. */
export function fmtAgo(d: DateInput) {
  const x = toDate(d);
  if (!x) return "—";
  const s = Math.max(0, (Date.now() - x.getTime()) / 1000);
  if (s < 90) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.round(m)} min ago`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)} h ago`;
  if (h < 48) return "yesterday";
  return fmtDate(x);
}

/** Euro senza decimali (o con, per importi piccoli): €1,234 · €24.40 */
export function fmtEur(n: number, opts: { decimals?: boolean } = {}) {
  n = Math.round(n * 100) / 100;
  const d = opts.decimals ?? (Math.abs(n) < 100 && Math.abs(n % 1) >= 0.01);
  return "€" + n.toLocaleString("en-GB", { minimumFractionDigits: d ? 2 : 0, maximumFractionDigits: d ? 2 : 0 });
}

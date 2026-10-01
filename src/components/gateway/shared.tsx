/**
 * angar Gateway — pezzi di presentazione condivisi (niente "use client":
 * usati sia da componenti server sia client, nessun accesso al database).
 */
import { REDACT_LABEL, isRedactKind, type RedactKind } from "@/lib/gateway/detect";
import { REASON_LABEL } from "@/lib/gateway/policy";

export interface RowLike {
  result: string;
  reason: string | null;
  status: number;
  redactions: Partial<Record<RedactKind, number>> | null;
}

const TONE: Record<string, string> = {
  allowed: "text-steady bg-steady/10",
  redacted: "text-signal bg-signal/10",
  blocked: "text-alarm bg-alarm/10",
  error: "text-ink-400 bg-ink-400/10",
};

const LABEL: Record<string, string> = { allowed: "Allowed", redacted: "Redacted", blocked: "Blocked", error: "Error" };

export function ResultPill({ result }: { result: string }) {
  return <span className={`inline-flex whitespace-nowrap text-xs font-medium px-1.5 py-0.5 rounded-md ${TONE[result] ?? TONE.error}`}>{LABEL[result] ?? result}</span>;
}

/** "IBAN ×1, Email ×2" */
export function redactionText(r: RowLike["redactions"], short = false) {
  return Object.entries(r ?? {})
    .filter(([k, n]) => isRedactKind(k) && (n ?? 0) > 0)
    .map(([k, n]) => `${short ? REDACT_LABEL[k as RedactKind].replace(" number", "") : REDACT_LABEL[k as RedactKind]} ×${n}`)
    .join(", ");
}

/** Riga sotto la pillola: tipi redatti, motivo del blocco o dell'errore. */
export function resultNote(r: RowLike): string | null {
  if (r.result === "redacted") return redactionText(r.redactions, true) || null;
  if (r.result === "blocked" || r.result === "error") return r.reason ? REASON_LABEL[r.reason] ?? r.reason : r.status ? `HTTP ${r.status}` : null;
  return null;
}

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", day: "2-digit", month: "short" });
export const fmtClock = (iso: string) => timeFmt.format(new Date(iso));
export const fmtDayShort = (iso: string) => dayFmt.format(new Date(iso));

export const fmtInt = (n: number) => n.toLocaleString("en-GB");

/** Costo di una richiesta: tre decimali sotto l'euro (€0.004), altrimenti due. */
export function fmtCost(eur: number) {
  if (eur === 0) return "€0.000";
  if (eur < 1) return "€" + (eur < 0.001 ? "<0.001" : eur.toFixed(3));
  return "€" + eur.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const keyHint = (last4: string) => (last4 ? `agk_…${last4}` : "—");

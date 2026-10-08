/**
 * Pillola di stato unica per tutta la piattaforma (stessa grafica di
 * "Needs attention"): testo + sfondo tenue del colore semantico.
 * verde = ok · arancio = da guardare · rosso = rischio/errore · grigio = neutro.
 * Forma quadrata in mono maiuscolo (stile Exein).
 */
type Tone = "ok" | "warn" | "bad" | "neutral";

const STATES: Record<string, [string, Tone]> = {
  LOW: ["Low", "ok"],
  MEDIUM: ["Medium", "warn"],
  HIGH: ["High", "bad"],
  CRITICAL: ["Critical", "bad"],
  APPROVED: ["Approved", "ok"],
  UNREVIEWED: ["Needs review", "warn"],
  UNAPPROVED: ["Not allowed", "bad"],
  UNKNOWN: ["Needs review", "warn"],
  ASSURED: ["Assured", "ok"],
  NEEDS_REVIEW: ["Needs review", "warn"],
  RESTRICTED: ["Restricted", "bad"],
  BLOCKED: ["Blocked", "bad"],
  PASSED: ["Passed", "ok"],
  WARNING: ["Warning", "warn"],
  FAILED: ["Failed", "bad"],
  CONNECTED: ["Connected", "ok"],
  SYNC_FAILED: ["Last sync failed", "warn"],
  ERROR: ["Error", "bad"],
  SYNCING: ["Syncing", "warn"],
  DISCONNECTED: ["Not connected", "neutral"],
  ACTIVE: ["Active", "ok"],
  INVITED: ["Invited", "neutral"],
  EXPIRED: ["Expired", "neutral"],
  REVOKED: ["Revoked", "neutral"],
  CURRENT: ["Current", "neutral"],
  TRIALING: ["Trial", "neutral"],
  PAST_DUE: ["Payment overdue", "bad"],
  CANCELED: ["Canceled", "neutral"],
  ADMIN_KEY: ["Admin key", "neutral"],
  EARLY_ACCESS: ["Early access", "neutral"],
  ATTENTION: ["Attention", "bad"],
  GOOD: ["Good", "ok"],
  ADDED: ["Added", "ok"],
  ENCRYPTED: ["Encrypted", "ok"],
  NOT_CONFIGURED: ["Not configured", "bad"],
  READ_ONLY: ["Read-only", "neutral"],
  NOT_ENABLED: ["Not enabled yet", "neutral"],
  PASSWORD_AUTH: ["Email + password", "ok"],
  AUDIT_ON: ["On", "ok"],
  OK_STATUS: ["OK", "ok"],
  NEEDS_SETUP: ["Needs setup", "warn"],
  RUNNING: ["Running", "neutral"],
  FAILED_STATUS: ["Failed", "bad"],
  SERVER: ["Server", "neutral"],
  BROWSER: ["Browser", "neutral"],
};

const TONE: Record<Tone, string> = {
  ok: "text-steady bg-steady/10",
  warn: "text-accent bg-accent/10",
  bad: "text-alarm bg-alarm/10",
  neutral: "text-ink-400 bg-ink-400/10",
};

export default function Badge({ children }: { children: string }) {
  const key = children.toUpperCase().replace(/[\s-]+/g, "_");
  const [label, tone] = STATES[key] ?? [children, "neutral" as Tone];
  return <span className={`inline-flex items-center whitespace-nowrap font-mono uppercase text-[10px] tracking-[0.05em] px-1.5 py-0.5 rounded-[2px] ${TONE[tone]}`}>{label}</span>;
}

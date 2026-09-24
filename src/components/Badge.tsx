/**
 * Pillola di stato unica per tutta la piattaforma (stessa grafica di
 * "Needs attention"): testo + sfondo tenue del colore semantico.
 * verde = ok · ambra = attenzione · rosso = rischio/errore · grigio = neutro.
 */
type Tone = "ok" | "warn" | "bad" | "neutral";

const STATES: Record<string, [string, Tone]> = {
  LOW: ["Low", "ok"],
  MEDIUM: ["Medium", "warn"],
  HIGH: ["High", "bad"],
  CRITICAL: ["Critical", "bad"],
  APPROVED: ["Approved", "ok"],
  UNREVIEWED: ["Unreviewed", "warn"],
  UNAPPROVED: ["Not approved", "bad"],
  UNKNOWN: ["Unknown", "neutral"],
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
};

const TONE: Record<Tone, string> = {
  ok: "text-steady bg-steady/10",
  warn: "text-signal bg-signal/10",
  bad: "text-alarm bg-alarm/10",
  neutral: "text-ink-400 bg-ink-400/10",
};

export default function Badge({ children }: { children: string }) {
  const key = children.toUpperCase().replace(/[\s-]+/g, "_");
  const [label, tone] = STATES[key] ?? [children, "neutral" as Tone];
  return <span className={`inline-flex whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full ${TONE[tone]}`}>{label}</span>;
}

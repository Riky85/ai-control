const COLORS: Record<string, string> = {
  LOW: "bg-steady/10 text-steady",
  MEDIUM: "bg-signal/10 text-signal",
  HIGH: "bg-alarm/10 text-alarm",
  CRITICAL: "bg-alarm/20 text-alarm",
  APPROVED: "bg-steady/10 text-steady",
  UNREVIEWED: "bg-signal/10 text-signal",
  UNAPPROVED: "bg-alarm/10 text-alarm",
  UNKNOWN: "bg-white/[0.06] text-ink-400",
  CONNECTED: "bg-steady/10 text-steady",
  ERROR: "bg-alarm/10 text-alarm",
  SYNCING: "bg-signal/10 text-signal",
  DISCONNECTED: "bg-white/[0.06] text-ink-400",
};

// Sentence case invece delle maiuscole dell'enum: leggibile come parola,
// non come etichetta gridata.
const LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
  APPROVED: "Approved",
  UNREVIEWED: "Unreviewed",
  UNAPPROVED: "Not approved",
  UNKNOWN: "Unknown",
  CONNECTED: "Connected",
  ERROR: "Error",
  SYNCING: "Syncing",
  DISCONNECTED: "Disconnected",
};

export default function Badge({ children }: { children: string }) {
  const cls = COLORS[children] ?? "bg-white/[0.06] text-ink-400";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {LABEL[children] ?? children}
    </span>
  );
}

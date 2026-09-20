const COLOR: Record<string, string> = {
  LOW: "text-steady",
  MEDIUM: "text-signal",
  HIGH: "text-alarm",
  CRITICAL: "text-alarm",
  APPROVED: "text-steady",
  UNREVIEWED: "text-signal",
  UNAPPROVED: "text-alarm",
  UNKNOWN: "text-ink-400",
  CONNECTED: "text-steady",
  ERROR: "text-alarm",
  SYNCING: "text-signal",
  DISCONNECTED: "text-ink-400",
};

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

// Pillola con sfondo tenue coerente col colore semantico — non solo testo:
// ha un padding proprio, quindi non si "incolla" mai a un elemento vicino
// anche se il contenitore che la ospita dimentica uno spazio tra elementi.
const BG: Record<string, string> = {
  LOW: "bg-steady/10",
  MEDIUM: "bg-signal/10",
  HIGH: "bg-alarm/10",
  CRITICAL: "bg-alarm/10",
  APPROVED: "bg-steady/10",
  UNREVIEWED: "bg-signal/10",
  UNAPPROVED: "bg-alarm/10",
  UNKNOWN: "bg-ink-400/10",
  CONNECTED: "bg-steady/10",
  ERROR: "bg-alarm/10",
  SYNCING: "bg-signal/10",
  DISCONNECTED: "bg-ink-400/10",
};

export default function Badge({ children }: { children: string }) {
  return (
    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${COLOR[children] ?? "text-ink-400"} ${BG[children] ?? "bg-ink-400/10"}`}>
      {LABEL[children] ?? children}
    </span>
  );
}

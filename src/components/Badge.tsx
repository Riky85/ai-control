const DOT_COLOR: Record<string, string> = {
  LOW: "bg-steady",
  MEDIUM: "bg-signal",
  HIGH: "bg-alarm",
  CRITICAL: "bg-alarm",
  APPROVED: "bg-steady",
  UNREVIEWED: "bg-signal",
  UNAPPROVED: "bg-alarm",
  UNKNOWN: "bg-ink-400",
  CONNECTED: "bg-steady",
  ERROR: "bg-alarm",
  SYNCING: "bg-signal",
  DISCONNECTED: "bg-ink-400",
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

// Un pallino colorato più il testo in tinta neutra: lo stato si legge
// senza che l'intero elemento diventi un blocco di colore.
export default function Badge({ children }: { children: string }) {
  const dot = DOT_COLOR[children] ?? "bg-ink-400";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-100">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {LABEL[children] ?? children}
    </span>
  );
}

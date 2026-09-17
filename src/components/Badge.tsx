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

// Testo colorato, niente sfondo: più editoriale, meno "etichetta software".
export default function Badge({ children }: { children: string }) {
  return (
    <span className={`text-xs font-medium ${COLOR[children] ?? "text-ink-400"}`}>
      {LABEL[children] ?? children}
    </span>
  );
}

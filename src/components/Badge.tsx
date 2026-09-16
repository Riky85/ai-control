const COLORS: Record<string, string> = {
  LOW: "bg-success/15 text-success",
  MEDIUM: "bg-warning/15 text-warning",
  HIGH: "bg-danger/15 text-danger",
  CRITICAL: "bg-danger/25 text-danger",
  APPROVED: "bg-success/15 text-success",
  UNREVIEWED: "bg-warning/15 text-warning",
  UNAPPROVED: "bg-danger/15 text-danger",
  UNKNOWN: "bg-white/10 text-muted",
  CONNECTED: "bg-success/15 text-success",
  ERROR: "bg-danger/15 text-danger",
  SYNCING: "bg-warning/15 text-warning",
  DISCONNECTED: "bg-white/10 text-muted",
};

export default function Badge({ children }: { children: string }) {
  const cls = COLORS[children] ?? "bg-white/10 text-muted";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

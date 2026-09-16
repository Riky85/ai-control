export default function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "danger" | "warning";
}) {
  const toneClass =
    tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-white";

  return (
    <div className="rounded-lg border border-border bg-panel px-5 py-4">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className={`text-2xl font-semibold mono ${toneClass}`}>{value}</div>
    </div>
  );
}

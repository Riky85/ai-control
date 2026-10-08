import Link from "next/link";
import { detectAnomalies, type Anomaly, type AnomalyKind } from "@/lib/engine/forecast";

export interface AnomalyListProps {
  anomalies: Anomaly[];
}

export async function loadAnomalyList(orgId: string): Promise<AnomalyListProps> {
  return { anomalies: await detectAnomalies(orgId) };
}

const KIND_LABEL: Record<AnomalyKind, string> = {
  price_increase: "Price",
  seat_creep: "Seats",
  shadow_surge: "Shadow AI",
  spend_spike: "Spend",
  new_expensive: "New AI",
};

const SEV = {
  critical: { dot: "bg-alarm", label: "Critical" },
  warning: { dot: "bg-accent", label: "Warning" },
  info: { dot: "bg-ink-400", label: "Info" },
} as const;

/** Anomalie di spesa e d'uso: gravità (punto + testo), tipo, titolo, dettaglio, link. */
export default function AnomalyList({ anomalies, limit = 5 }: AnomalyListProps & { limit?: number }) {
  const shown = anomalies.slice(0, limit);
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-panel animate-rise" aria-labelledby="anomaly-title">
      <div className="flex items-baseline justify-between gap-3 bg-ink border-b border-line px-5 py-3 text-sm bar-head">
        <h2 id="anomaly-title" className="font-bold text-ink-100">Anomalies</h2>
        {anomalies.length > 0 && <span className="eyebrow !text-accent tabular">{anomalies.length} found</span>}
      </div>
      {shown.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-400 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-steady" aria-hidden />
          Nothing unusual right now.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((a) => (
            <li key={a.key}>
              <Link href={a.href} className="group flex items-start gap-3 px-5 py-3 hover:bg-ink-100/[0.03] transition-colors">
                <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${SEV[a.severity].dot}`} aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-ink-100 truncate group-hover:underline">{a.title}</span>
                  </span>
                  <span className="block text-xs text-ink-400 mt-0.5">{a.body}</span>
                </span>
                <span className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] text-ink-400 border border-line rounded-[2px] px-1.5 py-0.5 font-mono uppercase tracking-[0.05em]">{KIND_LABEL[a.kind]}</span>
                  <span className="sr-only">{SEV[a.severity].label}</span>
                  {a.severity === "critical" && <span className="font-mono uppercase text-[10px] tracking-[0.05em] text-alarm" aria-hidden>Critical</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {anomalies.length > limit && (
        <div className="bg-ink border-t border-line px-5 py-3 bar-foot">
          <Link href="/alerts" className="eyebrow hover:!text-ink-100 transition-colors">+{anomalies.length - limit} more in alerts [→]</Link>
        </div>
      )}
    </section>
  );
}

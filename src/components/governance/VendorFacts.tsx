import { Pill, type Tone } from "./parts";
import type { Residency } from "@/lib/vendor-risk";

/**
 * Fornitori delle AI in uso, in breve: dati nell'UE, quante AI addestrano sui
 * vostri dati col piano in uso, DPA, sede. Solo dati serializzabili in ingresso.
 */
export interface VendorFactRow {
  key: string;
  vendor: string;
  hq: string;
  aiCount: number;
  /** AI di questo fornitore che, col piano in uso, addestrano sui dati di default. */
  trainsCount: number;
  euResidency: Residency;
  hasDpa: boolean;
  verified: boolean;
}

const EU: Record<Residency, { tone: Tone; label: string }> = {
  yes: { tone: "steady", label: "EU data" },
  enterprise: { tone: "signal", label: "EU data: enterprise only" },
  no: { tone: "alarm", label: "No EU data" },
  unknown: { tone: "muted", label: "EU data: unverified" },
};

export default function VendorFacts({ rows }: { rows: VendorFactRow[] }) {
  if (!rows.length) return null;
  return (
    <section className="rounded-xl border border-line bg-panel overflow-hidden animate-rise" aria-label="Vendors of the AI in use">
      <div className="flex items-baseline justify-between gap-3 bg-ink border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink-100">Vendors in use</h3>
        <span className="text-xs text-ink-400">From public vendor documents · not legal advice</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2">
            <span className="min-w-0 flex-1 text-sm text-ink-100 truncate">
              {r.vendor}
              <span className="text-xs text-ink-400">
                {" "}
                · {r.hq} · {r.aiCount} AI
              </span>
            </span>
            <span className="flex flex-wrap gap-1">
              <Pill tone={EU[r.euResidency].tone}>{EU[r.euResidency].label}</Pill>
              {r.trainsCount > 0 ? <Pill tone="alarm">{r.trainsCount} {r.trainsCount === 1 ? "trains" : "train"} on your data</Pill> : r.verified && <Pill tone="steady">No default training</Pill>}
              <Pill tone={r.hasDpa ? "steady" : r.verified ? "signal" : "muted"}>{r.hasDpa ? "DPA" : r.verified ? "No DPA found" : "DPA: check"}</Pill>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

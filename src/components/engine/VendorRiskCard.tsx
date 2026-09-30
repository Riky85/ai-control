import Link from "next/link";
import { RESIDENCY_LABEL, type Residency, type Training, type VendorRisk } from "@/lib/vendor-risk";

/**
 * Condizioni del fornitore in breve (pagina di un'AI, Overview): dati nell'UE,
 * addestramento sui vostri dati col piano in uso, DPA, certificazioni, sede.
 * Stesso linguaggio di PriceIndexCard: linee sottili, pillole tinte.
 */

const TONE = {
  alarm: "text-alarm bg-alarm/10",
  signal: "text-signal bg-signal/10",
  steady: "text-steady bg-steady/10",
  muted: "text-ink-400 bg-ink-100/[0.06]",
} as const;
type Tone = keyof typeof TONE;

function Pill({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONE[tone]}`}>
      {children}
    </span>
  );
}

const EU_HQ = ["France", "Germany", "Italy", "Spain", "Netherlands", "Belgium", "Ireland", "Sweden", "Finland", "Denmark", "Austria", "Poland", "Portugal", "Norway", "Luxembourg", "Czechia"];

const residency: Record<Residency, { tone: Tone; label: string }> = {
  yes: { tone: "steady", label: "Yes" },
  enterprise: { tone: "signal", label: "Enterprise only" },
  no: { tone: "alarm", label: "No" },
  unknown: { tone: "muted", label: "Unverified" },
};
const training: Record<Training, { tone: Tone; label: string }> = {
  no: { tone: "steady", label: "No" },
  yes: { tone: "alarm", label: "Yes, by default" },
  choice: { tone: "signal", label: "User or admin choice" },
  unknown: { tone: "muted", label: "Unverified" },
};

export default function VendorRiskCard({ risk, tier, detailsHref }: { risk: VendorRisk; tier: "business" | "consumer"; detailsHref?: string }) {
  const trains = tier === "business" ? risk.trainsBusiness : risk.trainsConsumer;
  const certs = risk.certifications;
  const row = (label: React.ReactNode, value: React.ReactNode) => (
    <div className="-mt-px flex items-center justify-between gap-3 border-t border-line py-2">
      <dt className="text-sm text-ink-400 min-w-0 truncate">{label}</dt>
      <dd className="flex flex-wrap justify-end gap-1 shrink-0">{value}</dd>
    </div>
  );
  return (
    <section className="rounded-xl border border-line bg-panel animate-rise" aria-labelledby="vendor-risk-title">
      <div className="flex items-center justify-between gap-3 bg-ink border-b border-line rounded-t-xl px-4 py-2.5">
        <div className="min-w-0 flex items-baseline gap-2">
          <h2 id="vendor-risk-title" className="text-sm font-semibold text-ink-100 truncate">
            Vendor terms · {risk.vendor}
          </h2>
          <span className="text-[11px] text-ink-400 shrink-0">{risk.verified ? `checked ${risk.lastReviewed}` : "unverified"}</span>
        </div>
        {detailsHref && (
          <Link href={detailsHref} className="text-xs text-ink-400 hover:text-ink-100 shrink-0">
            Details →
          </Link>
        )}
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 px-4 pb-1 pt-px overflow-hidden">
        {row("EU data", <Pill tone={residency[risk.euResidency].tone} title={risk.residencyNote ?? RESIDENCY_LABEL[risk.euResidency]}>{residency[risk.euResidency].label}</Pill>)}
        {row(
          <span title={tier === "business" ? "Terms for business plans and the API" : "Terms for personal and free plans"}>
            Trains on your data <span className="text-[11px]">({tier === "business" ? "business" : "personal"} plan)</span>
          </span>,
          <Pill tone={training[trains].tone} title={risk.trainingNote}>{training[trains].label}</Pill>
        )}
        {row(
          "DPA",
          risk.dpaUrl ? (
            <a href={risk.dpaUrl} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">
              <Pill tone="steady">Available ↗</Pill>
            </a>
          ) : (
            <Pill tone={risk.verified ? "signal" : "muted"}>{risk.verified ? "None found" : "Check"}</Pill>
          )
        )}
        {row(
          "Certifications",
          certs.length ? (
            <>
              {certs.slice(0, 2).map((c) => (
                <Pill key={c} tone="muted">{c}</Pill>
              ))}
              {certs.length > 2 && <Pill tone="muted" title={certs.slice(2).join(", ")}>+{certs.length - 2}</Pill>}
            </>
          ) : (
            <Pill tone={risk.verified ? "signal" : "muted"}>{risk.verified ? "None found" : "Check"}</Pill>
          )
        )}
        {row("Headquarters", <Pill tone={EU_HQ.includes(risk.hq) ? "steady" : "muted"}>{risk.hq}</Pill>)}
        {row(
          "Sub-processors",
          risk.subprocessorsUrl ? (
            <a href={risk.subprocessorsUrl} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">
              <Pill tone="muted">List ↗</Pill>
            </a>
          ) : (
            <Pill tone="muted">Check</Pill>
          )
        )}
      </dl>
    </section>
  );
}

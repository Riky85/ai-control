import Link from "next/link";
import { rightsizeFor, type RightsizeResult, type RightsizeAction, type Segment } from "@/lib/engine/rightsize";
import { maskCount } from "@/lib/privacy";
import { fmtEur } from "@/lib/format";
import { VendorBadge } from "@/components/VendorIcon";
import { Pill, Section } from "@/components/governance/parts";

export type RightsizeCardProps = RightsizeResult;

/** Dati della card (serializzabili). */
export async function loadRightsizeCard(orgId: string): Promise<RightsizeCardProps> {
  return rightsizeFor(orgId);
}

const MAX_ROWS = 5;
const eur = (n: number) => fmtEur(Math.round(n));

const SEG: { key: Segment; label: string; bar: string; dot: string }[] = [
  { key: "heavy", label: "Heavy", bar: "bg-ink-100/60", dot: "bg-ink-100" },
  { key: "regular", label: "Regular", bar: "bg-ink-400/40", dot: "bg-ink-400" },
  { key: "light", label: "Light", bar: "bg-signal/50", dot: "bg-signal" },
  { key: "inactive", label: "Inactive", bar: "bg-alarm/40", dot: "bg-alarm" },
];

function actionText(a: RightsizeAction, n: string) {
  switch (a.kind) {
    case "remove":
      return `Remove ${n} seat${a.count === 1 ? "" : "s"}`;
    case "downgrade":
      return `${n} to ${a.toPlan}`;
    case "free":
      return `${n} to a free plan or shared seat`;
    case "upgrade":
      return `Consider ${a.toPlan} for ${n}`;
    default:
      return `Keep ${n}`;
  }
}

/** Barra sottile dei 4 gruppi (proporzioni), con testo accessibile. */
function SegmentBar({ counts, className = "" }: { counts: Record<Segment, number>; className?: string }) {
  const total = SEG.reduce((t, s) => t + counts[s.key], 0);
  if (!total) return <div className={className} />;
  return (
    <div className={`flex h-1.5 w-full overflow-hidden rounded-full bg-ink-100/[0.06] gap-px ${className}`} role="img" aria-label={SEG.map((s) => `${s.label} ${counts[s.key]}`).join(", ")}>
      {SEG.map((s) => (counts[s.key] ? <span key={s.key} className={`h-full ${s.bar}`} style={{ width: `${(counts[s.key] / total) * 100}%` }} /> : null))}
    </div>
  );
}

/**
 * "Right plan for each person": chi tenere, chi passare a un piano più
 * economico, chi togliere — con l'effetto in euro. Nomi solo in modalità "By person".
 */
export default function RightsizeCard({ assets, saveMonthlyEur, upgradeMonthlyEur, counts, individual }: RightsizeCardProps) {
  const n = (x: number) => (individual ? String(x) : maskCount(x));
  const shown = assets.filter((a) => a.actions.some((x) => x.kind !== "keep")).slice(0, MAX_ROWS);
  const total = SEG.reduce((t, s) => t + counts[s.key], 0);

  return (
    <Section
      id="right-plan"
      title="Right plan for each person"
      meta="From each person's use in the last 30 days"
      action={saveMonthlyEur >= 1 ? <Pill tone="accent">{eur(saveMonthlyEur)} a month</Pill> : undefined}
      footer={
        total > 0 ? (
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
            {SEG.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 tabular">
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
                {s.label} <b className="font-medium text-ink-100">{n(counts[s.key])}</b>
              </span>
            ))}
            {upgradeMonthlyEur >= 1 && <span className="ml-auto tabular">Upgrades would add {eur(upgradeMonthlyEur)} a month</span>}
          </span>
        ) : undefined
      }
    >
      {total === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-400">No paid seats with known users yet.</p>
      ) : shown.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-400">Every seat is on the right plan.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {shown.map((a) => {
            const moves = a.actions.filter((x) => x.kind !== "keep");
            const named = individual && moves.some((x) => x.people?.length);
            return (
              <li key={a.assetId} className="px-5 py-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_auto] items-center gap-x-5 gap-y-2">
                  <Link href={`/assets/${a.assetId}?tab=people`} className="flex items-center gap-3 min-w-0 group">
                    <VendorBadge vendor={a.vendor ?? ""} name={a.name} size={28} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink-100 truncate group-hover:underline">{a.name}</span>
                      <span className="block text-xs text-ink-400 truncate tabular">
                        {a.planName ?? "Seats"} · {fmtEur(a.seatEur, { decimals: a.seatEur < 100 })} each a month
                      </span>
                    </span>
                  </Link>
                  <SegmentBar counts={a.counts} className="hidden sm:flex" />
                  <span className="text-sm tabular text-ink-100 text-right">
                    {a.saveMonthlyEur >= 1 ? eur(a.saveMonthlyEur) : "—"}
                    <span className="block text-xs text-ink-400">a month</span>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {moves.map((x) => (
                    <Pill key={x.kind + (x.toPlan ?? "")} tone={x.kind === "remove" ? "alarm" : x.kind === "upgrade" ? "muted" : "signal"}>
                      {actionText(x, n(x.count))}
                      {x.monthlyEur !== 0 && <span className="ml-1 opacity-80">· {x.monthlyEur > 0 ? "−" : "+"}{eur(Math.abs(x.monthlyEur))}</span>}
                    </Pill>
                  ))}
                </div>
                {named && (
                  <details className="mt-2 group">
                    <summary className="cursor-pointer list-none text-xs text-ink-400 hover:text-ink-100 select-none">
                      Who <span className="inline-block transition-transform group-open:rotate-90">›</span>
                    </summary>
                    <dl className="mt-1.5 grid grid-cols-1 sm:grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
                      {moves
                        .filter((x) => x.people?.length)
                        .map((x) => (
                          <div key={x.kind + (x.toPlan ?? "")} className="contents">
                            <dt className="text-ink-400">{x.kind === "remove" ? "Remove" : x.kind === "upgrade" ? "Heavy users" : x.kind === "free" ? "Free or shared" : `To ${x.toPlan}`}</dt>
                            <dd className="text-ink-100">{x.people!.join(", ")}</dd>
                          </div>
                        ))}
                    </dl>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

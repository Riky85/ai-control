import Link from "next/link";
import { db } from "@/lib/db";
import { vendorRiskFor, vendorFlags, RESIDENCY_LABEL, TRAINING_LABEL, type Residency, type Training } from "@/lib/vendor-risk";

const tone = (v: Residency | Training, good: string[]) => (good.includes(v) ? "text-steady" : v === "unknown" ? "text-ink-400" : v === "enterprise" || v === "choice" ? "text-signal" : "text-alarm");

/** Scheda compatta "Vendor risk" per il passaporto di un'AI. */
export default function VendorRiskCard({ asset }: { asset: { vendor: string | null; serviceId: string | null; type?: string; dataAccess?: { dataAsset: { sensitivity: string } }[]; cost?: { planId: string | null } | null } }) {
  const r = vendorRiskFor(asset);
  if (!r) return null;
  const flags = vendorFlags(r, { type: asset.type, dataSensitivities: asset.dataAccess?.map((d) => d.dataAsset.sensitivity), paidPlan: !!asset.cost?.planId });
  const row = (label: string, value: React.ReactNode, cls = "text-ink-100") => (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="text-ink-400 shrink-0">{label}</dt>
      <dd className={`text-right ${cls}`}>{value}</dd>
    </div>
  );
  return (
    <div className="rounded-xl border border-line bg-panel p-5 animate-rise">
      <div className="-mx-5 -mt-5 mb-4 flex items-center justify-between gap-3 bg-ink border-b border-line rounded-t-xl px-5 py-3 bar-head">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink-100">Vendor risk — {r.vendor}</h2>
          <p className="text-xs text-ink-400 mt-0.5">{r.verified ? `Checked against public vendor documents on ${r.lastReviewed}.` : "Unverified — check with the vendor."} Not legal advice.</p>
        </div>
        {r.trustUrl && (
          <a href={r.trustUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm shrink-0">Trust center ↗</a>
        )}
      </div>
      {flags.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1.5">
          {flags.map((f) => (
            <li key={f.kind} className="text-xs rounded-md bg-alarm/10 text-alarm px-2.5 py-1.5">{f.label}</li>
          ))}
        </ul>
      )}
      <dl className="text-sm divide-y divide-line">
        {row("Headquarters", r.hq)}
        {row("EU data residency", <span title={r.residencyNote}>{RESIDENCY_LABEL[r.euResidency]}</span>, tone(r.euResidency, ["yes"]))}
        {row("Trains on data — consumer plans", <span title={r.trainingNote}>{TRAINING_LABEL[r.trainsConsumer]}</span>, tone(r.trainsConsumer, ["no"]))}
        {row("Trains on data — business plans", <span title={r.trainingNote}>{TRAINING_LABEL[r.trainsBusiness]}</span>, tone(r.trainsBusiness, ["no"]))}
        {row("DPA", r.dpaUrl ? <a href={r.dpaUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-accent">Available ↗</a> : r.verified ? "Not found" : "Check", r.dpaUrl ? "text-ink-100" : "text-ink-400")}
        {row("Certifications", r.certifications.length ? r.certifications.join(", ") : r.verified ? "None found" : "Check", r.certifications.length ? "text-ink-100" : "text-ink-400")}
        {r.subprocessorsUrl && row("Sub-processors", <a href={r.subprocessorsUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-accent">List ↗</a>)}
      </dl>
      {(r.residencyNote || r.trainingNote) && <p className="text-xs text-ink-400 mt-3">{[r.residencyNote, r.trainingNote].filter(Boolean).join(" ")}</p>}
    </div>
  );
}

/** Avvisi in pagina (Governance): AI con dati personali senza residenza UE, o fornitori che addestrano di default. */
export async function VendorRiskFlags({ orgId }: { orgId: string }) {
  const assets = await db.aiAsset.findMany({
    where: { organizationId: orgId, deletedAt: null, status: { not: "UNAPPROVED" } },
    select: { id: true, name: true, vendor: true, serviceId: true, type: true, cost: { select: { planId: true } }, dataAccess: { select: { dataAsset: { select: { sensitivity: true } } } } },
    orderBy: { name: "asc" },
    take: 500,
  });
  const hits = assets
    .map((a) => ({ a, flags: vendorFlags(vendorRiskFor(a), { type: a.type, dataSensitivities: a.dataAccess.map((d) => d.dataAsset.sensitivity), paidPlan: !!a.cost?.planId }) }))
    .filter((x) => x.flags.length > 0);
  if (!hits.length) return null;
  const shown = hits.slice(0, 6);
  return (
    <div className="rounded-xl border border-line bg-panel p-5 animate-rise">
      <h2 className="-mx-5 -mt-5 mb-2 bg-ink border-b border-line rounded-t-xl px-5 py-3 text-sm font-bold text-ink-100 bar-head">Vendor risk to check ({hits.length})</h2>
      <ul className="flex flex-col divide-y divide-line">
        {shown.map(({ a, flags }) => (
          <li key={a.id} className="py-2 flex items-start gap-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${flags.some((f) => f.kind === "personal_data_no_eu") ? "bg-alarm" : "bg-signal"}`} />
            <Link href={`/assets/${a.id}?tab=risk`} className="flex-1 min-w-0 hover:underline">
              <span className="text-sm text-ink-100">{a.name}</span>
              <span className="block text-xs text-ink-400">{flags.map((f) => f.label).join(" · ")}</span>
            </Link>
          </li>
        ))}
      </ul>
      {hits.length > shown.length && <p className="-mx-5 -mb-5 mt-2 bg-ink border-t border-line rounded-b-xl px-5 py-3 text-xs text-ink-400 bar-foot">+{hits.length - shown.length} more — see the Risk tab of each AI.</p>}
    </div>
  );
}

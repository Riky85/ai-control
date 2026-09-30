import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { featureEnabled } from "@/lib/plan-gate";
import LockedFeature from "@/components/LockedFeature";
import { readiness, suggestionFor, timeline, TIER_LABEL } from "@/lib/compliance";
import { applySuggestedTierAction, applyAllSuggestionsAction, recordLiteracyAction } from "@/lib/compliance-actions";
import { PageHeader, StatCard, Table, td, Notice } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";
import { fmtDate } from "@/lib/format";
import type { EuAiActTier, AiAssetStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const TIER_CLS: Record<EuAiActTier, string> = {
  UNCLASSIFIED: "text-ink-400 bg-ink-400/10",
  MINIMAL_RISK: "text-steady bg-steady/10",
  LIMITED_RISK: "text-signal bg-signal/10",
  HIGH_RISK: "text-alarm bg-alarm/10",
};
const STATUS_LABEL: Record<AiAssetStatus, string> = {
  APPROVED: "Allowed",
  UNAPPROVED: "Not allowed",
  UNREVIEWED: "To review",
  UNKNOWN: "To review",
};

function TierPill({ tier }: { tier: EuAiActTier }) {
  return <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap ${TIER_CLS[tier]}`}>{TIER_LABEL[tier]}</span>;
}

export default async function CompliancePage({ searchParams }: { searchParams: { error?: string; applied?: string } }) {
  const r = await readiness(currentOrgId());
  const rows = r.assets.map((a) => ({ a, sug: suggestionFor(a) }));
  const pendingUnclassified = rows.filter((x) => x.a.euAiActTier === "UNCLASSIFIED" && x.sug.tier !== "UNCLASSIFIED").length;
  const bar = r.score >= 80 ? "bg-steady" : r.score >= 50 ? "bg-signal" : "bg-alarm";
  const steps = timeline();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI Act"
        subtitle="EU AI Act readiness for every AI your company uses."
        action={
          (await featureEnabled(currentOrgId(), "registerExport")) ? (
            <a href="/api/export/register" className="btn btn-secondary btn-sm">
              Download AI register (Excel)
            </a>
          ) : <LockedFeature feature="registerExport" label="Download AI register (Excel)" className="btn btn-secondary btn-sm" />
        }
      />

      {searchParams.applied && <Notice tone="success">{Number(searchParams.applied) ? `Classified ${searchParams.applied} AI with the suggested risk class.` : "Every AI already had a risk class — nothing changed."}</Notice>}

      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-line bg-panel p-5 min-h-[112px] flex flex-col justify-between gap-4 animate-rise">
          <div className="text-sm text-ink-400">Readiness</div>
          <div>
            <div className="font-display text-[30px] leading-none font-semibold tracking-tight tabular text-ink-100">
              {r.score}
              <span className="text-base text-ink-400 font-normal">/100</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-100/[0.06]">
              <div className={`h-full rounded-full ${bar}`} style={{ width: `${r.score}%` }} />
            </div>
          </div>
        </div>
        <StatCard label="AI classified" value={`${r.classified}/${r.total}`} hint={r.total - r.classified ? `${r.total - r.classified} still to classify` : "All classified"} tone={r.total - r.classified ? "signal" : undefined} />
        <StatCard label="High-risk AI" value={String(r.highRisk)} hint="Annex III uses: HR, credit, education…" tone={r.highRisk ? "alarm" : undefined} />
        <StatCard label="Missing owners" value={String(r.missingOwners)} hint="Allowed or high-risk AI without an owner" tone={r.missingOwners ? "signal" : undefined} href="/assets" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/compliance/evidence" className="rounded-xl border border-line bg-panel p-5 flex items-start gap-4 hover:border-ink-400 transition-colors">
          <div className="flex-1">
            <div className="text-sm font-semibold text-ink-100">Evidence pack (AI Act / NIS2)</div>
            <div className="text-xs text-ink-400 mt-0.5">Inventory, readiness, training, policies, AI suppliers, critical incidents and a tamper-evident audit log — print it or download JSON with a SHA-256 fingerprint.</div>
          </div>
          <span className="btn btn-secondary btn-sm shrink-0">Open</span>
        </Link>
        <Link href="/compliance/employee-notice" className="rounded-xl border border-line bg-panel p-5 flex items-start gap-4 hover:border-ink-400 transition-colors">
          <div className="flex-1">
            <div className="text-sm font-semibold text-ink-100">Employee notice</div>
            <div className="text-xs text-ink-400 mt-0.5">Ready-to-use GDPR notice for staff in English, Italian (art. 4 Statuto dei lavoratori) or German (§87 BetrVG) — from what angar really collects.</div>
          </div>
          <span className="btn btn-secondary btn-sm shrink-0">Open</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border border-line bg-panel p-5">
          <h2 className="-mx-5 -mt-5 mb-4 bg-ink border-b border-line rounded-t-xl px-5 py-3 text-sm font-semibold text-ink-100 bar-head">What counts towards the score</h2>
          <ul className="flex flex-col divide-y divide-line">
            {r.checks.map((c) => {
              const dot = c.fraction >= 1 ? "bg-steady" : c.fraction > 0 ? "bg-signal" : "bg-alarm";
              return (
                <li key={c.key} className="py-2.5 flex items-start gap-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-100">{c.href ? <Link href={c.href} className="hover:underline">{c.label}</Link> : c.label}</div>
                    <div className="text-xs text-ink-400">{c.detail}</div>
                  </div>
                  <span className="text-xs text-ink-400 tabular shrink-0">
                    {Math.round(c.weight * c.fraction)}/{c.weight}
                  </span>
                </li>
              );
            })}
          </ul>
          <form action={recordLiteracyAction} className="mt-3 flex items-center gap-2 border-t border-line pt-4">
            <input name="note" className="field flex-1" placeholder="Record AI literacy training, e.g. All staff: 1h AI basics" aria-label="AI literacy training" />
            <button className="btn btn-secondary btn-sm shrink-0">Record</button>
          </form>
        </section>

        <section className="rounded-xl border border-line bg-panel p-5">
          <h2 className="-mx-5 -mt-5 mb-4 bg-ink border-b border-line rounded-t-xl px-5 py-3 text-sm font-semibold text-ink-100 bar-head">Timeline</h2>
          <ol className="flex flex-col gap-3">
            {steps.map((s) => (
              <li key={s.title} className="flex items-start gap-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.inForce ? "bg-accent" : "bg-ink-400/50"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-100">{s.title}</span>
                    {s.inForce ? (
                      <span className="text-[11px] font-medium rounded-full px-2 py-0.5 text-accent bg-accent/10">In force</span>
                    ) : (
                      <span className="text-[11px] font-medium rounded-full px-2 py-0.5 text-ink-400 bg-ink-400/10">Upcoming</span>
                    )}
                  </div>
                  <div className="text-xs text-ink-400">
                    {fmtDate(s.date)} · {s.detail}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <Table title="Your AI" note="Suggested classes come from what each AI does. Tiers you set by hand are never overwritten in bulk." action={pendingUnclassified > 0 ? (
            <form action={applyAllSuggestionsAction}>
              <button className="btn btn-primary btn-sm" title="Classifies every AI that has no risk class yet">
                Apply all suggestions ({pendingUnclassified})
              </button>
            </form>
          ) : undefined} columns={["AI", "Current class", "Suggested", "Owner", "Status"]} empty={rows.length ? false : "No AI found yet — connect a source to start your AI register."}>
          {rows.map(({ a, sug }) => (
            <tr key={a.id}>
              <td className={td}>
                <Link href={`/assets/${a.id}`} className="flex items-center gap-3 hover:underline">
                  <VendorBadge vendor={a.vendor ?? ""} name={a.name} size={28} />
                  <span className="font-medium text-ink-100">{a.name}</span>
                </Link>
              </td>
              <td className={td}>
                <TierPill tier={a.euAiActTier} />
              </td>
              <td className={td}>
                {sug.tier === a.euAiActTier ? (
                  <span className="text-xs text-ink-400">Matches</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span title={sug.reason}>
                      <TierPill tier={sug.tier} />
                    </span>
                    <form action={applySuggestedTierAction}>
                      <input type="hidden" name="assetId" value={a.id} />
                      <button className="btn btn-secondary btn-sm">Apply</button>
                    </form>
                  </div>
                )}
                <div className="text-xs text-ink-400 mt-1 max-w-sm">{sug.reason}</div>
              </td>
              <td className={`${td} ${a.owner ? "text-ink-100" : a.euAiActTier === "HIGH_RISK" ? "text-alarm" : "text-ink-400"}`}>{a.owner ? a.owner.name ?? a.owner.email : "No owner"}</td>
              <td className={`${td} text-ink-400`}>{STATUS_LABEL[a.status]}</td>
            </tr>
          ))}
        </Table>

      <p className="text-xs text-ink-400">Guidance, not legal advice — confirm high-risk cases with your DPO or counsel.</p>
    </div>
  );
}

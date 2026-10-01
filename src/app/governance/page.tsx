import { currentOrgId } from "@/lib/org";
import { currentSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Tabs } from "@/components/ui";
import { vendorRiskFor, vendorFlags, planTier, trainsOnYourData } from "@/lib/vendor-risk";
import { PLANS } from "@/lib/pricing/catalog";
import { listExposedKeys } from "@/lib/secrets-scan";
import ExportMenu from "@/components/ExportMenu";
import { POLICY_LIBRARY } from "@/lib/policy-library";
import PolicyAckPanel from "@/components/PolicyAckPanel";
import { VendorRiskFlags } from "@/components/VendorRiskCard";
import { readiness, timeline } from "@/lib/compliance";
import { computeScoreCached } from "@/lib/engine/score";
import { featureEnabled } from "@/lib/plan-gate";
import { GovernanceHeader, DecisionsCard, AiActCard, RecordsCard, type Holdback, type TierKey } from "@/components/governance/cards";
import PoliciesSection from "@/components/governance/PoliciesSection";
import AssuranceView from "@/components/governance/AssuranceView";
import { Chevron } from "@/components/governance/parts";
import VendorFacts, { type VendorFactRow } from "@/components/governance/VendorFacts";
import ExposedKeys from "@/components/governance/ExposedKeys";

export const dynamic = "force-dynamic";

const DAY = 86400000;

// I driver dell'asse Governance puntano a pagine generiche: qui li portiamo al posto giusto.
const HREF_FIX: Record<string, string> = { "/policies": "#policies", "/governance": "/assets" };

// Governance: testata (asse Governance + prontezza AI Act), poi decisioni, AI Act,
// policy, AI literacy e registri. Ogni blocco ha un solo prossimo passo.
export default async function GovernancePage({ searchParams }: { searchParams: { tab?: string; ack?: string; n?: string; error?: string } }) {
  const orgId = currentOrgId();
  const assurance = searchParams.tab === "assurance";
  const canEdit = ["ADMIN", "OWNER"].includes(currentSession()?.role ?? "");

  const [score, r, policies, vendorAssets, registerOk, exposed, github] = await Promise.all([
    computeScoreCached(orgId).catch(() => null),
    readiness(orgId),
    db.policy.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" } }),
    db.aiAsset.findMany({
      where: { organizationId: orgId, deletedAt: null, status: { not: "UNAPPROVED" } },
      select: {
        vendor: true,
        serviceId: true,
        type: true,
        cost: { select: { planId: true, monthlyCostEstimate: true, basis: true } },
        dataAccess: { select: { dataAsset: { select: { sensitivity: true } } } },
      },
      take: 500,
    }),
    featureEnabled(orgId, "registerExport").catch(() => false),
    listExposedKeys(orgId).catch(() => []),
    db.connector.findUnique({ where: { organizationId_provider: { organizationId: orgId, provider: "GITHUB" } }, select: { status: true } }).catch(() => null),
  ]);
  // Fornitori delle AI in uso: una riga ciascuno, con quante AI addestrano sui dati col piano in uso.
  const byVendor = new Map<string, VendorFactRow>();
  for (const a of vendorAssets) {
    const v = vendorRiskFor(a);
    if (!v) continue;
    const plan = a.cost?.planId ? PLANS.find((p) => p.id === a.cost!.planId) : undefined;
    const paid = (a.cost?.monthlyCostEstimate ?? 0) > 0 && a.cost?.basis !== "estimate";
    const trains = trainsOnYourData(v, planTier({ type: a.type, planBusiness: plan ? plan.business : null, paidByCompany: paid })) === "yes";
    const row = byVendor.get(v.key) ?? { key: v.key, vendor: v.vendor, hq: v.hq, aiCount: 0, trainsCount: 0, euResidency: v.euResidency, hasDpa: !!v.dpaUrl, verified: v.verified };
    row.aiCount += 1;
    if (trains) row.trainsCount += 1;
    byVendor.set(v.key, row);
  }
  const vendorRows = [...byVendor.values()].sort((a, b) => b.trainsCount - a.trainsCount || b.aiCount - a.aiCount || a.vendor.localeCompare(b.vendor));
  const vendorFlagged = vendorAssets.filter((a) => vendorFlags(vendorRiskFor(a), { type: a.type, dataSensitivities: a.dataAccess.map((d) => d.dataAsset.sensitivity), paidPlan: !!a.cost?.planId }).length > 0).length;

  // Cosa tiene giù il punteggio: driver dell'asse Governance, altrimenti i controlli AI Act non superati.
  const holds: Holdback[] = score
    ? score.drivers
        .filter((d) => d.axis === "governance" && d.impact < 0 && !d.missingData)
        .sort((a, b) => a.impact - b.impact)
        .map((d) => ({ label: d.label, href: HREF_FIX[d.href] ?? d.href, pts: -d.impact }))
    : r.checks
        .filter((c) => c.fraction < 1)
        .map((c) => ({ label: c.label, href: c.href ?? "/compliance", pts: Math.round(c.weight * (1 - c.fraction)) }))
        .sort((a, b) => b.pts - a.pts);

  // Decisioni sulle AI (stessa definizione di "in uso" della prontezza AI Act: ultimi 30 giorni).
  const now = Date.now();
  const recent = (d: Date | null | undefined) => !!d && now - d.getTime() < 30 * DAY;
  const status = (s: string) => r.assets.filter((a) => a.status === s);
  const decisions = {
    allowed: status("APPROVED").length,
    review: status("UNREVIEWED").length + status("UNKNOWN").length,
    notAllowed: status("UNAPPROVED").length,
    blockedInUse: status("UNAPPROVED").filter((a) => recent(a.lastSeenAt) || a.usages.some((u) => recent(u.lastSeenAt))).length,
    noOwner: status("APPROVED").filter((a) => !a.ownerId).length,
  };

  const tiers = { HIGH_RISK: 0, LIMITED_RISK: 0, MINIMAL_RISK: 0, UNCLASSIFIED: 0 } as Record<TierKey, number>;
  for (const a of r.assets) tiers[a.euAiActTier as TierKey] = (tiers[a.euAiActTier as TierKey] ?? 0) + 1;
  const steps = timeline();
  const upcoming = steps.find((s) => !s.inForce);

  const templates = POLICY_LIBRARY.filter((t) => !policies.some((p) => p.name === t.name));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Governance" subtitle="Rules and records for every AI." action={<ExportMenu dataset="assets" />} />

      <Tabs
        active={assurance ? "assurance" : "overview"}
        items={[
          { key: "overview", label: "Overview", href: "/governance" },
          { key: "assurance", label: "Assurance checks", href: "/governance?tab=assurance" },
        ]}
      />

      <GovernanceHeader governance={score ? score.axes.governance : null} readiness={r.score} holds={holds} />

      {assurance ? (
        <AssuranceView orgId={orgId} />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DecisionsCard d={decisions} />
            <AiActCard
              d={{
                readiness: r.score,
                tiers,
                missingOwners: r.missingOwners,
                literacyRecorded: !!r.literacy,
                nextDate: upcoming ? { date: upcoming.date.toISOString(), title: upcoming.title } : null,
                inForce: steps.filter((s) => s.inForce).length,
                phases: steps.length,
              }}
            />
          </div>

          {(vendorFlagged > 0 || vendorRows.length > 0) && (
            <details id="vendor-risk" className="group scroll-mt-6">
              <summary className="cursor-pointer list-none select-none rounded-xl border border-line bg-panel px-4 py-3 flex items-center gap-3 text-sm hover:border-ink-400 transition-colors animate-rise">
                <span className={`h-2 w-2 shrink-0 rounded-full ${vendorFlagged > 0 ? "bg-signal" : "bg-steady"}`} aria-hidden />
                <span className="flex-1 min-w-0 text-ink-100">
                  {vendorFlagged > 0 ? (
                    <>
                      <b className="font-medium tabular">{vendorFlagged}</b> AI with vendor terms to check
                    </>
                  ) : (
                    <>
                      Vendor terms · <b className="font-medium tabular">{vendorRows.length}</b> {vendorRows.length === 1 ? "vendor" : "vendors"} in use
                    </>
                  )}
                </span>
                <Chevron />
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                <VendorFacts rows={vendorRows} />
                <VendorRiskFlags orgId={orgId} />
              </div>
            </details>
          )}

          <ExposedKeys
            githubConnected={github?.status === "CONNECTED" || github?.status === "SYNCING"}
            rows={exposed.map((k) => ({ repo: k.repo, path: k.path, url: k.url, provider: k.provider, masked: k.masked, firstSeen: k.firstSeen.toISOString() }))}
          />

          <PoliciesSection
            canEdit={canEdit}
            libraryTotal={POLICY_LIBRARY.length}
            policies={policies.map((p) => ({ id: p.id, name: p.name, description: p.description, category: p.category, enabled: p.enabled }))}
            templates={templates.map((t) => ({ name: t.name, description: t.description, category: t.category }))}
          />

          <PolicyAckPanel orgId={orgId} flash={searchParams} training={r.literacy ? { date: r.literacy.createdAt, summary: r.literacy.summary } : null} />

          <RecordsCard
            links={[
              { href: "/api/export/register", label: "AI register", tag: "Excel · every AI", download: true, locked: !registerOk },
              { href: "/compliance/evidence", label: "Evidence pack", tag: "AI Act · NIS2 · SHA-256" },
              { href: "/audit", label: "Audit log", tag: "Tamper-evident" },
              { href: "/governance?tab=assurance", label: "Assurance checks", tag: "Checks for each AI" },
              { href: "/data", label: "Data exposure", tag: "What AI can reach" },
              { href: "/activity", label: "Activity", tag: "What AI did" },
              { href: "/changes", label: "Changes", tag: "What changed and when" },
              { href: "/compliance/employee-notice", label: "Employee notice", tag: "GDPR · EN, IT, DE" },
            ]}
          />
        </>
      )}
    </div>
  );
}

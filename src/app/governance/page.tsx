import { currentOrgId } from "@/lib/org";
import { currentSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, StatCard } from "@/components/ui";
import { vendorRiskFor, vendorFlags } from "@/lib/vendor-risk";
import ExportMenu from "@/components/ExportMenu";
import Badge from "@/components/Badge";
import StatusDot from "@/components/StatusDot";
import Link from "next/link";
import { POLICY_LIBRARY } from "@/lib/policy-library";
import PolicyAckPanel from "@/components/PolicyAckPanel";
import { VendorRiskFlags } from "@/components/VendorRiskCard";
import {
  createPolicyAction,
  addPolicyFromLibraryAction,
  togglePolicyAction,
  deletePolicyAction,
} from "@/lib/actions";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  data_access: "Data access",
  approval: "Approval",
  environment: "Environment",
  vendor: "Vendor",
  other: "Other",
};
const LEVEL_LABEL: Record<string, string> = {
  ASSURED: "Assured",
  NEEDS_REVIEW: "Needs review",
  RESTRICTED: "Restricted",
  BLOCKED: "Blocked",
};

interface CheckRow {
  key: string;
  label: string;
  status: "PASSED" | "WARNING" | "FAILED";
  detail: string;
}

const RECORDS = [
  { href: "/data", label: "Data exposure" },
  { href: "/activity", label: "Activity" },
  { href: "/audit", label: "Audit log" },
  { href: "/compliance/evidence", label: "Evidence pack" },
  { href: "/governance?tab=assurance", label: "Assurance checks" },
];

// Una pagina: tre riquadri in alto (AI Act, policy, registri), poi le policy.
export default async function GovernancePage({ searchParams }: { searchParams: { tab?: string; ack?: string; n?: string; error?: string } }) {
  const orgId = currentOrgId();
  const assurance = searchParams.tab === "assurance";
  const [policyCount, unclassified, vendorAssets] = await Promise.all([
    db.policy.count({ where: { organizationId: orgId, enabled: true } }),
    db.aiAsset.count({ where: { organizationId: orgId, deletedAt: null, euAiActTier: "UNCLASSIFIED" } }),
    db.aiAsset.findMany({
      where: { organizationId: orgId, deletedAt: null, status: { not: "UNAPPROVED" } },
      select: { vendor: true, serviceId: true, type: true, cost: { select: { planId: true } }, dataAccess: { select: { dataAsset: { select: { sensitivity: true } } } } },
      take: 500,
    }),
  ]);
  const vendorFlagged = vendorAssets.filter((a) => vendorFlags(vendorRiskFor(a), { type: a.type, dataSensitivities: a.dataAccess.map((d) => d.dataAsset.sensitivity), paidPlan: !!a.cost?.planId }).length > 0).length;
  const ackOpen = Boolean(searchParams.ack || searchParams.n || searchParams.error);
  const card = "rounded-xl border border-line bg-panel p-5 flex flex-col gap-2";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Governance" subtitle="Rules and records for every AI." action={<ExportMenu dataset="assets" />} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/compliance" className={`${card} hover:border-ink-400 transition-colors`}>
          <span className="text-sm text-ink-400">AI Act readiness</span>
          <span className="text-sm text-ink-100">{unclassified ? `${unclassified} AI to classify` : "All AI classified"}</span>
          <span className="text-sm text-accent mt-auto">Open →</span>
        </Link>
        <a href="#policies" className={`${card} hover:border-ink-400 transition-colors`}>
          <span className="text-sm text-ink-400">Policies</span>
          <span className="font-display text-[28px] leading-none font-semibold tabular text-ink-100">{policyCount}</span>
          <span className="text-xs text-ink-400">active</span>
        </a>
        <div className={card}>
          <span className="text-sm text-ink-400">Records</span>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {RECORDS.map((r) => (
              <Link key={r.href} href={r.href} className="text-ink-100 hover:underline">{r.label}</Link>
            ))}
          </div>
        </div>
      </div>

      {assurance ? (
        <>
          <Link href="/governance" className="text-sm text-ink-400 hover:text-ink-100 w-fit">← Back to policies</Link>
          <AssuranceTab />
        </>
      ) : (
        <>
          <details className="group" open={ackOpen}>
            <summary className="cursor-pointer list-none text-sm text-ink-400 hover:text-ink-100 inline-flex items-center gap-1.5 select-none">
              <span className="transition-transform group-open:rotate-90">›</span> Employee acknowledgement &amp; AI literacy
            </summary>
            <div className="mt-3"><PolicyAckPanel orgId={orgId} flash={searchParams} /></div>
          </details>
          {vendorFlagged > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none text-sm text-ink-400 hover:text-ink-100 inline-flex items-center gap-1.5 select-none">
                <span className="transition-transform group-open:rotate-90">›</span> Vendor risk to check · {vendorFlagged}
              </summary>
              <div className="mt-3"><VendorRiskFlags orgId={orgId} /></div>
            </details>
          )}
          <PoliciesTab />
        </>
      )}
    </div>
  );
}

async function PoliciesTab() {
  const canEdit = ["ADMIN", "OWNER"].includes(currentSession()?.role ?? "");
  const policies = await db.policy.findMany({ where: { organizationId: currentOrgId() }, orderBy: { createdAt: "desc" } });
  const activeNames = new Set(policies.map((p) => p.name));
  const availableTemplates = POLICY_LIBRARY.filter((t) => !activeNames.has(t.name));

  return (
    <div id="policies" className="flex flex-col gap-6 scroll-mt-6">
      <div>
        <h2 className="text-base font-semibold text-ink-100 mb-3">Policies</h2>
        {policies.length === 0 && (
          <div className="rounded-xl border border-line bg-panel p-5 text-sm text-ink-400">
            No policies yet — add one from the library.
          </div>
        )}
        <div className="flex flex-col gap-5">
          {(["environment", "approval", "data_access", "vendor", "other"] as const).map((category) => {
            const inCategory = policies.filter((p) => p.category === category);
            if (inCategory.length === 0) return null;
            return (
              <div key={category}>
                <div className="text-xs text-ink-400 mb-2">{CATEGORY_LABEL[category]}</div>
                <div className="rounded-xl border border-line bg-panel divide-y divide-line">
                  {inCategory.map((p) => (
                    <div key={p.id} className="px-5 py-4 flex items-start justify-between gap-4">
                      <div>
                        <span className="text-sm font-medium text-ink-100">{p.name}</span>
                        <p className="text-sm text-ink-400 mt-1">{p.description}</p>
                      </div>
                      {!canEdit ? (
                        <span className="text-xs text-ink-400 shrink-0">{p.enabled ? "Enabled" : "Disabled"}</span>
                      ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <form action={togglePolicyAction}>
                          <input type="hidden" name="policyId" value={p.id} />
                          <input type="hidden" name="enabled" value={String(p.enabled)} />
                          <button type="submit" className={`btn btn-sm ${p.enabled ? "btn-secondary" : "btn-ghost"}`}>
                            {p.enabled ? "Enabled" : "Disabled"}
                          </button>
                        </form>
                        <form action={deletePolicyAction}>
                          <input type="hidden" name="policyId" value={p.id} />
                          <button type="submit" className="btn btn-ghost btn-sm">Remove</button>
                        </form>
                      </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {canEdit && availableTemplates.length > 0 && (
        <details className="group" open={policies.length === 0}>
          <summary className="cursor-pointer list-none text-sm font-medium text-ink-100 inline-flex items-center gap-1.5 select-none mb-3">
            <span className="text-ink-400 transition-transform group-open:rotate-90">›</span> Add from the library · {availableTemplates.length}
          </summary>
          <div className="rounded-xl border border-line bg-panel divide-y divide-line">
            {availableTemplates.map((t) => (
              <div key={t.name} className="px-5 py-4 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-100">{t.name}</span>
                    <span className="text-xs text-ink-400 border border-line rounded px-1.5 py-0.5">{CATEGORY_LABEL[t.category]}</span>
                  </div>
                  <p className="text-sm text-ink-400 mt-1">{t.description}</p>
                </div>
                <form action={addPolicyFromLibraryAction} className="shrink-0">
                  <input type="hidden" name="name" value={t.name} />
                  <input type="hidden" name="description" value={t.description} />
                  <input type="hidden" name="category" value={t.category} />
                  <button type="submit" className="btn btn-secondary btn-sm">
                    Add
                  </button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}

      {canEdit && (
      <details className="group">
        <summary className="cursor-pointer list-none text-sm font-medium text-ink-100 inline-flex items-center gap-1.5 select-none mb-3">
          <span className="text-ink-400 transition-transform group-open:rotate-90">›</span> Write a custom policy
        </summary>
        <form action={createPolicyAction} className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-400">Name</label>
            <input name="name" required placeholder="e.g. Agents cannot create discounts above 20%" className="field" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-400">Description</label>
            <textarea name="description" required rows={2} className="field" />
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-ink-400">Category</label>
              <select name="category" className="field">
                <option value="data_access">Data access</option>
                <option value="approval">Approval</option>
                <option value="environment">Environment</option>
                <option value="vendor">Vendor</option>
                <option value="other">Other</option>
              </select>
            </div>
            <button type="submit" className="btn btn-secondary">
              Add policy
            </button>
          </div>
        </form>
      </details>
      )}
    </div>
  );
}

async function AssuranceTab() {
  const assets = await db.aiAsset.findMany({
    where: { organizationId: currentOrgId(), deletedAt: null },
    include: { assuranceReports: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const withReport = assets.map((a) => ({ asset: a, report: a.assuranceReports[0] })).filter((x) => x.report);
  const totalChecks = withReport.reduce((sum, x) => sum + x.report!.passedCount + x.report!.warningCount + x.report!.failedCount, 0);
  const totalPassed = withReport.reduce((sum, x) => sum + x.report!.passedCount, 0);
  const totalWarning = withReport.reduce((sum, x) => sum + x.report!.warningCount, 0);
  const totalFailed = withReport.reduce((sum, x) => sum + x.report!.failedCount, 0);

  const groups = (["BLOCKED", "RESTRICTED", "NEEDS_REVIEW", "ASSURED"] as const).map((level) => ({
    level,
    items: withReport.filter((x) => x.report!.level === level),
  }));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ink-400">{totalChecks} checks across {withReport.length} AI.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Passed" value={String(totalPassed)} />
        <StatCard label="Warnings" value={String(totalWarning)} tone={totalWarning > 0 ? "signal" : undefined} />
        <StatCard label="Failed" value={String(totalFailed)} tone={totalFailed > 0 ? "alarm" : undefined} />
      </div>

      {groups.map(({ level, items }) =>
        items.length > 0 ? (
          <div key={level}>
            <h2 className="text-base font-semibold text-ink-100 mb-3">
              {LEVEL_LABEL[level]} ({items.length})
            </h2>
            <div className="flex flex-col gap-3">
              {items.map(({ asset, report }) => (
                <div key={asset.id} className="rounded-xl border border-line bg-panel p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Link href={`/assets/${asset.id}`} className="font-medium text-sm text-ink-100 hover:underline">
                      {asset.name}
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-ink-400 tabular">{report!.score}%</span>
                      <Badge>{report!.level}</Badge>
                    </span>
                  </div>
                  <ul className="text-xs flex flex-col gap-1.5">
                    {(report!.checks as unknown as CheckRow[])
                      .filter((c) => c.status !== "PASSED")
                      .map((c) => (
                        <li key={c.key} className="flex items-start gap-2">
                          <StatusDot status={c.status} size={13} />
                          <span className="text-ink-100">{c.label}</span>
                          <span className="text-ink-400">— {c.detail}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}

      {withReport.length === 0 && (
        <div className="rounded-xl border border-line bg-panel p-5 text-sm text-ink-400">
          No assurance reports yet.
        </div>
      )}
    </div>
  );
}

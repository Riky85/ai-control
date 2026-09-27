import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import { PageHeader, StatCard, Tabs } from "@/components/ui";
import ExportMenu from "@/components/ExportMenu";
import Badge from "@/components/Badge";
import StatusDot from "@/components/StatusDot";
import Link from "next/link";
import { POLICY_LIBRARY } from "@/lib/policy-library";
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

const TABS = [
  { key: "reviews", label: "Reviews" },
  { key: "policies", label: "Policies" },
  { key: "assurance", label: "Assurance" },
] as const;

export default async function GovernancePage({ searchParams }: { searchParams: { tab?: string } }) {
  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "reviews";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Governance"
        subtitle={"Reviews, policies and assurance — the secondary layer that keeps the estate accountable."}
        action={<ExportMenu dataset="assets" />}
      />

      <Tabs active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/governance?tab=${t.key}` }))} />

      {tab === "reviews" && <ReviewsTab />}
      {tab === "policies" && <PoliciesTab />}
      {tab === "assurance" && <AssuranceTab />}
    </div>
  );
}

async function ReviewsTab() {
  // La coda di revisione vera è /review: qui solo il conteggio e il rimando.
  const pending = await db.aiAsset.count({
    where: { organizationId: currentOrgId(), deletedAt: null, status: { in: ["UNKNOWN", "UNREVIEWED"] } },
  });

  return (
    <div className="rounded-xl border border-line bg-panel p-5 flex items-center justify-between gap-4">
      <p className="text-sm text-ink-400">
        {pending === 0
          ? "Nothing waiting on review — every AI system has been marked as allowed or not allowed."
          : `${pending} AI system${pending === 1 ? "" : "s"} need${pending === 1 ? "s" : ""} review. Decisions are made in the review queue.`}
      </p>
      <Link href="/review" className="btn btn-primary btn-sm shrink-0">
        Open review queue
      </Link>
    </div>
  );
}

async function PoliciesTab() {
  const policies = await db.policy.findMany({ where: { organizationId: currentOrgId() }, orderBy: { createdAt: "desc" } });
  const activeNames = new Set(policies.map((p) => p.name));
  const availableTemplates = POLICY_LIBRARY.filter((t) => !activeNames.has(t.name));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-base font-semibold text-ink-100 mb-3">Active policies</h2>
        {policies.length === 0 && (
          <div className="rounded-xl border border-line bg-panel p-5 text-sm text-ink-400">
            No policies yet. Add one from the library below, or write a custom one.
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
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {availableTemplates.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-ink-100 mb-3">Policy library</h2>
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
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold text-ink-100 mb-3">Write a custom policy</h2>
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
      </div>
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
    <div className="flex flex-col gap-8">
      <p className="text-xs text-ink-400">
        Every check is a fact read from the database — never a guess. {totalChecks} checks across {withReport.length} asset
        {withReport.length === 1 ? "" : "s"}.
      </p>

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
          No assurance reports yet — they're generated automatically after the first connector sync.
        </div>
      )}
    </div>
  );
}

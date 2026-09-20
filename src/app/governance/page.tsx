import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import RiskGauge from "@/components/RiskGauge";
import StatusDot from "@/components/StatusDot";
import Link from "next/link";
import { POLICY_LIBRARY } from "@/lib/policy-library";
import {
  setAssetStatusAction,
  createPolicyAction,
  addPolicyFromLibraryAction,
  togglePolicyAction,
  deletePolicyAction,
} from "@/lib/actions";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";
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
const LEVEL_COLOR: Record<string, string> = {
  ASSURED: "text-steady",
  NEEDS_REVIEW: "text-signal",
  RESTRICTED: "text-alarm",
  BLOCKED: "text-alarm",
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Governance</h1>
        <p className="text-sm text-ink-400 mt-1.5 max-w-lg">
          Reviews, policies and assurance — the secondary layer that keeps the estate accountable.
        </p>
      </div>

      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/governance?tab=${t.key}`}
            className={`text-sm px-3 py-2 -mb-px border-b-2 transition-colors ${
              tab === t.key ? "border-ink-100 text-ink-100 font-medium" : "border-transparent text-ink-400 hover:text-ink-100"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "reviews" && <ReviewsTab />}
      {tab === "policies" && <PoliciesTab />}
      {tab === "assurance" && <AssuranceTab />}
    </div>
  );
}

async function ReviewsTab() {
  const pending = await db.aiAsset.findMany({
    where: { organizationId: ORG_ID, deletedAt: null, status: { in: ["UNKNOWN", "UNAPPROVED", "UNREVIEWED"] } },
    include: { owner: true, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: [{ status: "asc" }, { firstSeenAt: "desc" }],
  });

  return (
    <div className="flex flex-col gap-3">
      {pending.map((asset) => {
        const risk = asset.riskAssessments[0];
        return (
          <div key={asset.id} className="rounded-md border border-line bg-panel shadow-card p-4 flex items-center gap-5">
            {risk && (
              <div className="shrink-0 scale-75 -my-3">
                <RiskGauge score={risk.score} level={risk.level} />
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Link href={`/assets/${asset.id}`} className="text-sm font-medium text-ink-100 hover:underline">
                  {asset.name}
                </Link>
                <Badge>{asset.status}</Badge>
                {risk && <Badge>{risk.level}</Badge>}
              </div>
              <p className="text-xs text-ink-400 mt-1">
                {asset.owner?.name ?? "No owner on record"} — first seen {new Date(asset.firstSeenAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <form action={setAssetStatusAction}>
                <input type="hidden" name="assetId" value={asset.id} />
                <input type="hidden" name="status" value="APPROVED" />
                <button type="submit" className="text-xs px-3 py-1.5 rounded border border-line text-ink-100 hover:border-accent hover:text-accent transition-colors">
                  Approve
                </button>
              </form>
              <form action={setAssetStatusAction}>
                <input type="hidden" name="assetId" value={asset.id} />
                <input type="hidden" name="status" value="UNAPPROVED" />
                <button type="submit" className="text-xs px-3 py-1.5 rounded border border-line text-ink-400 hover:text-alarm hover:border-alarm transition-colors">
                  Reject
                </button>
              </form>
            </div>
          </div>
        );
      })}
      {pending.length === 0 && (
        <div className="rounded-md border border-line bg-panel shadow-card p-6 text-sm text-ink-400">
          Nothing waiting on review. Every known asset has been approved or rejected.
        </div>
      )}
    </div>
  );
}

async function PoliciesTab() {
  const policies = await db.policy.findMany({ where: { organizationId: ORG_ID }, orderBy: { createdAt: "desc" } });
  const activeNames = new Set(policies.map((p) => p.name));
  const availableTemplates = POLICY_LIBRARY.filter((t) => !activeNames.has(t.name));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-sm font-medium text-ink-400 mb-3">Active policies</h2>
        {policies.length === 0 && (
          <div className="rounded-md border border-line bg-panel shadow-card p-5 text-sm text-ink-400">
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
                <div className="rounded-md border border-line bg-panel shadow-card divide-y divide-line">
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
                          <button
                            type="submit"
                            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                              p.enabled ? "border-line text-ink-100 hover:border-ink-400" : "border-line text-ink-400 hover:text-ink-100"
                            }`}
                          >
                            {p.enabled ? "Enabled" : "Disabled"}
                          </button>
                        </form>
                        <form action={deletePolicyAction}>
                          <input type="hidden" name="policyId" value={p.id} />
                          <button type="submit" className="text-xs text-ink-400 hover:text-alarm transition-colors">Remove</button>
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
          <h2 className="text-sm font-medium text-ink-400 mb-3">Policy library</h2>
          <div className="rounded-md border border-line bg-panel shadow-card divide-y divide-line">
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
                  <button type="submit" className="text-xs px-2.5 py-1 rounded border border-line text-ink-100 hover:border-accent hover:text-accent transition-colors">
                    Add
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-ink-400 mb-3">Write a custom policy</h2>
        <form action={createPolicyAction} className="rounded-md border border-line bg-panel shadow-card p-5 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-400">Name</label>
            <input name="name" required placeholder="e.g. Agents cannot create discounts above 20%" className="bg-ink border border-line rounded px-3 py-2 text-sm text-ink-100" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-400">Description</label>
            <textarea name="description" required rows={2} className="bg-ink border border-line rounded px-3 py-2 text-sm text-ink-100" />
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-ink-400">Category</label>
              <select name="category" className="bg-ink border border-line rounded px-3 py-2 text-sm text-ink-100">
                <option value="data_access">Data access</option>
                <option value="approval">Approval</option>
                <option value="environment">Environment</option>
                <option value="vendor">Vendor</option>
                <option value="other">Other</option>
              </select>
            </div>
            <button type="submit" className="text-sm px-4 py-2 rounded border border-line text-ink-100 hover:border-accent hover:text-accent transition-colors">
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
    where: { organizationId: ORG_ID, deletedAt: null },
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

      <div className="rounded-lg border border-line bg-panel shadow-card grid grid-cols-3 divide-x divide-line">
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="h-1.5 w-1.5 rounded-full bg-steady" />
            <span className="text-xs text-ink-400">Passed</span>
          </div>
          <div className="tabular font-display text-2xl font-semibold text-ink-100">{totalPassed}</div>
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="h-1.5 w-1.5 rounded-full bg-signal" />
            <span className="text-xs text-ink-400">Warnings</span>
          </div>
          <div className="tabular font-display text-2xl font-semibold text-ink-100">{totalWarning}</div>
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="h-1.5 w-1.5 rounded-full bg-alarm" />
            <span className="text-xs text-ink-400">Failed</span>
          </div>
          <div className={`tabular font-display text-2xl font-semibold ${totalFailed > 0 ? "text-alarm" : "text-ink-100"}`}>{totalFailed}</div>
        </div>
      </div>

      {groups.map(({ level, items }) =>
        items.length > 0 ? (
          <div key={level}>
            <h2 className="text-sm font-medium text-ink-400 mb-3">
              {LEVEL_LABEL[level]} ({items.length})
            </h2>
            <div className="flex flex-col gap-3">
              {items.map(({ asset, report }) => (
                <div key={asset.id} className="rounded-md border border-line bg-panel shadow-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Link href={`/assets/${asset.id}`} className="font-medium text-sm text-ink-100 hover:underline">
                      {asset.name}
                    </Link>
                    <span className={`text-xs font-medium ${LEVEL_COLOR[report!.level]}`}>
                      {LEVEL_LABEL[report!.level]} · {report!.score}%
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
        <div className="rounded-md border border-line bg-panel shadow-card p-5 text-sm text-ink-400">
          No assurance reports yet — they're generated automatically after the first connector sync.
        </div>
      )}
    </div>
  );
}

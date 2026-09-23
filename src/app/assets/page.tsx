import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/Badge";
import { VendorBadge } from "@/components/VendorIcon";
import BarChart from "@/components/BarChart";
import { StatCard, Panel, PageHeader } from "@/components/ui";
import { CHART_COLORS } from "@/lib/chart-colors";
import AssetFilters from "@/components/AssetFilters";
import DonutChart from "@/components/DonutChart";
import type { AiAssetType, AiAssetStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

const TYPE_OPTIONS: AiAssetType[] = [
  "AI_APPLICATION",
  "AI_AGENT",
  "AI_API",
  "MCP_SERVER",
  "AI_DEV_TOOL",
  "AI_FEATURE",
];
const STATUS_OPTIONS: AiAssetStatus[] = ["APPROVED", "UNREVIEWED", "UNAPPROVED", "UNKNOWN"];
const STATUS_LABEL: Record<string, string> = {
  APPROVED: "Approved",
  UNREVIEWED: "Unreviewed",
  UNAPPROVED: "Not approved",
  UNKNOWN: "Unknown",
};
const RISK_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const RISK_LABEL: Record<string, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: { type?: string; status?: string; risk?: string };
}) {
  const assets = await db.aiAsset.findMany({
    where: {
      organizationId: ORG_ID,
      deletedAt: null,
      ...(searchParams.type ? { type: searchParams.type as AiAssetType } : {}),
      ...(searchParams.status ? { status: searchParams.status as AiAssetStatus } : {}),
    },
    include: {
      owner: true,
      connector: true,
      riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
      assuranceReports: { orderBy: { createdAt: "desc" }, take: 1 },
      cost: true,
    },
    orderBy: { lastSeenAt: "desc" },
  });

  const filtered = searchParams.risk
    ? assets.filter((a) => a.riskAssessments[0]?.level === searchParams.risk)
    : assets;

  const typeCounts = new Map<string, number>();
  for (const a of assets) typeCounts.set(a.type, (typeCounts.get(a.type) ?? 0) + 1);
  const typeSlices = Array.from(typeCounts.entries()).map(([type, value], i) => ({
    label: type.replace(/_/g, " ").toLowerCase(),
    value,
    color: CHART_COLORS[i % CHART_COLORS.length],
    href: `/assets?type=${type}`,
  }));
  const providerCounts = new Map<string, number>();
  for (const a of assets) providerCounts.set(a.vendor ?? "Unknown", (providerCounts.get(a.vendor ?? "Unknown") ?? 0) + 1);
  const providerRows = Array.from(providerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  const totalCost = assets.reduce((sum, a) => sum + (a.cost?.monthlyCostEstimate ?? 0), 0);
  const highRiskCount = assets.filter((a) => ["HIGH", "CRITICAL"].includes(a.riskAssessments[0]?.level ?? "")).length;
  const noOwner = assets.filter((a) => !a.ownerId).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI Passports"
        subtitle="A living technical record for every AI system in your estate."
        action={
          <Link href="/connectors" className="text-xs font-medium px-3 py-2 rounded-md bg-accent text-white hover:bg-accent-dark transition-colors">
            + Discover more
          </Link>
        }
      />

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="AI systems" value={String(assets.length)} tone="accent" />
        <StatCard label="Monthly spend" value={totalCost > 0 ? `€${totalCost.toLocaleString()}` : "—"} hint="Manually entered" href="/savings" />
        <StatCard label="High risk" value={String(highRiskCount)} tone={highRiskCount > 0 ? "alarm" : undefined} href="/assets?risk=HIGH" />
        <StatCard label="Without owner" value={String(noOwner)} tone={noOwner > 0 ? "signal" : undefined} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Panel title="By type" subtitle="What kind of AI you run">
          {typeSlices.length > 0 ? <DonutChart slices={typeSlices} centerLabel="systems" /> : <p className="text-sm text-ink-400">No data yet.</p>}
        </Panel>
        <Panel title="By provider" subtitle="How many systems depend on each vendor">
          {providerRows.length > 0 ? <BarChart rows={providerRows} /> : <p className="text-sm text-ink-400">No data yet.</p>}
        </Panel>
      </div>

      <AssetFilters
        typeOptions={TYPE_OPTIONS}
        statusOptions={STATUS_OPTIONS}
        statusLabels={STATUS_LABEL}
        riskOptions={RISK_OPTIONS}
        riskLabels={RISK_LABEL}
      />

      <div className="rounded-xl border border-line bg-panel overflow-hidden animate-rise">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400 bg-ink border-b border-line">
              <th className="px-4 py-3 font-medium">System</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Risk</th>
              <th className="px-4 py-3 font-medium">Assurance</th>
              <th className="px-4 py-3 font-medium">Cost/mo</th>
              <th className="px-4 py-3 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((asset) => {
              const risk = asset.riskAssessments[0];
              const assurance = asset.assuranceReports[0];
              return (
                <tr key={asset.id} className="hover:bg-black/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/assets/${asset.id}`} className="flex items-center gap-3 group">
                      <VendorBadge vendor={asset.vendor ?? asset.connector?.provider ?? ""} name={asset.name} size={32} />
                      <span>
                        <span className="block font-medium text-ink-100 group-hover:underline">{asset.name}</span>
                        <span className="block text-xs text-ink-400">{asset.vendor ?? "Vendor unknown"}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-400">{asset.type.replace(/_/g, " ").toLowerCase()}</td>
                  <td className="px-4 py-3 text-ink-400">
                    {asset.owner?.name ?? <span className="text-signal">No owner</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{asset.status}</Badge>
                  </td>
                  <td className="px-4 py-3">{risk ? <Badge>{risk.level}</Badge> : "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {assurance ? (
                      <span className="flex items-center gap-2">
                        <span className="w-16 h-1.5 bg-ink rounded-full overflow-hidden">
                          <span
                            className={`block h-full rounded-full animate-grow ${
                              assurance.level === "ASSURED" ? "bg-steady" : assurance.level === "NEEDS_REVIEW" ? "bg-signal" : "bg-alarm"
                            }`}
                            style={{ width: `${assurance.score}%` }}
                          />
                        </span>
                        <span className="text-ink-400 tabular">{assurance.score}%</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-400 text-xs tabular">
                    {asset.cost?.monthlyCostEstimate != null ? `€${asset.cost.monthlyCostEstimate.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-400 text-xs tabular">
                    {asset.lastSeenAt ? new Date(asset.lastSeenAt).toLocaleDateString() : "Never"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-sm text-ink-400">
                  {assets.length === 0
                    ? "No assets yet. Connect Microsoft 365 or GitHub to start discovery."
                    : "No assets match this filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

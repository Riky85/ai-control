import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/Badge";
import VendorIcon from "@/components/VendorIcon";
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

  // Famiglia blu/viola coerente — niente marrone o tonalità confuse, e
  // lontana da verde/rosso/ambra che restano il significato di rischio.
  const TYPE_COLORS = ["#3B3564", "#4C6EF5", "#7C6FE0", "#5C9EAD", "#A78BFA", "#84848C"];
  const typeCounts = new Map<string, number>();
  for (const a of assets) typeCounts.set(a.type, (typeCounts.get(a.type) ?? 0) + 1);
  const typeSlices = Array.from(typeCounts.entries()).map(([type, value], i) => ({
    label: type.replace(/_/g, " ").toLowerCase(),
    value,
    color: TYPE_COLORS[i % TYPE_COLORS.length],
    href: `/assets?type=${type}`,
  }));

  const totalCost = assets.reduce((sum, a) => sum + (a.cost?.monthlyCostEstimate ?? 0), 0);
  const highRiskCount = assets.filter((a) => ["HIGH", "CRITICAL"].includes(a.riskAssessments[0]?.level ?? "")).length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">AI Passports</h1>
        <p className="text-sm text-ink-400 mt-1.5">
          Every application, agent, API or MCP server detected across your connectors.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="rounded-xl border border-line bg-panel shadow-card p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-1.5">Total tracked</div>
            <div className="font-display text-3xl font-bold text-accent">{assets.length}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-1.5">Monthly spend tracked</div>
            <div className="font-display text-xl font-semibold text-accent">€{totalCost.toLocaleString()}</div>
          </div>
        </div>
        {typeSlices.length > 0 ? (
          <div className="rounded-xl border border-line bg-panel shadow-card p-5">
            <h2 className="text-sm font-medium text-ink-400 mb-3">By type</h2>
            <DonutChart slices={typeSlices} centerLabel="total" />
          </div>
        ) : (
          <div className="rounded-xl border border-alarm/30 bg-alarm/5 p-5 flex items-center">
            <span className="text-sm text-alarm">{highRiskCount} at high or critical risk</span>
          </div>
        )}
      </div>

      <AssetFilters
        typeOptions={TYPE_OPTIONS}
        statusOptions={STATUS_OPTIONS}
        statusLabels={STATUS_LABEL}
        riskOptions={RISK_OPTIONS}
        riskLabels={RISK_LABEL}
      />

      <div className="rounded-xl border border-line bg-panel shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-ink-400 border-b border-line">
              <th className="px-4 py-3 font-medium">Asset</th>
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
                <tr key={asset.id} className="hover:bg-black/[0.025]">
                  <td className="px-4 py-3">
                    <Link href={`/assets/${asset.id}`} className="hover:underline font-medium text-ink-100">
                      {asset.name}
                    </Link>
                    <div className="flex items-center gap-1.5 text-xs text-ink-400">
                      <span className="text-ink-400/80"><VendorIcon vendor={asset.vendor ?? asset.connector?.provider ?? ""} size={12} /></span>
                      {asset.vendor ?? "Vendor unknown"}
                    </div>
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
                      <span
                        className={
                          assurance.level === "ASSURED"
                            ? "text-steady"
                            : assurance.level === "NEEDS_REVIEW"
                              ? "text-signal"
                              : "text-alarm"
                        }
                      >
                        {assurance.score}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-400 text-xs tabular">
                    {asset.cost?.monthlyCostEstimate != null ? `€${asset.cost.monthlyCostEstimate.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-400 text-xs tabular">
                    {asset.lastSeenAt ? new Date(asset.lastSeenAt).toLocaleString() : "Never"}
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

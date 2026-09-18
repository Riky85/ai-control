import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/Badge";
import VendorIcon from "@/components/VendorIcon";
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
    },
    orderBy: { lastSeenAt: "desc" },
  });

  const filtered = searchParams.risk
    ? assets.filter((a) => a.riskAssessments[0]?.level === searchParams.risk)
    : assets;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">AI Passports</h1>
        <p className="text-sm text-ink-400 mt-1.5">
          Every application, agent, API or MCP server detected across your connectors.
        </p>
      </div>

      <form className="flex items-center gap-3" method="GET">
        <select name="type" defaultValue={searchParams.type ?? ""} className="bg-panel border border-line rounded px-2.5 py-1.5 text-xs text-ink-100">
          <option value="">All types</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ").toLowerCase()}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={searchParams.status ?? ""} className="bg-panel border border-line rounded px-2.5 py-1.5 text-xs text-ink-100">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select name="risk" defaultValue={searchParams.risk ?? ""} className="bg-panel border border-line rounded px-2.5 py-1.5 text-xs text-ink-100">
          <option value="">All risk levels</option>
          {RISK_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {RISK_LABEL[r]}
            </option>
          ))}
        </select>
        <button type="submit" className="text-xs px-3 py-1.5 rounded border border-line text-ink-100 hover:border-accent hover:text-accent transition-colors">
          Filter
        </button>
        {(searchParams.type || searchParams.status || searchParams.risk) && (
          <Link href="/assets" className="text-xs text-ink-400 hover:text-ink-100">
            Clear
          </Link>
        )}
      </form>

      <div className="rounded-md border border-line bg-panel shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400 border-b border-line">
              <th className="px-4 py-3 font-medium">Asset</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Risk</th>
              <th className="px-4 py-3 font-medium">Assurance</th>
              <th className="px-4 py-3 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((asset) => {
              const risk = asset.riskAssessments[0];
              const assurance = asset.assuranceReports[0];
              return (
                <tr key={asset.id} className="hover:bg-black/[0.02]">
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
                    {asset.lastSeenAt ? new Date(asset.lastSeenAt).toLocaleString() : "Never"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-sm text-ink-400">
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

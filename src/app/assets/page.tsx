import { fmtDate, fmtEur } from "@/lib/format";
import { categoryOf, monthlyOf } from "@/lib/savings";
import { CATEGORY_LABEL, PLANS } from "@/lib/pricing/catalog";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/Badge";
import { VendorBadge } from "@/components/VendorIcon";
import { PageHeader, Table } from "@/components/ui";
import ExportMenu from "@/components/ExportMenu";
import AssetFilters from "@/components/AssetFilters";
import type { AiAssetType, AiAssetStatus } from "@prisma/client";

export const dynamic = "force-dynamic";


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
  searchParams: { type?: string; status?: string; risk?: string; q?: string; category?: string };
}) {
  const assets = await db.aiAsset.findMany({
    where: {
      organizationId: currentOrgId(),
      deletedAt: null,
      ...(searchParams.type ? { type: searchParams.type as AiAssetType } : {}),
      ...(searchParams.status ? { status: searchParams.status as AiAssetStatus } : {}),
      ...(searchParams.q ? { name: { contains: searchParams.q, mode: "insensitive" as const } } : {}),
    },
    include: {
      owner: true,
      connector: true,
      riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
      assuranceReports: { orderBy: { createdAt: "desc" }, take: 1 },
      cost: true,
      alternatives: true,
      usages: { select: { lastSeenAt: true } },
      activities: { where: { eventType: "discovery.seen" }, orderBy: { occurredAt: "desc" }, take: 1, select: { occurredAt: true } },
    },
    orderBy: { lastSeenAt: "desc" },
  });

  const filtered = assets
    .filter((a) => !searchParams.risk || a.riskAssessments[0]?.level === searchParams.risk)
    .filter((a) => !searchParams.category || categoryOf(a) === searchParams.category)
    .map((a) => ({ a, m: monthlyOf(a as any) }))
    .sort((x, y) => (y.m?.eur ?? -1) - (x.m?.eur ?? -1))
    .map((x) => x.a);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your AI"
        subtitle="Every AI your company uses or pays for — open one to see its passport: who uses it, what it costs, what it touches."
        action={
          <div className="flex gap-2">
            <ExportMenu dataset="assets" />
            <Link href="/sources" className="btn btn-secondary">
              + Add sources
            </Link>
          </div>
        }
      />

      <div className="flex items-center justify-between gap-4">
      <AssetFilters
        typeOptions={TYPE_OPTIONS}
        statusOptions={STATUS_OPTIONS}
        statusLabels={STATUS_LABEL}
        riskOptions={RISK_OPTIONS}
        riskLabels={RISK_LABEL}
      />
        <span className="text-sm text-ink-400 shrink-0">
          {filtered.length} of {assets.length} systems
        </span>
      </div>

      <Table columns={["AI", "Category", "Plan", { label: "Cost / month", className: "text-right" }, "Users", "Owner", "Status", "Last seen"]} empty={filtered.length === 0 && (assets.length === 0 ? "Nothing yet — add a bank statement or another source." : "Nothing matches this filter.")}>
        {filtered.map((asset) => {
          const m = monthlyOf(asset as any);
          const cat = categoryOf(asset);
          const plan = asset.cost?.planId ? PLANS.find((p) => p.id === asset.cost!.planId) : null;
          return (
            <tr key={asset.id} className="hover:bg-ink-100/[0.02] transition-colors">
              <td className="px-5 py-3">
                <Link href={`/assets/${asset.id}`} className="flex items-center gap-3 group">
                  <VendorBadge vendor={asset.vendor ?? asset.connector?.provider ?? ""} name={asset.name} size={32} />
                  <span>
                    <span className="block font-medium text-ink-100 group-hover:underline">{asset.name}</span>
                    <span className="block text-xs text-ink-400">{asset.vendor ?? "Vendor unknown"}</span>
                  </span>
                </Link>
              </td>
              <td className="px-5 py-3 text-ink-400">{cat ? CATEGORY_LABEL[cat] : asset.type.replace(/_/g, " ").toLowerCase()}</td>
              <td className="px-5 py-3 text-ink-400">{plan ? `${asset.cost?.seats && asset.cost.seats > 1 ? `${asset.cost.seats} × ` : ""}${plan.name}` : "—"}</td>
              <td className="px-5 py-3 text-right tabular">
                {m ? (
                  <span className={m.estimated ? "text-ink-400" : "text-ink-100 font-medium"} title={m.estimated ? "Estimated from list prices" : undefined}>
                    {m.estimated ? "≈ " : ""}{fmtEur(m.eur)}
                  </span>
                ) : (
                  <span className="text-ink-400" title="Not paid by the company, or free">Free / personal</span>
                )}
              </td>
              <td className="px-5 py-3 text-ink-400 tabular">{asset.usages.length || "—"}</td>
              <td className="px-5 py-3 text-ink-400">{asset.owner?.name ?? asset.owner?.email ?? "—"}</td>
              <td className="px-5 py-3"><Badge>{asset.status}</Badge></td>
              <td className="px-5 py-3 text-ink-400 text-xs tabular">{asset.lastSeenAt ? fmtDate(asset.lastSeenAt) : "—"}</td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}

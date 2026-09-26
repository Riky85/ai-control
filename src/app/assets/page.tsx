import { categoryOf, loadAssets, computeSavings } from "@/lib/savings";
import AiTable from "@/components/AiTable";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
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
  const orgId = currentOrgId();
  const [all, { items: savings }, risks] = await Promise.all([
    loadAssets(orgId, { includeRejected: true }),
    computeSavings(orgId),
    searchParams.risk
      ? db.aiAsset.findMany({ where: { organizationId: orgId }, select: { id: true, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1, select: { level: true } } } })
      : Promise.resolve([]),
  ]);
  const riskOf = new Map(risks.map((r) => [r.id, r.riskAssessments[0]?.level]));
  const q = searchParams.q?.toLowerCase();
  const filtered = all
    .filter((a) => !searchParams.type || a.type === searchParams.type)
    .filter((a) => !searchParams.status || a.status === searchParams.status)
    .filter((a) => !q || a.name.toLowerCase().includes(q) || (a.vendor ?? "").toLowerCase().includes(q))
    .filter((a) => !searchParams.category || categoryOf(a) === searchParams.category)
    .filter((a) => !searchParams.risk || riskOf.get(a.id) === searchParams.risk);
  const assets = all;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your AI"
        subtitle="Every AI your company uses or pays for — open one to see its passport: who uses it, what it costs, what it touches."
        action={
          <div className="flex gap-2">
            <a href="/api/export/register" className="btn btn-secondary" title="AI register for the EU AI Act and GDPR records (Excel)">AI register</a>
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

      <AiTable assets={filtered} savings={savings} empty={assets.length === 0 ? "Nothing yet — add a bank statement or another source." : "Nothing matches this filter."} />
    </div>
  );
}

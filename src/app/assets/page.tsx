import { categoryOf, loadAssets, computeSavings, monthlyOf } from "@/lib/savings";
import AiTable from "@/components/AiTable";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import ExportMenu from "@/components/ExportMenu";
import FilterBar from "@/components/FilterBar";
import { CATEGORY_LABEL } from "@/lib/pricing/catalog";

export const dynamic = "force-dynamic";



export default async function AssetsPage({
  searchParams,
}: {
  searchParams: { type?: string; status?: string; risk?: string; q?: string; category?: string; paid?: string };
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
    .filter((a) => !searchParams.status || (searchParams.status === "TODECIDE" ? a.status === "UNKNOWN" || a.status === "UNREVIEWED" : a.status === searchParams.status))
    .filter((a) => !searchParams.paid || (searchParams.paid === "yes") === Boolean(monthlyOf(a)))
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

      <FilterBar
        search={{ placeholder: "Find an AI by name or provider" }}
        filters={[
          { param: "category", label: "Category", options: (Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c] })) },
          { param: "status", label: "Status", options: [{ value: "APPROVED", label: "Allowed" }, { value: "TODECIDE", label: "To decide" }, { value: "UNAPPROVED", label: "Not allowed" }] },
          { param: "paid", label: "Paid", options: [{ value: "yes", label: "Paid by the company" }, { value: "no", label: "Not paid" }] },
        ]}
        right={`${filtered.length} of ${assets.length}`}
      />

      <AiTable assets={filtered} savings={savings} empty={assets.length === 0 ? "Nothing yet — add a bank statement or another source." : "Nothing matches this filter."} />
    </div>
  );
}

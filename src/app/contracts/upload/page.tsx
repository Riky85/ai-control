import Link from "next/link";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { PageHeader, EmptyState } from "@/components/ui";
import { PLANS } from "@/lib/pricing/catalog";
import ContractReader from "./ContractReader";

export const dynamic = "force-dynamic";

// Contratti e fatture da PDF: angar legge il documento, la persona controlla i campi e li applica all'AI.
export default async function ContractUploadPage({ searchParams }: { searchParams: { error?: string } }) {
  const orgId = currentOrgId();
  const assets = await db.aiAsset.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: { id: true, name: true, vendor: true },
    orderBy: { name: "asc" },
    take: 1000,
  });
  return (
    <div className="flex flex-col gap-6 [&>*:not(.page-bar)]:max-w-3xl">
      <PageHeader
        crumbs={[{ label: "Opportunities", href: "/opportunities" }, { label: "Contracts", href: "/opportunities?view=contracts" }]}
        title="Read a contract"
        subtitle="Contract, order form or invoice in PDF"
      />
      {assets.length === 0 ? (
        <EmptyState text="No AI in your list yet. A contract is attached to an AI." action={<Link href="/sources" className="btn btn-primary">Add costs</Link>} />
      ) : (
      <ContractReader assets={assets.map((a) => ({ id: a.id, label: a.vendor ? `${a.name} · ${a.vendor}` : a.name }))} plans={PLANS.map((p) => ({ id: p.id, name: p.name }))} />
      )}
    </div>
  );
}

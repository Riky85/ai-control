import Link from "next/link";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { Notice, PageHeader } from "@/components/ui";
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
    <div className="flex flex-col gap-4 max-w-3xl">
      <PageHeader
        crumbs={[{ label: "Savings", href: "/savings" }, { label: "Contracts", href: "/savings?view=contracts" }]}
        title="Read a contract"
        subtitle="Upload a contract, order form or invoice as PDF. angar fills in the plan, seats, price, dates and notice — you check them before anything is saved."
      />
      {assets.length === 0 ? (
        <Notice>
          No AI in your list yet — a contract is attached to an AI. <Link href="/sources" className="underline">Add costs or connect a source</Link> first.
        </Notice>
      ) : (
      <ContractReader assets={assets.map((a) => ({ id: a.id, label: a.vendor ? `${a.name} · ${a.vendor}` : a.name }))} plans={PLANS.map((p) => ({ id: p.id, name: p.name }))} />
      )}
    </div>
  );
}

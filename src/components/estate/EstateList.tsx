import Link from "next/link";
import AiTable from "@/components/AiTable";
import FilterBar from "@/components/FilterBar";
import ExportMenu from "@/components/ExportMenu";
import { EmptyState, PageHeader } from "@/components/ui";
import { aiFilters, filterAssets, type AiFilterParams } from "@/lib/ai-filters";
import type { AssetForSavings, Saving } from "@/lib/savings";

/** AI Estate → List: l'elenco "Your AI" (prima nell'Overview), con tutti i filtri. Dati già letti. */
export default function EstateList({ all, savings, params }: { all: AssetForSavings[]; savings: Saving[]; params: AiFilterParams }) {
  const shown = filterAssets(all, params);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI Estate"
        subtitle="Every AI you use, what it costs and who owns it"
        action={
          <>
            <Link href="/connect" className="btn btn-ghost btn-sm">+ Add sources</Link>
            <ExportMenu dataset="assets" />
          </>
        }
      />
      {all.length === 0 ? (
        <EmptyState text="No AI found yet." action={<Link href="/connect" className="btn btn-primary">Connect a source</Link>} />
      ) : (
        <div id="your-ai" className="flex flex-col gap-3">
          <FilterBar search={{ placeholder: "Find an AI" }} filters={aiFilters(all)} right={`${shown.length} of ${all.length}`} />
          <AiTable assets={shown} savings={savings} empty="No match." />
        </div>
      )}
    </div>
  );
}

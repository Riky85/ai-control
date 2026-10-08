import { currentOrgId } from "@/lib/org";
import { computeSavingsCached, loadAssets } from "@/lib/savings";
import type { AiFilterParams } from "@/lib/ai-filters";
import EstateList from "@/components/estate/EstateList";

export const dynamic = "force-dynamic";

// AI Estate → List: ogni AI (anche quelle non consentite, filtrabili), costo, stato e risparmi.
export default async function EstatePage({ searchParams }: { searchParams: AiFilterParams }) {
  const orgId = currentOrgId();
  const [{ items }, all] = await Promise.all([computeSavingsCached(orgId), loadAssets(orgId, { includeRejected: true })]);
  return <EstateList all={all} savings={items} params={searchParams} />;
}

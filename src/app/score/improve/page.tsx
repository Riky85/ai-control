import { currentOrgId } from "@/lib/org";
import ImproveView from "@/components/engine/ImproveView";
import { computeScoreCached, scoreActions } from "@/lib/engine/score";

export const dynamic = "force-dynamic";

// "Improve my score": il piano d'azione dell'angar Score, con i punti ricalcolati per ogni correzione.
export default async function ImproveScorePage() {
  const result = await computeScoreCached(currentOrgId());
  return <ImproveView result={result} plan={scoreActions(result.facts, result)} />;
}

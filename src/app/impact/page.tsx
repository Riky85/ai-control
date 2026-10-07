import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import { loadImpactContext, runScenario, parseScenario } from "@/lib/impact";
import { impactOptions } from "@/lib/impact/options";
import { saveScenarioAction, deleteScenarioAction } from "@/lib/impact/actions";
import ImpactView, { type SavedScenario } from "@/components/impact/ImpactView";

export const dynamic = "force-dynamic";

// Impact Simulator: "cosa succede se cambio questo?". Lo scenario sta nell'URL; il calcolo è
// deterministico (estate + catalogo, nessun LLM) e si rifà a ogni apertura.
export default async function ImpactPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const orgId = currentOrgId();
  const { kind, scenario } = parseScenario(searchParams);
  const [ctx, saved] = await Promise.all([
    loadImpactContext(orgId, { savings: scenario?.s === "budget" }),
    // Tabella nuova: se non è ancora nel database la pagina funziona lo stesso.
    db.impactScenario.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, name: true, query: true } }).catch((): SavedScenario[] => []),
  ]);
  const raw = Object.fromEntries(Object.entries(searchParams).map(([k, v]) => [k, (Array.isArray(v) ? v[0] : v) ?? ""]));
  const result = scenario ? runScenario(ctx, scenario) : null;
  const notice = raw.error ? raw.error : raw.saved === "scenario" ? "Scenario saved." : null;
  return <ImpactView kind={kind} raw={raw} options={impactOptions(ctx.est)} result={result} saved={saved} saveAction={saveScenarioAction} deleteAction={deleteScenarioAction} notice={notice} />;
}

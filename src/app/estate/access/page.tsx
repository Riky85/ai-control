import { currentSession } from "@/lib/auth";
import { currentOrgId } from "@/lib/org";
import { loadAccess, notAllowedInUse } from "@/lib/access";
import AccessView from "@/components/access/AccessView";

export const dynamic = "force-dynamic";

// App di terze parti con consensi OAuth su Microsoft 365 / Google Workspace (AI in evidenza),
// revoca e avvisi alle persone che usano AI non consentite.
export default async function AccessPage({ searchParams }: { searchParams: { view?: string; error?: string; done?: string } }) {
  const orgId = currentOrgId();
  const role = currentSession()?.role ?? "VIEWER";
  const [{ connected, caps, grants, assets }, notAllowed] = await Promise.all([loadAccess(orgId), notAllowedInUse(orgId)]);
  return (
    <AccessView
      connected={connected}
      caps={caps}
      grants={grants.map((g) => ({ ...g, asset: g.aiAssetId ? assets.get(g.aiAssetId) ?? null : null }))}
      notAllowed={notAllowed}
      view={searchParams.view === "all" ? "all" : "ai"}
      role={role}
      error={searchParams.error?.slice(0, 300)}
      done={searchParams.done?.slice(0, 300)}
    />
  );
}

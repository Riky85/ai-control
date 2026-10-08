import { currentOrgId } from "@/lib/org";
import { currentSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadOpportunitiesCached } from "@/lib/opportunities";
import { CATEGORIES, type Category } from "@/lib/opportunities/types";
import { answerGoal, estateProviders, isGoal, retiringModels, type GoalAnswer } from "@/lib/opportunities/goals";
import { loadImpactContext } from "@/lib/impact";
import { savedSoFar } from "@/lib/savings-ledger";
import { contractRows, NOTICE_ALERT_DAYS } from "@/lib/contracts";
import { subscriptionRows } from "@/lib/pricing/subscriptions";
import { fmtEur } from "@/lib/format";
import AutopilotPanel, { loadAutopilotPanel } from "@/components/engine/AutopilotPanel";
import OpportunitiesView, { parseView, StateProgress } from "@/components/opportunities/OpportunitiesView";
import { ComingRenewals, Contracts, Progress, Subscriptions } from "@/components/opportunities/SavingsViews";
import { upcomingRenewals } from "@/lib/renewals";

export const dynamic = "force-dynamic";

type SP = { view?: string; cat?: string; open?: string; goal?: string; target?: string; provider?: string; model?: string; error?: string };

// Opportunities = il motore decisionale: tutte le cose da cambiare (risparmi, dipendenze, mercato, dati),
// con obiettivi in cima. Sostituisce /savings (che rimanda qui con le stesse schede).
export default async function OpportunitiesPage({ searchParams }: { searchParams: SP }) {
  const orgId = currentOrgId();
  const role = currentSession()?.role ?? "VIEWER";
  const view = parseView(searchParams.view);
  const category = CATEGORIES.includes(searchParams.cat as Category) ? (searchParams.cat as Category) : null;
  const goal = isGoal(searchParams.goal) ? searchParams.goal : null;

  const [{ list, summary }, saved, contracts, org, hiddenSavings, hiddenOther] = await Promise.all([
    loadOpportunitiesCached(orgId),
    savedSoFar(orgId),
    contractRows(orgId),
    db.organization.findUnique({ where: { id: orgId }, select: { plan: true, createdAt: true } }),
    db.savingDismissal.count({ where: { organizationId: orgId } }),
    db.opportunityState.count({ where: { organizationId: orgId, status: "dismissed" } }).catch(() => 0),
  ]);

  // Obiettivo: contesto dell'Impact Simulator (estate già in cache), risparmi solo per "Save €X".
  const ctx = await loadImpactContext(orgId, { savings: goal === "save" });
  const providers = estateProviders(ctx);
  const models = retiringModels(ctx);
  const suggested = Math.max(1000, Math.ceil((summary.totalMonthly * 12) / 1000) * 1000);
  const targetRaw = Number(searchParams.target);
  const target = Number.isFinite(targetRaw) && targetRaw >= 100 && targetRaw <= 100_000_000 ? Math.round(targetRaw) : suggested;
  const provider = searchParams.provider && providers.some((p) => p.id === searchParams.provider) ? searchParams.provider : providers[0]?.id ?? null;
  const model = searchParams.model && models.some((m) => m.id === searchParams.model) ? searchParams.model : models[0]?.id ?? null;
  let answer: GoalAnswer | null = null;
  if (goal) answer = answerGoal(ctx, goal, { target, provider, model });

  const soonDeadlines = contracts.filter((c) => c.daysLeft != null && c.daysLeft >= 0 && c.daysLeft <= NOTICE_ALERT_DAYS).length;
  const stateOpen = list.filter((o) => o.ledger === "state" && (o.status === "accepted" || o.status === "in_progress")).length;

  let tab: React.ReactNode = null;
  if (view === "progress") tab = <Progress saved={saved} org={org} extra={<StateProgress list={list} />} />;
  if (view === "contracts")
    tab = (
      <>
        <ComingRenewals rows={await upcomingRenewals(orgId, 60)} />
        <Contracts rows={contracts} />
      </>
    );
  if (view === "subscriptions") tab = <Subscriptions rows={await subscriptionRows(orgId)} />;
  if (view === "autopilot") tab = <AutopilotPanel {...await loadAutopilotPanel(orgId)} />;

  return (
    <OpportunitiesView
      view={view}
      category={category}
      openKey={searchParams.open ?? null}
      error={searchParams.error}
      list={list}
      summary={summary}
      savedMonthly={saved.savedMonthly}
      savedHint={saved.verifiedMonthly >= 1 ? `${fmtEur(saved.verifiedMonthly)}/mo confirmed` : saved.savedMonthly >= 1 ? `${fmtEur(saved.savedMonthly * 12)} a year` : undefined}
      inProgressCount={saved.counts.accepted + saved.counts.done + stateOpen}
      contractsSoon={soonDeadlines}
      hidden={hiddenSavings + hiddenOther}
      canEdit={role !== "VIEWER"}
      goal={{ goal, answer, target, provider, model, providers, models }}
      tab={tab}
    />
  );
}

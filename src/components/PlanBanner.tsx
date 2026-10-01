import Link from "next/link";
import { planLabel, TRIAL_PLAN } from "@/lib/plans";
import { getPlanState, assetsOverLimit, assetManageable } from "@/lib/plan-gate";

/**
 * Sistemi AI oltre il limite del piano: restano visibili (la scoperta non si
 * ferma), ma solo i primi N si possono gestire. Con assetId: avviso per quel sistema.
 */
export async function AssetLimitNotice({ orgId, assetId }: { orgId: string; assetId?: string }) {
  if (assetId) {
    const g = await assetManageable(orgId, assetId);
    if (g.ok) return null;
    return (
      <div className="rounded-xl border border-line bg-panel dark:bg-ink px-4 py-3 text-sm text-ink-100 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>This AI system is beyond your plan&apos;s {g.limit} — you can see it, but not change it. Upgrade to manage more than {g.limit}.</span>
        <Link href="/billing" className="btn btn-secondary btn-sm">Choose a plan</Link>
      </div>
    );
  }
  const { over, limit, total } = await assetsOverLimit(orgId);
  if (!over) return null;
  return (
    <div className="rounded-xl border border-line bg-panel dark:bg-ink px-4 py-3 text-sm text-ink-100 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span>
        angar found <b className="tabular">{total}</b> AI systems; your plan manages the first {limit}. The other {over} stay visible but read-only — upgrade to manage more than {limit}.
      </span>
      <Link href="/billing" className="btn btn-secondary btn-sm">Choose a plan</Link>
    </div>
  );
}
import { fmtDate } from "@/lib/format";

/** Striscia in alto: giorni di prova rimasti, o prova scaduta (limiti Free, dati sempre visibili). */
export default async function PlanBanner({ orgId }: { orgId: string }) {
  let state;
  try {
    state = await getPlanState(orgId);
  } catch {
    return null;
  }
  if (!state.trialing && !state.expired) return null;

  const urgent = state.expired || (state.trialDaysLeft ?? 99) <= 3;
  return (
    <div className={`print:hidden border-b border-line px-4 py-2 text-sm flex flex-wrap items-center justify-center gap-x-3 gap-y-1 ${urgent ? "bg-signal/10" : "bg-sidebar"}`}>
      {state.trialing ? (
        <span className="text-ink-100">
          {planLabel(TRIAL_PLAN)} trial · <b className="tabular">{state.trialDaysLeft}</b> day{state.trialDaysLeft === 1 ? "" : "s"} left
          {state.trialEndsAt && <span className="text-ink-400"> (until {fmtDate(state.trialEndsAt)})</span>}
        </span>
      ) : (
        <span className="text-ink-100">
          Your {state.org.planStatus === "trialing" ? "trial" : "subscription"} has ended — you&apos;re on Free limits. All your data stays visible; changes beyond Free are locked.
        </span>
      )}
      <Link href="/billing" className="btn btn-primary btn-sm">Choose a plan</Link>
    </div>
  );
}

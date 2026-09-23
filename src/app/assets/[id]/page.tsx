import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import RiskGauge from "@/components/RiskGauge";
import AssetGraph from "@/components/AssetGraph";
import { setAssetOwnerAction, setAssetStatusAction, setAssetEuAiActTierAction, setAssetCostAction, addAlternativeAction, deleteAlternativeAction } from "@/lib/actions";
import { notFound } from "next/navigation";
import Link from "next/link";
import { VendorBadge } from "@/components/VendorIcon";

export const dynamic = "force-dynamic";

const ASSURANCE_LABEL: Record<string, string> = {
  ASSURED: "Assured",
  NEEDS_REVIEW: "Needs review",
  RESTRICTED: "Restricted",
  BLOCKED: "Blocked",
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "risk", label: "Risk & Assurance" },
  { key: "activity", label: "Activity" },
  { key: "alternatives", label: "Alternatives" },
] as const;

export default async function AssetDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string } }) {
  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "overview";

  const [asset, orgUsers] = await Promise.all([
    db.aiAsset.findUnique({
      where: { id: params.id },
      include: {
        owner: true,
        connector: true,
        connectedSystems: true,
        dataAccess: { include: { dataAsset: true } },
        usages: { include: { user: true }, take: 20 },
        riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
        assuranceReports: { orderBy: { createdAt: "desc" }, take: 1 },
        activities: { orderBy: { occurredAt: "desc" }, take: 8 },
        relationsFrom: { include: { targetAsset: true } },
        relationsTo: { include: { sourceAsset: true } },
        cost: true,
        alternatives: { orderBy: { createdAt: "desc" } },
      },
    }),
    db.user.findMany({ where: { organizationId: "demo-org" }, orderBy: { name: "asc" } }),
  ]);

  if (!asset) notFound();

  const risk = asset.riskAssessments[0];
  const assurance = asset.assuranceReports[0];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-xs text-ink-400 mb-2">
          <Link href="/assets" className="hover:text-ink-100 hover:underline">AI Passports</Link>
          <span className="mx-1.5">/</span>
          {asset.name}
        </div>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <VendorBadge vendor={asset.vendor ?? asset.connector?.provider ?? ""} name={asset.name} size={56} />
            <div>
              <h1 className="font-display text-[28px] leading-tight font-semibold text-ink-100">{asset.name}</h1>
              <p className="text-sm text-ink-400 mt-0.5">
                {asset.vendor ?? "Vendor unknown"} · {asset.type.replace(/_/g, " ").toLowerCase()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1 text-xs">
            <Badge>{asset.status}</Badge>
            {risk && <Badge>{risk.level}</Badge>}
            {assurance && (
              <span
                className={
                  assurance.level === "ASSURED" ? "text-steady font-medium" : assurance.level === "NEEDS_REVIEW" ? "text-signal font-medium" : "text-alarm font-medium"
                }
              >
                {ASSURANCE_LABEL[assurance.level]} · {assurance.score}%
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-line border border-line rounded-lg overflow-hidden">
        <div className="px-5 py-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-1">Current cost</div>
          {asset.cost?.monthlyCostEstimate != null ? (
            <div className="text-sm font-semibold text-accent">€{asset.cost.monthlyCostEstimate.toLocaleString()}/mo</div>
          ) : (
            <div className="text-sm text-ink-400">Not entered</div>
          )}
        </div>
        <div className="px-5 py-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-1">Annualized</div>
          <div className="text-sm font-semibold text-ink-100">
            {asset.cost?.monthlyCostEstimate != null ? `€${(asset.cost.monthlyCostEstimate * 12).toLocaleString()}` : "—"}
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-1">Dependencies</div>
          <div className="text-sm font-semibold text-ink-100">{asset.connectedSystems.length + asset.dataAccess.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <section className="col-span-2">
          <div className="flex gap-1 border-b border-line mb-4">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/assets/${asset.id}?tab=${t.key}`}
                className={`text-sm px-3 py-2 -mb-px border-b-2 transition-colors ${
                  tab === t.key ? "border-steady text-ink-100 font-medium" : "border-transparent text-ink-400 hover:text-ink-100"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>

          {tab === "overview" && (
            <div className="flex flex-col gap-4 text-sm">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <Row label="Department" value={asset.department ?? "—"} />
                <Row label="Model" value={asset.model ?? "—"} />
                <Row label="Source" value={asset.connector?.provider ?? "Manual"} />
                <Row label="Last seen" value={asset.lastSeenAt ? new Date(asset.lastSeenAt).toLocaleDateString() : "—"} />
              </div>

              {(asset.connectedSystems.length > 0 || asset.dataAccess.length > 0) && (
                <div className="flex flex-wrap gap-2 pt-3 border-t border-line">
                  {asset.connectedSystems.map((s) => (
                    <span key={s.id} className="px-2 py-1 rounded border border-line text-xs text-ink-400">
                      {s.system}{s.detail && ` — ${s.detail}`}
                    </span>
                  ))}
                  {asset.dataAccess.map((d) => (
                    <span
                      key={d.id}
                      className={`px-2 py-1 rounded border text-xs ${
                        ["PII", "FINANCIAL", "SOURCE_CODE"].includes(d.dataAsset.sensitivity) ? "border-alarm/40 text-alarm" : "border-line text-ink-400"
                      }`}
                    >
                      {d.dataAsset.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="pt-3 border-t border-line">
                <h3 className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-3">Dependency graph</h3>
                <div>
                  <AssetGraph
                    center={asset.name}
                    centerVendor={asset.vendor}
                    left={asset.usages.slice(0, 6).map((u) => ({ label: u.user?.name ?? u.externalUserRef ?? "Unknown user", sublabel: u.user?.department ?? undefined, kind: "user" as const }))}
                    right={[
                      ...asset.connectedSystems.map((s) => ({
                        label: s.system,
                        sublabel: s.detail ?? undefined,
                        kind: "external" as const,
                        tone: (s.detail?.match(/prod/i) ? "alarm" : "default") as "default" | "alarm",
                      })),
                      ...asset.relationsFrom.map((r) => ({ label: r.targetAsset.name, sublabel: r.relationType, kind: "system" as const })),
                      ...asset.dataAccess.map((d) => ({
                        label: d.dataAsset.name,
                        sublabel: d.dataAsset.sensitivity.replace(/_/g, " ").toLowerCase(),
                        kind: "data" as const,
                        tone: (["PII", "FINANCIAL", "SOURCE_CODE"].includes(d.dataAsset.sensitivity) ? "alarm" : "default") as "default" | "alarm",
                      })),
                    ]}
                  />
                </div>
              </div>
            </div>
          )}

          {tab === "risk" && risk && (
            <div className="flex flex-col gap-4">
              <div className="flex gap-6">
                <RiskGauge score={risk.score} level={risk.level} />
                <div className="flex-1">
                  <ul className="text-sm text-ink-100 flex flex-col gap-1">
                    {(risk.reasons as string[]).map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-ink-400">·</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                  {assurance && (
                    <p className="text-xs text-ink-400 mt-3">
                      Assurance: {assurance.passedCount} passed, {assurance.warningCount} need attention, {assurance.failedCount} failed.{" "}
                      <Link href="/activity?tab=evidence" className="underline hover:text-ink-100">Full evidence</Link>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "activity" && (
            <div className="divide-y divide-line text-sm">
              {asset.activities.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2.5">
                  <div className="text-ink-400">
                    <span className="tabular text-xs mr-2">{new Date(a.occurredAt).toLocaleString()}</span>
                    {a.eventType} {a.actorRef && `— ${a.actorRef}`}
                  </div>
                  <span className="text-xs text-ink-400">{a.source}</span>
                </div>
              ))}
              {asset.activities.length === 0 && <div className="py-2 text-ink-400">No activity recorded yet.</div>}
            </div>
          )}

          {tab === "alternatives" && (
            <div>
              {asset.alternatives.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  {asset.alternatives.map((alt) => (
                    <div key={alt.id} className="flex items-center justify-between text-sm border-b border-line pb-2 last:border-0">
                      <div>
                        <span className="text-ink-100 font-medium">{alt.provider} · {alt.model}</span>
                        {alt.estimatedMonthlyCost != null && <span className="text-ink-400 text-xs ml-2">€{alt.estimatedMonthlyCost.toLocaleString()}/mo</span>}
                        {alt.migrationEffortDays && <span className="text-ink-400 text-xs ml-2">· {alt.migrationEffortDays} days to migrate</span>}
                      </div>
                      <form action={deleteAlternativeAction}>
                        <input type="hidden" name="alternativeId" value={alt.id} />
                        <input type="hidden" name="assetId" value={asset.id} />
                        <button type="submit" className="text-xs text-ink-400 hover:text-alarm transition-colors">Remove</button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
              <details>
                <summary className="cursor-pointer text-xs font-medium text-ink-100 border border-line rounded-md px-2.5 py-1.5 inline-block hover:border-ink-100 transition-colors list-none">
                  + Add an alternative
                </summary>
                <form action={addAlternativeAction} className="mt-3 flex flex-col gap-2 text-sm">
                  <input type="hidden" name="assetId" value={asset.id} />
                  <div className="grid grid-cols-2 gap-2">
                    <input name="provider" placeholder="Provider (e.g. OpenAI)" className="bg-ink border border-line rounded px-2 py-1.5 text-sm text-ink-100" />
                    <input name="model" placeholder="Model (e.g. GPT-5)" className="bg-ink border border-line rounded px-2 py-1.5 text-sm text-ink-100" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input name="estimatedMonthlyCost" type="number" step="0.01" placeholder="Est. €/mo" className="bg-ink border border-line rounded px-2 py-1.5 text-sm text-ink-100" />
                    <select name="qualityConfidence" defaultValue="" className="bg-ink border border-line rounded px-2 py-1.5 text-sm text-ink-100">
                      <option value="">Quality?</option>
                      <option value="LOW">Low quality confidence</option>
                      <option value="MEDIUM">Medium quality confidence</option>
                      <option value="HIGH">High quality confidence</option>
                    </select>
                    <input name="migrationEffortDays" placeholder="Migration days, e.g. 3-5" className="bg-ink border border-line rounded px-2 py-1.5 text-sm text-ink-100" />
                  </div>
                  <textarea name="reasoning" placeholder="Why this could work (optional)" rows={2} className="bg-ink border border-line rounded px-2 py-1.5 text-xs text-ink-100" />
                  <button type="submit" className="text-xs px-2.5 py-1.5 rounded border border-line text-ink-100 hover:border-accent hover:text-accent transition-colors self-start">
                    Add alternative
                  </button>
                </form>
              </details>
            </div>
          )}
        </section>

        <aside className="rounded-xl border border-line bg-panel p-5 text-sm h-fit flex flex-col gap-4">
          <form action={setAssetOwnerAction} className="flex flex-col gap-1">
            <input type="hidden" name="assetId" value={asset.id} />
            <label className="text-xs text-ink-400">Owner</label>
            <div className="flex gap-2">
              <select name="ownerId" defaultValue={asset.ownerId ?? ""} className="flex-1 bg-ink border border-line rounded px-2 py-1.5 text-sm text-ink-100">
                <option value="">No owner on record</option>
                {orgUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                ))}
              </select>
              <button type="submit" className="text-xs px-2.5 rounded border border-line text-ink-100 hover:border-accent hover:text-accent transition-colors">
                Save
              </button>
            </div>
          </form>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-ink-400">Status</span>
            <div className="flex gap-2">
              {(["APPROVED", "UNAPPROVED", "UNREVIEWED"] as const).map((s) => (
                <form key={s} action={setAssetStatusAction}>
                  <input type="hidden" name="assetId" value={asset.id} />
                  <input type="hidden" name="status" value={s} />
                  <button
                    type="submit"
                    disabled={asset.status === s}
                    className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                      asset.status === s ? "border-accent text-accent cursor-default" : "border-line text-ink-400 hover:text-ink-100 hover:border-ink-400"
                    }`}
                  >
                    {s === "APPROVED" ? "Approve" : s === "UNAPPROVED" ? "Reject" : "Unreviewed"}
                  </button>
                </form>
              ))}
            </div>
          </div>

          <form action={setAssetEuAiActTierAction} className="flex flex-col gap-1">
            <input type="hidden" name="assetId" value={asset.id} />
            <label className="text-xs text-ink-400">EU AI Act classification</label>
            <div className="flex gap-2">
              <select name="tier" defaultValue={asset.euAiActTier} className="flex-1 bg-ink border border-line rounded px-2 py-1.5 text-sm text-ink-100">
                <option value="UNCLASSIFIED">Not classified yet</option>
                <option value="MINIMAL_RISK">Minimal risk</option>
                <option value="LIMITED_RISK">Limited risk</option>
                <option value="HIGH_RISK">High risk (Annex III)</option>
              </select>
              <button type="submit" className="text-xs px-2.5 rounded border border-line text-ink-100 hover:border-accent hover:text-accent transition-colors">
                Save
              </button>
            </div>
          </form>

          <form action={setAssetCostAction} className="flex flex-col gap-1 pt-4 border-t border-line">
            <input type="hidden" name="assetId" value={asset.id} />
            <label className="text-xs text-ink-400">Monthly cost (manual entry)</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                name="monthlyCostEstimate"
                defaultValue={asset.cost?.monthlyCostEstimate ?? ""}
                placeholder="€ / month"
                className="flex-1 bg-ink border border-line rounded px-2 py-1.5 text-sm text-ink-100"
              />
              <select name="confidence" defaultValue={asset.cost?.confidence ?? "MEDIUM"} className="bg-ink border border-line rounded px-2 py-1.5 text-sm text-ink-100">
                <option value="LOW">Low confidence</option>
                <option value="MEDIUM">Medium confidence</option>
                <option value="HIGH">High confidence</option>
              </select>
            </div>
            <button type="submit" className="text-xs px-2.5 py-1.5 rounded border border-line text-ink-100 hover:border-accent hover:text-accent transition-colors mt-1 self-start">
              Save cost
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink-400">{label}</dt>
      <dd className="text-ink-100 text-right truncate">{value}</dd>
    </div>
  );
}

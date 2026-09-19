import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import RiskGauge from "@/components/RiskGauge";
import AssetGraph from "@/components/AssetGraph";
import { setAssetOwnerAction, setAssetStatusAction, setAssetEuAiActTierAction, setAssetCostAction } from "@/lib/actions";
import { notFound } from "next/navigation";
import Link from "next/link";
import VendorIcon from "@/components/VendorIcon";

export const dynamic = "force-dynamic";

const ASSURANCE_LABEL: Record<string, string> = {
  ASSURED: "Assured",
  NEEDS_REVIEW: "Needs review",
  RESTRICTED: "Restricted",
  BLOCKED: "Blocked",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export default async function AssetDetailPage({ params }: { params: { id: string } }) {
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
      },
    }),
    db.user.findMany({ where: { organizationId: "demo-org" }, orderBy: { name: "asc" } }),
  ]);

  if (!asset) notFound();

  const risk = asset.riskAssessments[0];
  const assurance = asset.assuranceReports[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-xs text-ink-400 mb-2">
          <Link href="/assets" className="hover:text-ink-100 hover:underline">AI Passports</Link>
          <span className="mx-1.5">/</span>
          {asset.name}
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink-100">{asset.name}</h1>
            <p className="text-sm text-ink-400 mt-1 flex items-center gap-1.5">
              <VendorIcon vendor={asset.vendor ?? asset.connector?.provider ?? ""} />
              {asset.vendor ?? "Vendor unknown"} · {asset.type.replace(/_/g, " ").toLowerCase()}
            </p>
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

      <div className="rounded-lg border border-line bg-panel shadow-card grid grid-cols-3 divide-x divide-line">
        <div className="px-5 py-4">
          <div className="text-xs text-ink-400 mb-1">Current cost</div>
          {asset.cost?.monthlyCostEstimate != null ? (
            <>
              <div className="font-display text-xl font-semibold text-ink-100">
                €{asset.cost.monthlyCostEstimate.toLocaleString()}<span className="text-sm font-normal text-ink-400">/mo</span>
              </div>
              <div className="text-xs text-ink-400 mt-0.5">
                {CONFIDENCE_LABEL[asset.cost.confidence] ?? asset.cost.confidence} confidence · manually entered
              </div>
            </>
          ) : (
            <div className="text-sm text-ink-400">Not entered yet</div>
          )}
        </div>
        <div className="px-5 py-4">
          <div className="text-xs text-ink-400 mb-1">Annualized</div>
          <div className="font-display text-xl font-semibold text-ink-100">
            {asset.cost?.monthlyCostEstimate != null ? `€${(asset.cost.monthlyCostEstimate * 12).toLocaleString()}` : "—"}
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="text-xs text-ink-400 mb-1">Dependencies</div>
          <div className="font-display text-xl font-semibold text-ink-100">
            {asset.connectedSystems.length + asset.dataAccess.length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <section className="col-span-2 flex flex-col gap-6">
          {/* Overview: fatti principali + accesso, un unico blocco invece di tre */}
          <div className="rounded-md border border-line bg-panel shadow-card p-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
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

            <details className="mt-3 pt-3 border-t border-line">
              <summary className="cursor-pointer text-xs text-ink-400 hover:text-ink-100">View relationship graph →</summary>
              <div className="mt-4">
                <AssetGraph
                  center={asset.name}
                  left={asset.usages.slice(0, 6).map((u) => ({ label: u.user?.name ?? u.externalUserRef ?? "Unknown user" }))}
                  right={[
                    ...asset.connectedSystems.map((s) => ({
                      label: s.system,
                      sublabel: s.detail ?? undefined,
                      tone: (s.detail?.match(/prod/i) ? "alarm" : "default") as "default" | "alarm",
                    })),
                    ...asset.relationsFrom.map((r) => ({ label: r.targetAsset.name, sublabel: r.relationType })),
                    ...asset.dataAccess.map((d) => ({
                      label: d.dataAsset.name,
                      sublabel: d.dataAsset.sensitivity,
                      tone: (["PII", "FINANCIAL", "SOURCE_CODE"].includes(d.dataAsset.sensitivity) ? "alarm" : "default") as "default" | "alarm",
                    })),
                  ]}
                />
              </div>
            </details>
          </div>

          {/* Risk & Assurance uniti: la checklist completa vive solo su Evidence */}
          {risk && (
            <div className="rounded-md border border-line bg-panel shadow-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-ink-100">Risk & Assurance</h2>
                <Link href="/evidence" className="text-xs text-ink-400 hover:text-ink-100 hover:underline">
                  Full evidence →
                </Link>
              </div>
              <div className="flex gap-6">
                <RiskGauge score={risk.score} level={risk.level} />
                <div className="flex-1">
                  <ul className="text-sm text-ink-100 flex flex-col gap-1">
                    {(risk.reasons as string[]).slice(0, 3).map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-ink-400">·</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                  {assurance && (
                    <p className="text-xs text-ink-400 mt-3">
                      Assurance: {assurance.passedCount} passed, {assurance.warningCount} need attention, {assurance.failedCount} failed.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-md border border-line bg-panel shadow-card p-5">
            <h2 className="text-sm font-medium text-ink-400 mb-3">Recent activity</h2>
            <div className="divide-y divide-line text-sm">
              {asset.activities.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2">
                  <div className="text-ink-400">
                    <span className="tabular text-xs mr-2">{new Date(a.occurredAt).toLocaleString()}</span>
                    {a.eventType} {a.actorRef && `— ${a.actorRef}`}
                  </div>
                  <span className="text-xs text-ink-400">{a.source}</span>
                </div>
              ))}
              {asset.activities.length === 0 && <div className="py-2 text-ink-400">No activity recorded yet.</div>}
            </div>
          </div>
        </section>

        <aside className="rounded-md border border-line bg-panel shadow-card p-5 text-sm h-fit flex flex-col gap-4">
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
            <textarea
              name="notes"
              defaultValue={asset.cost?.notes ?? ""}
              placeholder="How was this estimated? (optional)"
              rows={2}
              className="bg-ink border border-line rounded px-2 py-1.5 text-xs text-ink-100 mt-1"
            />
            <button type="submit" className="text-xs px-2.5 py-1.5 rounded border border-line text-ink-100 hover:border-accent hover:text-accent transition-colors mt-1 self-start">
              Save cost
            </button>
            <p className="text-[11px] text-ink-400 mt-1">
              No billing connector yet — this is whatever you enter, nothing is estimated automatically.
            </p>
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

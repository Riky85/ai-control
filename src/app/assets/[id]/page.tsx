import { fmtDate, fmtDateTime } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import RiskGauge from "@/components/RiskGauge";
import AssetGraph from "@/components/AssetGraph";
import { setAssetOwnerAction, setAssetStatusAction, setAssetEuAiActTierAction, setAssetCostAction, addAlternativeAction, deleteAlternativeAction } from "@/lib/actions";
import { notFound } from "next/navigation";
import Link from "next/link";
import { VendorBadge } from "@/components/VendorIcon";
import { StatCard, Tabs, Panel, Table, td } from "@/components/ui";
import StatusDot from "@/components/StatusDot";
import ExportMenu from "@/components/ExportMenu";

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
    db.aiAsset.findFirst({
      where: { id: params.id, organizationId: currentOrgId() },
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
    db.user.findMany({ where: { organizationId: currentOrgId() }, orderBy: { name: "asc" } }),
  ]);

  if (!asset) notFound();

  const risk = asset.riskAssessments[0];
  const assurance = asset.assuranceReports[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <nav className="text-sm text-ink-400 mb-2 flex items-center gap-1.5">
            <Link href="/assets" className="hover:text-ink-100 hover:underline">AI Passports</Link>
            <span aria-hidden>/</span>
            <span className="truncate">{asset.name}</span>
          </nav>
          <div className="flex items-center gap-4">
            <VendorBadge vendor={asset.vendor ?? asset.connector?.provider ?? ""} name={asset.name} size={56} />
            <div className="min-w-0">
              <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink-100 truncate">{asset.name}</h1>
              <p className="text-sm text-ink-400 mt-0.5">
                {asset.vendor ?? "Vendor unknown"} · {asset.type.replace(/_/g, " ").toLowerCase()}
              </p>
            </div>
          </div>
        </div>
        {/* Stessa riga e stessa altezza del pulsante documentazione (fisso nel layout). */}
        <div className="flex items-center gap-2 shrink-0 pr-11 min-h-9">
          <Badge>{asset.status}</Badge>
          {risk && <Badge>{risk.level}</Badge>}
          {assurance && <Badge>{assurance.level}</Badge>}
          <ExportMenu dataset={`passport-${asset.id}`} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Current cost"
          value={asset.cost?.monthlyCostEstimate != null ? `€${asset.cost.monthlyCostEstimate.toLocaleString()}` : "—"}
          hint={asset.cost?.monthlyCostEstimate != null ? costSource(asset.cost) : "Found automatically from your bank statement or billing"}
        />
        <StatCard label="Annualized" value={asset.cost?.monthlyCostEstimate != null ? `€${(asset.cost.monthlyCostEstimate * 12).toLocaleString()}` : "—"} />
        <StatCard label="Dependencies" value={String(asset.connectedSystems.length + asset.dataAccess.length)} hint="Systems and data it touches" />
        <StatCard
          label="Assurance"
          value={assurance ? `${assurance.score}%` : "—"}
          hint={assurance ? ASSURANCE_LABEL[assurance.level] : "Not assessed"}
          tone={assurance ? (assurance.level === "ASSURED" ? undefined : assurance.level === "NEEDS_REVIEW" ? "signal" : "alarm") : undefined}
        />
      </div>

      <Tabs active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/assets/${asset.id}?tab=${t.key}` }))} />

      <div className="grid grid-cols-3 gap-4 items-start">
        <div className="col-span-2 flex flex-col gap-4">
          {tab === "overview" && (
            <>
              <Panel title="Details">
                <dl className="grid grid-cols-3 gap-x-6 gap-y-5">
                  <Field label="Model" value={asset.model} />
                  <Field label="Provider" value={asset.vendor} />
                  <Field label="Type" value={asset.type.replace(/_/g, " ").toLowerCase()} />
                  <Field label="Owner" value={asset.owner?.name ?? asset.owner?.email} empty="No owner yet" />
                  <Field label="Department" value={asset.department} />
                  <Field label="EU AI Act" value={EU_LABEL[asset.euAiActTier]} />
                  <Field label="Discovered by" value={asset.connector ? asset.connector.provider.replace(/_/g, " ").toLowerCase() : "Added manually"} />
                  <Field label="First seen" value={fmtDate(asset.firstSeenAt)} />
                  <Field label="Last seen" value={asset.lastSeenAt ? fmtDate(asset.lastSeenAt) : null} />
                </dl>
              </Panel>
              <Panel title="Dependency graph" subtitle="Who uses it, and which systems and data it depends on">
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
                      tone: (SENSITIVE.includes(d.dataAsset.sensitivity) ? "alarm" : "default") as "default" | "alarm",
                    })),
                  ]}
                />
              </Panel>
            </>
          )}

          {tab === "risk" && (
            <>
              <Panel title="Risk" subtitle="Computed by rules from what angar knows about this system">
                {risk ? (
                  <div className="flex gap-8 items-start">
                    <div className="shrink-0">
                      <RiskGauge score={risk.score} level={risk.level} />
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-ink-100 mb-2">Why</h3>
                        <ul className="flex flex-col gap-2 text-sm text-ink-400">
                          {(risk.reasons as string[]).map((r, i) => (
                            <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-alarm shrink-0" />{r}</li>
                          ))}
                          {(risk.reasons as string[]).length === 0 && <li>No risk factors found.</li>}
                        </ul>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-ink-100 mb-2">What would lower it</h3>
                        <ul className="flex flex-col gap-2 text-sm text-ink-400">
                          {((risk.mitigations as string[] | null) ?? []).map((m, i) => (
                            <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-steady shrink-0" />{m}</li>
                          ))}
                          {((risk.mitigations as string[] | null) ?? []).length === 0 && <li>Nothing to suggest.</li>}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-ink-400">Not assessed yet — it's computed after the next sync.</p>
                )}
              </Panel>
              <Panel
                title="Assurance checks"
                subtitle={assurance ? `${assurance.passedCount} passed · ${assurance.warningCount} need attention · ${assurance.failedCount} failed` : "Not assessed yet"}
                action={<Link href="/activity?tab=evidence" className="btn btn-secondary btn-sm">Full evidence</Link>}
              >
                <div className="divide-y divide-line -mx-5 border-t border-line">
                  {((assurance?.checks as unknown as { key: string; label: string; status: "PASSED" | "WARNING" | "FAILED"; detail: string }[] | undefined) ?? []).map((ch) => (
                    <div key={ch.key} className="flex items-start gap-3 px-5 py-3">
                      <span className="mt-0.5"><StatusDot status={ch.status} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-ink-100">{ch.label}</div>
                        <div className="text-xs text-ink-400 mt-0.5">{ch.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          )}

          {tab === "activity" && (
            <Table columns={["When", "Event", "By", "Source"]} empty={asset.activities.length === 0 ? "No activity recorded yet." : false}>
              {asset.activities.map((a) => (
                <tr key={a.id}>
                  <td className={`${td} tabular text-ink-400 whitespace-nowrap`}>{fmtDateTime(a.occurredAt)}</td>
                  <td className={`${td} text-ink-100`}>{a.eventType.replace(/[._]/g, " ")}</td>
                  <td className={`${td} text-ink-400`}>{a.actorRef ?? "—"}</td>
                  <td className={`${td} text-ink-400`}>{a.source.replace(/_/g, " ").toLowerCase()}</td>
                </tr>
              ))}
            </Table>
          )}

          {tab === "alternatives" && (
            <>
              <Table
                columns={["Alternative", "Est. cost / mo", "Saving / mo", "Quality", "Migration", { label: "", className: "w-16" }]}
                empty={asset.alternatives.length === 0 ? "No alternatives recorded yet — add one you've evaluated below." : false}
              >
                {asset.alternatives.map((alt) => {
                  const current = asset.cost?.monthlyCostEstimate;
                  const saving = current != null && alt.estimatedMonthlyCost != null ? current - alt.estimatedMonthlyCost : null;
                  return (
                    <tr key={alt.id}>
                      <td className={td}>
                        <span className="flex items-center gap-3">
                          <VendorBadge vendor={alt.provider} name={alt.model} size={28} />
                          <span>
                            <span className="block font-medium text-ink-100">{alt.model}</span>
                            <span className="block text-xs text-ink-400">{alt.provider}</span>
                          </span>
                        </span>
                      </td>
                      <td className={`${td} tabular`}>{alt.estimatedMonthlyCost != null ? `€${alt.estimatedMonthlyCost.toLocaleString()}` : "—"}</td>
                      <td className={`${td} tabular font-medium ${saving == null ? "text-ink-400" : saving > 0 ? "text-steady" : "text-alarm"}`}>
                        {saving == null ? "—" : `${saving > 0 ? "−" : "+"}€${Math.abs(saving).toLocaleString()}`}
                      </td>
                      <td className={`${td} text-ink-100`}>{alt.qualityConfidence ? alt.qualityConfidence.charAt(0) + alt.qualityConfidence.slice(1).toLowerCase() : "—"}</td>
                      <td className={`${td} text-ink-400`}>{alt.migrationEffortDays ? `${alt.migrationEffortDays} days` : "—"}</td>
                      <td className={`${td} text-right`}>
                        <form action={deleteAlternativeAction}>
                          <input type="hidden" name="alternativeId" value={alt.id} />
                          <input type="hidden" name="assetId" value={asset.id} />
                          <button type="submit" className="text-sm text-ink-400 hover:text-alarm transition-colors">Remove</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </Table>
              <Panel title="Add an alternative" subtitle={asset.cost?.monthlyCostEstimate != null ? `Compared with the current €${asset.cost.monthlyCostEstimate.toLocaleString()}/month` : "Enter this system's current cost in Manage to see savings"}>
                <form action={addAlternativeAction} className="grid grid-cols-6 gap-3">
                  <input type="hidden" name="assetId" value={asset.id} />
                  <input name="provider" required placeholder="Provider, e.g. OpenAI" className={`${INPUT} col-span-2`} />
                  <input name="model" required placeholder="Model, e.g. GPT-5" className={`${INPUT} col-span-2`} />
                  <input name="estimatedMonthlyCost" type="number" step="0.01" placeholder="€ / month" className={`${INPUT} col-span-2`} />
                  <select name="qualityConfidence" defaultValue="" className={`${INPUT} col-span-2`}>
                    <option value="">Quality confidence</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                  <input name="migrationEffortDays" placeholder="Migration days, e.g. 3-5" className={`${INPUT} col-span-2`} />
                  <input name="reasoning" placeholder="Why it could work (optional)" className={`${INPUT} col-span-2`} />
                  <div className="col-span-6 flex justify-end">
                    <button type="submit" className="btn btn-primary">Add alternative</button>
                  </div>
                </form>
              </Panel>
            </>
          )}
        </div>

        <aside className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-5">
          <h2 className="text-base font-semibold text-ink-100">Manage</h2>

          <div className="flex flex-col gap-2">
            <span className="text-sm text-ink-400">Status</span>
            <div className="grid grid-cols-3 gap-1 bg-ink rounded-lg p-1">
              {(["APPROVED", "UNREVIEWED", "UNAPPROVED"] as const).map((s) => (
                <form key={s} action={setAssetStatusAction}>
                  <input type="hidden" name="assetId" value={asset.id} />
                  <input type="hidden" name="status" value={s} />
                  <button
                    type="submit"
                    disabled={asset.status === s}
                    className={`w-full text-sm py-1.5 rounded-md transition-colors ${
                      asset.status === s ? "bg-panel text-ink-100 font-medium shadow-card cursor-default" : "text-ink-400 hover:text-ink-100"
                    }`}
                  >
                    {s === "APPROVED" ? "Approved" : s === "UNAPPROVED" ? "Rejected" : "In review"}
                  </button>
                </form>
              ))}
            </div>
          </div>

          <form action={setAssetOwnerAction} className="flex flex-col gap-2">
            <input type="hidden" name="assetId" value={asset.id} />
            <label className="text-sm text-ink-400" htmlFor="ownerId">Owner</label>
            <div className="flex gap-2">
              <select id="ownerId" name="ownerId" defaultValue={asset.ownerId ?? ""} className={`${INPUT} flex-1 min-w-0`}>
                <option value="">No owner yet</option>
                {orgUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondary">Save</button>
            </div>
          </form>

          <form action={setAssetEuAiActTierAction} className="flex flex-col gap-2">
            <input type="hidden" name="assetId" value={asset.id} />
            <label className="text-sm text-ink-400" htmlFor="tier">EU AI Act</label>
            <div className="flex gap-2">
              <select id="tier" name="tier" defaultValue={asset.euAiActTier} className={`${INPUT} flex-1 min-w-0`}>
                {Object.entries(EU_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondary">Save</button>
            </div>
          </form>

          <details className="pt-5 border-t border-line group">
          <summary className="cursor-pointer list-none text-sm text-ink-400 hover:text-ink-100 select-none">Cost looks wrong? Correct it</summary>
          <form action={setAssetCostAction} className="flex flex-col gap-2 mt-3">
            <input type="hidden" name="assetId" value={asset.id} />
            <label className="text-sm text-ink-400" htmlFor="cost">Monthly cost</label>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">€</span>
                <input id="cost" type="number" step="0.01" name="monthlyCostEstimate" defaultValue={asset.cost?.monthlyCostEstimate ?? ""} placeholder="0" className={`${INPUT} w-full pl-7`} />
              </div>
              <select name="confidence" defaultValue={asset.cost?.confidence ?? "MEDIUM"} className={INPUT}>
                <option value="LOW">Rough</option>
                <option value="MEDIUM">Estimate</option>
                <option value="HIGH">Exact</option>
              </select>
            </div>
            <button type="submit" className="btn btn-secondary w-full">Save cost</button>
          </form>
          </details>
        </aside>
      </div>
    </div>
  );
}

const INPUT = "field";
const SENSITIVE = ["PII", "FINANCIAL", "SOURCE_CODE"];
const EU_LABEL: Record<string, string> = {
  UNCLASSIFIED: "Not classified yet",
  MINIMAL_RISK: "Minimal risk",
  LIMITED_RISK: "Limited risk",
  HIGH_RISK: "High risk (Annex III)",
};

function Field({ label, value, empty = "—" }: { label: string; value?: string | null; empty?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className={`text-sm mt-1 truncate ${value ? "text-ink-100" : "text-ink-400"}`}>{value || empty}</dd>
    </div>
  );
}

function costSource(c: { basis: string; seats: number | null; planId: string | null; notes: string | null }) {
  const plan = c.notes?.match(/looks like (.+)$/)?.[1];
  const from =
    c.basis === "bank" ? "From your bank statement" : c.basis === "invoice" ? "From your invoices" : c.basis === "billing_connector" ? "From provider billing" : c.basis === "estimate" ? "Estimated from list prices" : "Entered by hand";
  return plan ? `${from} · ${plan}` : `${from} · per month`;
}

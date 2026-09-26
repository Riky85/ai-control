import { fmtDate, fmtDateTime, fmtEur } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import RiskGauge from "@/components/RiskGauge";
import { setAssetOwnerAction, setAssetStatusAction, setAssetEuAiActTierAction, setAssetCostAction } from "@/lib/actions";
import { dismissSavingAction } from "@/lib/spend-actions";
import { notFound } from "next/navigation";
import Link from "next/link";
import { VendorBadge } from "@/components/VendorIcon";
import { StatCard, Tabs, Panel, Table, td } from "@/components/ui";
import StatusDot from "@/components/StatusDot";
import ExportMenu from "@/components/ExportMenu";
import { computeSavings, categoryOf, monthlyOf } from "@/lib/savings";
import { CATEGORY_LABEL, PLANS } from "@/lib/pricing/catalog";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "spend", label: "Spend" },
  { key: "people", label: "People" },
  { key: "risk", label: "Risk & compliance" },
  { key: "activity", label: "Activity" },
] as const;

const DAY = 86400000;
const CONF: Record<string, string> = { HIGH: "Sure", MEDIUM: "Likely", LOW: "Worth checking" };

// Il passaporto di un'AI: quanto costa, chi la usa, come risparmiare, cosa tocca.
export default async function AssetDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string } }) {
  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "overview";
  const orgId = currentOrgId();

  const [asset, orgUsers, spend, { items, assets }] = await Promise.all([
    db.aiAsset.findFirst({
      where: { id: params.id, organizationId: orgId },
      include: {
        owner: true,
        connector: true,
        connectedSystems: true,
        dataAccess: { include: { dataAsset: true } },
        usages: { include: { user: true }, orderBy: { lastSeenAt: "desc" }, take: 200 },
        riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
        assuranceReports: { orderBy: { createdAt: "desc" }, take: 1 },
        activities: { orderBy: { occurredAt: "desc" }, take: 30 },
        cost: true,
      },
    }),
    db.user.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" } }),
    db.spendRecord.findMany({ where: { organizationId: orgId, aiAssetId: params.id }, orderBy: { date: "desc" }, take: 100 }),
    computeSavings(orgId),
  ]);

  if (!asset) notFound();

  const risk = asset.riskAssessments[0];
  const assurance = asset.assuranceReports[0];
  const loaded = assets.find((a) => a.id === asset.id);
  const m = loaded ? monthlyOf(loaded) : asset.cost?.monthlyCostEstimate != null ? { eur: asset.cost.monthlyCostEstimate, estimated: false } : null;
  const cat = categoryOf(asset);
  const plan = asset.cost?.planId ? PLANS.find((p) => p.id === asset.cost!.planId) : null;
  const seats = asset.cost?.seats ?? null;
  const active = asset.usages.filter((u) => u.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < 30 * DAY).length;
  // Per un doppione, il suggerimento compare solo sulle AI da togliere.
  const mine = items.filter((i) => (i.kind === "duplicate" ? i.assets.slice(1) : i.assets).some((a) => a.id === asset.id));
  const canSave = mine.reduce((t, i) => t + (i.kind === "duplicate" ? (i.assets[0]?.id === asset.id ? 0 : m?.eur ?? 0) : i.monthlyEur), 0);
  const sources = [
    spend.some((r) => r.source === "bank") && "Bank statement",
    spend.some((r) => r.source === "invoice") && "Invoices",
    asset.connector && asset.connector.provider !== "NETWORK" && asset.connector.provider.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    asset.activities.some((a) => a.eventType === "discovery.seen") && "Scan",
    asset.activities.some((a) => a.eventType === "signin" || a.eventType === "copilot.active") && "Microsoft 365",
    asset.activities.some((a) => a.eventType.startsWith("oauth.")) && "Google Workspace",
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <nav className="text-sm text-ink-400 mb-2 flex items-center gap-1.5">
            <Link href="/" className="hover:text-ink-100 hover:underline">Your AI</Link>
            <span aria-hidden>/</span>
            <span className="truncate">{asset.name}</span>
          </nav>
          <div className="flex items-center gap-4">
            <VendorBadge vendor={asset.vendor ?? asset.connector?.provider ?? ""} name={asset.name} size={56} />
            <div className="min-w-0">
              <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink-100 truncate">{asset.name}</h1>
              <p className="text-sm text-ink-400 mt-0.5">
                {[asset.vendor ?? "Vendor unknown", cat ? CATEGORY_LABEL[cat] : asset.type.replace(/_/g, " ").toLowerCase(), sources.length ? `found via ${sources.join(", ")}` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 pr-11 min-h-9">
          <Badge>{asset.status}</Badge>
          <ExportMenu dataset={`passport-${asset.id}`} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          href={`/assets/${asset.id}?tab=spend`}
          label="Cost / month"
          value={m ? `${m.estimated ? "≈ " : ""}${fmtEur(m.eur)}` : "Not paid"}
          hint={asset.cost?.monthlyCostEstimate != null ? costSource(asset.cost) : m ? "Estimated from list prices" : "Free, or paid personally"}
        />
        <StatCard href={`/assets/${asset.id}?tab=spend`} label="Plan" value={plan ? (seats && seats > 1 ? `${seats} seats` : "1 seat") : m && !m.estimated ? "Usage" : "—"} hint={plan?.name ?? (m ? "Pay as you go" : "Unknown")} />
        <StatCard
          href={asset.usages.length ? `/assets/${asset.id}?tab=people` : "/sources"}
          label="People"
          value={asset.usages.length ? (seats ? `${active} / ${seats}` : String(asset.usages.length)) : seats ? `? / ${seats}` : "—"}
          hint={asset.usages.length ? (seats ? "active in 30 days / paid seats" : "people using it") : "Connect Microsoft 365 or Google to see who uses it"}
        />
        <StatCard href={`/assets/${asset.id}`} label="Could save" value={canSave >= 1 ? `${fmtEur(canSave)}/mo` : "—"} hint={canSave >= 1 ? `${fmtEur(canSave * 12)} a year` : "Nothing found"} tone={canSave >= 1 ? "accent" : undefined} />
      </div>

      <Tabs active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/assets/${asset.id}?tab=${t.key}` }))} />

      <div className="grid grid-cols-3 gap-4 items-start">
        <div className="col-span-2 flex flex-col gap-4">
          {tab === "overview" && (
            <>
              <Panel title="How to save" subtitle="Calculated automatically from your bills, seats and list prices">
                <div className="divide-y divide-line -mx-5 border-t border-line">
                  {mine.map((i) => (
                    <div key={i.key} className="flex items-start gap-4 px-5 py-3.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-ink-100">{i.title} <span className="ml-1 text-[11px] font-normal text-ink-400">{CONF[i.confidence]}</span></div>
                        <div className="text-sm text-ink-400 mt-0.5">{i.detail}</div>
                      </div>
                      <div className="text-sm font-semibold text-ink-100 tabular shrink-0">{fmtEur(i.monthlyEur)}/mo</div>
                      <form action={dismissSavingAction}>
                        <input type="hidden" name="key" value={i.key} />
                        <button className="text-xs text-ink-400 hover:text-ink-100" title="Not for us — hide">Hide</button>
                      </form>
                    </div>
                  ))}
                  {mine.length === 0 && <p className="px-5 py-4 text-sm text-ink-400">Nothing to save on {asset.name} right now. angar checks again whenever new data arrives.</p>}
                </div>
              </Panel>
              <Panel title="Details">
                <dl className="grid grid-cols-3 gap-x-6 gap-y-5">
                  <Field label="Provider" value={asset.vendor} />
                  <Field label="Model" value={asset.model} />
                  <Field label="Owner" value={asset.owner?.name ?? asset.owner?.email} empty="No owner" />
                  <Field label="EU AI Act" value={EU_LABEL[asset.euAiActTier]} />
                  <Field label="In use since" value={fmtDate(asset.firstSeenAt)} />
                  <Field label="Last seen" value={asset.lastSeenAt ? fmtDate(asset.lastSeenAt) : null} />
                </dl>
                {(asset.dataAccess.length > 0 || asset.connectedSystems.length > 0) && (
                  <div className="mt-5 pt-5 border-t border-line">
                    <div className="text-xs text-ink-400 mb-2">What it touches</div>
                    <div className="flex flex-wrap gap-1.5">
                      {asset.dataAccess.map((d) => (
                        <span key={d.id} className={`text-xs rounded-full px-2.5 py-1 ${SENSITIVE.includes(d.dataAsset.sensitivity) ? "bg-alarm/10 text-alarm" : "bg-ink text-ink-400"}`}>{d.dataAsset.name}</span>
                      ))}
                      {asset.connectedSystems.map((c) => (
                        <span key={c.id} className="text-xs rounded-full px-2.5 py-1 bg-ink text-ink-400">{c.system}{c.detail ? ` · ${c.detail}` : ""}</span>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
            </>
          )}

          {tab === "spend" && (
            <Table columns={["Date", "Charge", "Source", { label: "Amount", className: "text-right" }]} empty={spend.length === 0 ? "No charges yet — add a bank statement or invoices in Sources." : false}>
              {spend.map((r) => (
                <tr key={r.id}>
                  <td className={`${td} tabular text-ink-400 whitespace-nowrap`}>{fmtDate(r.date)}</td>
                  <td className={`${td} text-ink-100`}>{r.description}</td>
                  <td className={`${td} text-ink-400`}>{r.source === "bank" ? "Bank statement" : "Invoice"}</td>
                  <td className={`${td} text-right tabular text-ink-100`}>{fmtEur(r.amountEur, { decimals: true })}</td>
                </tr>
              ))}
            </Table>
          )}

          {tab === "people" && (
            <Table columns={["Person", "Department", "Last active"]} empty={asset.usages.length === 0 ? "Nobody known yet — connect Microsoft 365, Google Workspace or an Admin key to see who uses it." : false}>
              {asset.usages.map((u) => (
                <tr key={u.id}>
                  <td className={`${td} text-ink-100`}>{u.user?.name ?? u.user?.email ?? u.externalUserRef ?? "Unknown"}{u.user?.name && <span className="block text-xs text-ink-400">{u.user.email}</span>}</td>
                  <td className={`${td} text-ink-400`}>{u.user?.department ?? "—"}</td>
                  <td className={`${td} text-ink-400 tabular`}>{u.lastSeenAt ? fmtDate(u.lastSeenAt) : "—"}</td>
                </tr>
              ))}
            </Table>
          )}

          {tab === "risk" && (
            <>
              <Panel title="Risk" subtitle="Computed by rules from what angar knows about this AI">
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

import { fmtDate, fmtDateTime, fmtEur } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { AssetLimitNotice } from "@/components/PlanBanner";
import { db } from "@/lib/db";
import RiskGauge from "@/components/RiskGauge";
import { setAssetOwnerAction, setAssetStatusAction, setAssetAiActOverrideAction, setAssetCostAction } from "@/lib/actions";
import { classifyAiAct, AI_ACT_TIERS, AI_ACT_TIER_LABEL } from "@/lib/compliance/ai-act";
import { TierPill } from "@/components/governance/RegisterView";
import { setNetworkBlockAction, setInsteadAssetAction } from "@/lib/edge-actions";
import { dismissSavingAction } from "@/lib/spend-actions";
import AssetPeople from "@/components/AssetPeople";
import { saveContractAction } from "@/lib/savings-actions";
import { noticeDeadline, daysUntil } from "@/lib/contracts";
import { notFound } from "next/navigation";
import Link from "next/link";
import { VendorBadge } from "@/components/VendorIcon";
import { StatCard, Tabs, Panel, Table, td } from "@/components/ui";
import StatusDot from "@/components/StatusDot";
import VendorRiskCard from "@/components/VendorRiskCard";
import ExportMenu from "@/components/ExportMenu";
import { computeSavingsCached, categoryOf, monthlyOf } from "@/lib/savings";
import { CATEGORY_LABEL, PLANS, MANAGE_URL } from "@/lib/pricing/catalog";
import { priceForAsset } from "@/lib/engine/price-index";
import { MarketPriceStrip, pickRow } from "@/components/engine/PriceIndexCard";
import VendorTermsCard from "@/components/engine/VendorRiskCard";
import { vendorRiskFor, planTier } from "@/lib/vendor-risk";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";
import { displayableRef } from "@/lib/discovery/pseudonym";

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
export default async function AssetDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string; reminded?: string; error?: string; removed?: string; saved?: string } }) {
  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "overview";
  const orgId = currentOrgId();

  const [asset, orgUsers, spend, { items, assets }, market, privacy] = await Promise.all([
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
    computeSavingsCached(orgId),
    // angar Engine: prezzo di un posto vs mercato o listino (mai bloccante per la pagina).
    priceForAsset(orgId, params.id).catch(() => null),
    orgPrivacyMode(orgId),
  ]);
  // Privacy per reparto / solo totali: nella scheda Activity niente attori (email, username).
  const people = showsPeople(privacy);

  if (!asset) notFound();

  const risk = asset.riskAssessments[0];
  const assurance = asset.assuranceReports[0];
  const loaded = assets.find((a) => a.id === asset.id);
  const m = loaded ? monthlyOf(loaded) : asset.cost?.monthlyCostEstimate != null ? { eur: asset.cost.monthlyCostEstimate, estimated: false } : null;
  const cat = categoryOf(asset);
  // Classe AI Act (automatica o scelta a mano), con motivi e obblighi.
  const aiAct = classifyAiAct({ ...asset, category: cat, dataNames: asset.dataAccess.map((d) => d.dataAsset.name), override: asset.aiActTier, overrideNote: asset.aiActNote });
  const plan = asset.cost?.planId ? PLANS.find((p) => p.id === asset.cost!.planId) : null;
  const seats = asset.cost?.seats ?? null;
  // Condizioni del fornitore col piano in uso (business o personale).
  const vendorRisk = vendorRiskFor(asset);
  const tier = planTier({ type: asset.type, planBusiness: plan ? plan.business : null, paidByCompany: !!m && m.eur > 0 && !m.estimated });
  const active = asset.usages.filter((u) => u.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < 30 * DAY).length;
  // Per un doppione, il suggerimento compare solo sulle AI da togliere.
  const manage = asset.serviceId ? MANAGE_URL[asset.serviceId] : undefined;
  const mine = items.filter((i) => (i.kind === "duplicate" ? i.assets.slice(1) : i.assets).some((a) => a.id === asset.id));
  const canSave = mine.reduce((t, i) => t + (i.kind === "duplicate" ? (i.assets[0]?.id === asset.id ? 0 : m?.eur ?? 0) : i.monthlyEur), 0);
  const sources = [
    spend.some((r) => r.source === "bank") && "Bank statement",
    spend.some((r) => r.source === "invoice") && "Invoices",
    asset.connector && asset.connector.provider !== "NETWORK" && asset.connector.provider.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    asset.activities.some((a) => a.eventType === "discovery.seen") && "Scan",
    asset.activities.some((a) => a.eventType === "edge.seen") && "angar Edge",
    asset.activities.some((a) => a.eventType === "signin" || a.eventType === "copilot.active") && "Microsoft 365",
    asset.activities.some((a) => a.eventType.startsWith("oauth.")) && "Google Workspace",
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap lg:flex-nowrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <nav className="text-sm text-ink-400 mb-2 flex items-center gap-1.5">
            <Link href="/" className="hover:text-ink-100 hover:underline">Your AI</Link>
            <span aria-hidden>/</span>
            <span className="truncate">{asset.name}</span>
          </nav>
          <div className="flex items-center gap-3 sm:gap-4">
            <VendorBadge vendor={asset.vendor ?? asset.connector?.provider ?? ""} name={asset.name} size={56} />
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink-100 break-words lg:truncate min-w-0">{asset.name}</h1>
                {/* Stato accanto al nome: si cambia con un clic. */}
                <div className="inline-flex items-center gap-0.5 rounded-lg bg-ink p-0.5">
                  {(["APPROVED", "UNREVIEWED", "UNAPPROVED"] as const).map((st) => {
                    const on = asset.status === st || (st === "UNREVIEWED" && asset.status === "UNKNOWN");
                    const dot = st === "APPROVED" ? "bg-steady" : st === "UNAPPROVED" ? "bg-alarm" : "bg-signal";
                    return (
                      <form key={st} action={setAssetStatusAction}>
                        <input type="hidden" name="assetId" value={asset.id} />
                        <input type="hidden" name="status" value={st} />
                        <button
                          type="submit"
                          disabled={on}
                          className={`flex items-center gap-1.5 text-xs px-2.5 h-7 rounded-md transition-colors ${on ? "bg-panel text-ink-100 font-medium shadow-card cursor-default" : "text-ink-400 hover:text-ink-100"}`}
                        >
                          {on && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
                          {st === "APPROVED" ? "Approved" : st === "UNAPPROVED" ? "Not allowed" : "Needs review"}
                        </button>
                      </form>
                    );
                  })}
                </div>
              </div>
              <p className="text-sm text-ink-400 mt-0.5">
                {[asset.vendor ?? "Vendor unknown", cat ? CATEGORY_LABEL[cat] : asset.type.replace(/_/g, " ").toLowerCase(), sources.length ? `found via ${sources.join(", ")}` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 lg:pr-[var(--hdr-tools,8.25rem)] min-h-9">
          {manage && (
            <a href={manage} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" title="Change seats, plan or cancel on the provider's site">
              Manage plan ↗
            </a>
          )}
          <ExportMenu dataset={`passport-${asset.id}`} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
        <StatCard href="/savings" label="Could save" value={canSave >= 1 ? `${fmtEur(canSave)}/mo` : "—"} hint={canSave >= 1 ? `${fmtEur(canSave * 12)} a year` : "Nothing found"} tone={canSave >= 1 ? "accent" : undefined} />
      </div>
      <AssetLimitNotice orgId={orgId} assetId={asset.id} />

      <Tabs active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/assets/${asset.id}?tab=${t.key}` }))} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 flex flex-col gap-4">
          {tab === "overview" && (
            <>
              {market && market.verdict !== "unknown" && <MarketPriceStrip row={pickRow(market)} />}
              {vendorRisk && <VendorTermsCard risk={vendorRisk} tier={tier} detailsHref={`/assets/${asset.id}?tab=risk`} />}
              <Panel flush title="How to save" subtitle="Calculated automatically from your bills, seats and list prices">
                <div className="divide-y divide-line">
                  {mine.map((i) => (
                    <div key={i.key} className="flex items-start gap-4 px-5 py-3.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-ink-100">{i.title} <span className="ml-1 text-[11px] font-normal text-ink-400">{CONF[i.confidence]}</span></div>
                        <div className="text-sm text-ink-400 mt-0.5">{i.detail}</div>
                      </div>
                      <div className="text-sm font-semibold text-ink-100 tabular shrink-0">{fmtEur(i.monthlyEur)}/mo</div>
                      <form action={dismissSavingAction}>
                        <input type="hidden" name="key" value={i.key} />
                        <button className="btn btn-ghost btn-sm" title="Not for us — hide">Hide</button>
                      </form>
                    </div>
                  ))}
                  {mine.length === 0 && <p className="px-5 py-4 text-sm text-ink-400">Nothing to save on {asset.name} right now. angar checks again whenever new data arrives.</p>}
                </div>
              </Panel>
              <Panel title="Details">
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
                  <Field label="Provider" value={asset.vendor} />
                  <Field label="Model" value={asset.model} />
                  <Field label="Owner" value={asset.owner ? (people ? asset.owner.name ?? asset.owner.email : "Assigned") : null} empty="No owner" />
                  <Field label="EU AI Act" value={AI_ACT_TIER_LABEL[aiAct.tier]} />
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

          {tab === "people" && <AssetPeople asset={{ id: asset.id, name: asset.name }} usages={asset.usages} reminded={searchParams.reminded} error={searchParams.error} removed={searchParams.removed} />}

          {tab === "risk" && (
            <Panel title="EU AI Act" subtitle={`${aiAct.source === "manual" ? "Set by hand" : "Automatic"} · ${aiAct.role}`} action={<TierPill tier={aiAct.tier} />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-ink-100 mb-2">Why</h3>
                  <ul className="flex flex-col gap-2 text-sm text-ink-400">
                    {aiAct.reasons.map((r, i) => (
                      <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-ink-400 shrink-0" />{r}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-ink-100 mb-2">What your company must do</h3>
                  <ul className="flex flex-col gap-2 text-sm text-ink-400">
                    {aiAct.obligations.map((o, i) => (
                      <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-steady shrink-0" />{o}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Panel>
          )}
          {tab === "risk" && <VendorRiskCard asset={asset} />}
          {tab === "risk" && (
            <>
              <Panel title="Risk" subtitle="Computed by rules from what angar knows about this AI">
                {risk ? (
                  <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
                    <div className="shrink-0">
                      <RiskGauge score={risk.score} level={risk.level} />
                    </div>
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-ink-100 mb-2">Why</h3>
                        <ul className="flex flex-col gap-2 text-sm text-ink-400">
                          {((risk.reasons as string[] | null) ?? []).map((r, i) => (
                            <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-alarm shrink-0" />{r}</li>
                          ))}
                          {((risk.reasons as string[] | null) ?? []).length === 0 && <li>No risk factors found.</li>}
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
                flush
                title="Assurance checks"
                subtitle={assurance ? `${assurance.passedCount} passed · ${assurance.warningCount} need attention · ${assurance.failedCount} failed` : "Not assessed yet"}
                action={<Link href="/activity?tab=evidence" className="btn btn-secondary btn-sm">Full evidence</Link>}
              >
                {!assurance ? (
                  <p className="px-5 py-4 text-sm text-ink-400">No assurance report yet — it&apos;s generated after the next sync.</p>
                ) : (
                <div className="divide-y divide-line">
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
                )}
              </Panel>
            </>
          )}

          {tab === "activity" && (
            <Table columns={["When", "Event", "By", "Source"]} empty={asset.activities.length === 0 ? "No activity recorded yet." : false}>
              {asset.activities.map((a) => (
                <tr key={a.id}>
                  <td className={`${td} tabular text-ink-400 whitespace-nowrap`}>{fmtDateTime(a.occurredAt)}</td>
                  <td className={`${td} text-ink-100`}>{a.eventType.replace(/[._]/g, " ")}</td>
                  <td className={`${td} text-ink-400`}>{!a.actorRef ? "—" : people ? displayableRef(a.actorRef) ?? "Anonymous" : <span title="Hidden by the employee privacy mode">Hidden</span>}</td>
                  <td className={`${td} text-ink-400`}>{a.source.replace(/_/g, " ").toLowerCase()}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>

        <aside className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-5">
          <h2 className="-mx-5 -mt-5 bg-ink border-b border-line rounded-t-xl px-5 py-3 text-sm font-semibold text-ink-100 bar-head">Manage</h2>

          <NetworkBlock asset={asset} orgId={orgId} />

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

          {/* Classe AI Act: automatica, oppure scelta a mano con una nota (finisce nell'audit log). */}
          <form action={setAssetAiActOverrideAction} className="flex flex-col gap-2">
            <input type="hidden" name="assetId" value={asset.id} />
            <label className="text-sm text-ink-400" htmlFor="aiActTier">EU AI Act</label>
            <div className="flex gap-2">
              <select id="aiActTier" name="aiActTier" defaultValue={asset.aiActTier ?? ""} className={`${INPUT} flex-1 min-w-0`}>
                <option value="">Automatic{aiAct.source === "auto" ? `: ${AI_ACT_TIER_LABEL[aiAct.tier]}` : ""}</option>
                {AI_ACT_TIERS.map((t) => (
                  <option key={t} value={t}>{AI_ACT_TIER_LABEL[t]}</option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondary">Save</button>
            </div>
            <input name="aiActNote" maxLength={300} defaultValue={asset.aiActNote ?? ""} placeholder="Why (for a tier set by hand)" className={`${INPUT} w-full`} aria-label="Why" />
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

          {/* Contratto: date, preavviso, rinnovo, ordine, centro di costo (registro contratti su /savings?view=contracts). */}
          <details className="pt-5 border-t border-line group" open={searchParams.saved === "contract" || undefined}>
          <summary className="cursor-pointer list-none text-sm text-ink-400 hover:text-ink-100 select-none flex items-center justify-between gap-2">
            <span>Contract & renewal</span>
            {(() => {
              const d = asset.cost ? noticeDeadline(asset.cost) : null;
              return d ? <span className={`text-xs tabular ${daysUntil(d) <= 14 ? "text-signal" : "text-ink-400"}`}>Notice by {fmtDate(d)}</span> : null;
            })()}
          </summary>
          {searchParams.saved === "contract" && <p className="text-xs text-steady mt-3">Contract saved.</p>}
          <form action={saveContractAction} className="grid grid-cols-2 gap-2 mt-3">
            <input type="hidden" name="assetId" value={asset.id} />
            <label className="flex flex-col gap-1 text-xs text-ink-400">Start<input type="date" name="contractStart" defaultValue={asset.cost?.contractStart?.toISOString().slice(0, 10) ?? ""} className={`${INPUT} w-full`} /></label>
            <label className="flex flex-col gap-1 text-xs text-ink-400">End<input type="date" name="contractEnd" defaultValue={asset.cost?.contractEnd?.toISOString().slice(0, 10) ?? ""} className={`${INPUT} w-full`} /></label>
            <label className="flex flex-col gap-1 text-xs text-ink-400">Notice (days)<input type="number" min={0} max={730} name="noticeDays" defaultValue={asset.cost?.noticeDays ?? ""} placeholder="30" className={`${INPUT} w-full`} /></label>
            <label className="flex flex-col gap-1 text-xs text-ink-400">Auto-renews
              <select name="autoRenew" defaultValue={asset.cost?.autoRenew == null ? "" : asset.cost.autoRenew ? "yes" : "no"} className={`${INPUT} w-full`}>
                <option value="">Don&apos;t know</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-400">PO number<input name="poNumber" maxLength={80} defaultValue={asset.cost?.poNumber ?? ""} className={`${INPUT} w-full`} /></label>
            <label className="flex flex-col gap-1 text-xs text-ink-400">Cost centre<input name="costCenter" maxLength={80} defaultValue={asset.cost?.costCenter ?? ""} className={`${INPUT} w-full`} /></label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-ink-400">Contract owner<input type="email" name="contractOwnerEmail" maxLength={320} defaultValue={asset.cost?.contractOwnerEmail ?? ""} placeholder="name@company.com" className={`${INPUT} w-full`} /></label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-ink-400">Contract link<input type="url" name="contractUrl" maxLength={1000} defaultValue={asset.cost?.contractUrl ?? ""} placeholder="https://… (SharePoint, Drive)" className={`${INPUT} w-full`} /></label>
            <button type="submit" className="col-span-2 btn btn-secondary w-full">Save contract</button>
          </form>
          </details>
        </aside>
      </div>
    </div>
  );
}

const INPUT = "field";

// angar Edge: bloccare l'AI sulla rete aziendale (DNS) e suggerire l'alternativa approvata.
async function NetworkBlock({ asset, orgId }: { asset: { id: string; blockOnNetwork: boolean; insteadAssetId: string | null; status: string }; orgId: string }) {
  const [approved, blockingSensors] = await Promise.all([
    db.aiAsset.findMany({ where: { organizationId: orgId, deletedAt: null, status: "APPROVED", id: { not: asset.id } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    db.edgeSensor.count({ where: { organizationId: orgId, blockEnabled: true } }),
  ]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-400">Block on the company network <span className="text-xs">(angar Edge)</span></span>
        <form action={setNetworkBlockAction}>
          <input type="hidden" name="assetId" value={asset.id} />
          <input type="hidden" name="block" value={asset.blockOnNetwork ? "off" : "on"} />
          <button
            type="submit"
            role="switch"
            aria-checked={asset.blockOnNetwork}
            title={asset.blockOnNetwork ? "Unblock" : "Block"}
            className={`relative h-5 w-9 rounded-full transition-colors ${asset.blockOnNetwork ? "bg-alarm" : "bg-ink-400/40"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${asset.blockOnNetwork ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </form>
      </div>
      {asset.blockOnNetwork && blockingSensors === 0 && (
        <p className="text-xs text-signal">
          No sensor has blocking turned on yet — <Link href="/edge/sensors" className="underline">turn on Block</Link>.
        </p>
      )}
      {(asset.blockOnNetwork || asset.status === "UNAPPROVED" || asset.insteadAssetId) && (
        <form action={setInsteadAssetAction} className="flex gap-2">
          <input type="hidden" name="assetId" value={asset.id} />
          <select name="insteadAssetId" defaultValue={asset.insteadAssetId ?? ""} className={`${INPUT} flex-1 min-w-0`} aria-label="Suggest instead">
            <option value="">Suggest instead: nothing</option>
            {approved.map((a) => (
              <option key={a.id} value={a.id}>Suggest {a.name}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary">Save</button>
        </form>
      )}
    </div>
  );
}
const SENSITIVE = ["PII", "FINANCIAL", "SOURCE_CODE"];

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
  return plan ? `${from} · ${plan}` : `${from} · a month`;
}

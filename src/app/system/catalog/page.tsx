import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { PageHeader, Panel, Table, Tabs, td } from "@/components/ui";
import { Insight } from "@/components/insight";
import { freshnessReport, STALE_DAYS } from "@/lib/market/freshness";
import { markSourceVerifiedAction, addPriceVersionAction } from "@/lib/market-actions";
import { catalog, fmtDay, fmtMoney, providerNameOf } from "@/lib/pricing/service";

export const dynamic = "force-dynamic";

const AREA_LABEL: Record<string, string> = { pricing: "Pricing", lifecycle: "Lifecycle", capabilities: "Capabilities" };
const KINDS = ["input", "output", "cached_input", "cache_write", "cache_write_1h", "reasoning", "search", "credit", "seat_monthly", "seat_annual", "image_input", "audio_input", "audio_output", "image_output", "embedding", "tool_call", "session_hour"];
const input = "h-9 rounded-lg border border-line bg-panel px-3 text-sm text-ink-100 w-full";

// Freschezza del catalogo globale (solo admin della piattaforma): fonti da ricontrollare e nuove versioni di prezzo.
export default async function CatalogFreshnessPage({ searchParams }: { searchParams: { all?: string; error?: string; saved?: string; verified?: string } }) {
  await requirePlatformAdmin();
  const now = new Date();
  const cat = catalog();
  const codeKeys = new Set(cat.components.map((c) => [c.ruleId, c.kind, c.region, c.serviceTier, c.contextAbove, c.effectiveFrom.toISOString()].join("|")));
  const [sources, adminRows, recent] = await Promise.all([
    freshnessReport(now),
    db.aiPricingComponent.findMany({ where: { note: { startsWith: "Entered by " } }, orderBy: { detectedAt: "desc" }, take: 50 }),
    db.aiMarketChange.findMany({ orderBy: { detectedAt: "desc" }, take: 15 }),
  ]);
  const pending = adminRows.filter((c) => !codeKeys.has([c.ruleId, c.kind, c.region, c.serviceTier, c.contextAbove, c.effectiveFrom.toISOString()].join("|")));
  const stale = sources.filter((s) => s.stale);
  const shown = searchParams.all ? sources : stale;
  const ruleIds = cat.rules.map((r) => r.id).sort();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader crumbs={[{ label: "System", href: "/system" }, { label: "Catalog" }]} title="Catalog freshness" subtitle="Platform admins only." />
      {searchParams.error && <Insight tone="alarm">{searchParams.error}</Insight>}
      {searchParams.saved && <Insight tone="steady">Price version saved. Market change detected.</Insight>}
      {searchParams.verified && <Insight tone="steady">Source marked as verified today.</Insight>}

      <Table
        title="Sources to re-verify"
        note={`Pricing and lifecycle after ${STALE_DAYS.pricing} days, capabilities after ${STALE_DAYS.capabilities}`}
        action={<Tabs active={searchParams.all ? "all" : "stale"} items={[{ key: "stale", label: "Due", count: stale.length, href: "/system/catalog" }, { key: "all", label: "All", count: sources.length, href: "/system/catalog?all=1" }]} />}
        columns={["Area", "Provider", "Source", { label: "Items", className: "text-right" }, "Last verified", { label: "", className: "w-[1%]" }]}
        empty={shown.length === 0 ? "Every source is fresh." : false}
      >
        {shown.map((s) => (
          <tr key={s.id}>
            <td className={`${td} text-ink-400 whitespace-nowrap`}>{AREA_LABEL[s.area]}</td>
            <td className={`${td} text-ink-100 whitespace-nowrap`}>{s.providerId ? providerNameOf(s.providerId) : "—"}</td>
            <td className={`${td} max-w-[360px]`}>
              {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="block truncate text-ink-100 hover:underline" title={s.url}>{s.url.replace(/^https:\/\//, "")}</a> : <span className="text-alarm">No source URL</span>}
              <span className="text-xs text-ink-400">{s.sourceTypes.join(", ")}</span>
            </td>
            <td className={`${td} text-right tabular text-ink-400`}>{s.items}</td>
            <td className={`${td} whitespace-nowrap ${s.stale ? "text-signal" : "text-ink-400"}`}>
              {fmtDay(s.lastVerifiedAt)} · {s.ageDays} day{s.ageDays === 1 ? "" : "s"}
              {s.verifiedBy && <div className="text-xs text-ink-400">{s.verifiedBy}</div>}
            </td>
            <td className={`${td} whitespace-nowrap`}>
              {s.url && (
                <form action={markSourceVerifiedAction}>
                  <input type="hidden" name="area" value={s.area} />
                  <input type="hidden" name="url" value={s.url} />
                  <input type="hidden" name="providerId" value={s.providerId ?? ""} />
                  <button className="btn btn-ghost btn-sm">Verified today</button>
                </form>
              )}
            </td>
          </tr>
        ))}
      </Table>

      <Panel title="New price version" subtitle="Closes the current version, opens the new one, detects the market change">
        <form action={addPriceVersionAction} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <label className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-ink-400">Pricing rule</span>
            <input name="ruleId" list="rule-ids" required className={input} placeholder="model:openai:gpt-5.6-sol@openai-direct" />
            <datalist id="rule-ids">{ruleIds.map((id) => <option key={id} value={id} />)}</datalist>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-400">Component</span>
            <select name="kind" className={input} defaultValue="input">{KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-400">New price (catalog currency and unit)</span>
            <input name="price" required inputMode="decimal" className={input} placeholder="2.5" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-400">Region</span>
            <input name="region" defaultValue="global" className={input} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-400">Tier</span>
            <select name="serviceTier" className={input} defaultValue="standard">{["standard", "batch", "flex", "priority", "fast", "promotion"].map((k) => <option key={k} value={k}>{k}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-400">Effective from</span>
            <input name="effectiveFrom" type="date" required className={input} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-400">Announced on (optional)</span>
            <input name="announcedAt" type="date" className={input} />
          </label>
          <label className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-ink-400">Source URL</span>
            <input name="sourceUrl" type="url" required pattern="https://.*" className={input} placeholder="https://…" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-400">Source</span>
            <select name="sourceType" className={input} defaultValue="official"><option value="official">Official provider page</option><option value="secondary">Secondary source</option></select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-400">Confidence</span>
            <select name="confidence" className={input} defaultValue="HIGH"><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select>
          </label>
          <input type="hidden" name="contextAbove" value="0" />
          <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-3">
            <button className="btn btn-primary">Save version</button>
            <span className="text-xs text-ink-400">Market changes and their impact use it right away. Cost estimates use it once it is added to the catalog in code with the same date.</span>
          </div>
        </form>
      </Panel>

      <Table title="Admin versions not in the code catalog yet" note="Add them to pricing/catalog-data with the same date" columns={["Rule", "Component", { label: "Price", className: "text-right" }, "From", "Source", "Entered"]} empty={pending.length === 0 ? "None." : false}>
        {pending.map((c) => (
          <tr key={c.id}>
            <td className={`${td} font-mono text-xs text-ink-100`}>{c.ruleId}</td>
            <td className={`${td} text-ink-400`}>{[c.kind, c.region !== "global" ? c.region : null, c.serviceTier !== "standard" ? c.serviceTier : null].filter(Boolean).join(" · ")}</td>
            <td className={`${td} text-right tabular text-ink-100`}>{fmtMoney(c.price, c.currency)}{c.previousPrice != null && <span className="text-ink-400"> (was {fmtMoney(c.previousPrice, c.currency)})</span>}</td>
            <td className={`${td} tabular text-ink-400 whitespace-nowrap`}>{fmtDay(c.effectiveFrom)}</td>
            <td className={`${td} max-w-[240px]`}>{c.sourceUrl ? <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="block truncate hover:underline">{c.sourceUrl}</a> : "—"}</td>
            <td className={`${td} text-ink-400 text-xs`}>{c.note}</td>
          </tr>
        ))}
      </Table>

      <Table title="Latest market changes" action={<Link href="/market" className="text-xs text-ink-400 hover:text-ink-100">Feed →</Link>} columns={["Detected", "Type", "Change", "Effective", "Confidence"]} empty={recent.length === 0 ? "None detected yet." : false}>
        {recent.map((c) => (
          <tr key={c.id}>
            <td className={`${td} tabular text-ink-400 whitespace-nowrap`}>{fmtDay(c.detectedAt)}</td>
            <td className={`${td} text-ink-400 whitespace-nowrap`}>{c.changeType.replace(/_/g, " ")}{c.status !== "active" ? ` · ${c.status}` : ""}</td>
            <td className={`${td} text-ink-100`}>{c.summary}</td>
            <td className={`${td} tabular text-ink-400 whitespace-nowrap`}>{c.effectiveAt ? fmtDay(c.effectiveAt) : "—"}</td>
            <td className={`${td} text-ink-400`}>{c.confidence}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

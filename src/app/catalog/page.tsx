import Link from "next/link";
import { PageHeader, Panel, Table, Tabs, td } from "@/components/ui";
import FilterBar from "@/components/FilterBar";
import { VendorBadge } from "@/components/VendorIcon";
import { catalog, componentsOfRule, getPrice, priceHistory, providerNameOf, modelById, fmtMoney, fmtDay, planOf, productOf, deploymentOf, BILLING_MODEL_LABEL, SOURCE_LABEL, CATALOG_VERIFIED_AT, type PriceFact } from "@/lib/pricing/service";
import { USD_TO_EUR } from "@/lib/spend/fx";
import { DIRECT_DEPLOYMENT, type CatComponent, type CatModel } from "@/lib/pricing/catalog-data";

export const dynamic = "force-dynamic";

// Listino AI di angar (sola lettura): i prezzi che angar usa per le stime, con fonte,
// data di verifica, stato del modello e storico delle versioni. Fuori dalla barra laterale:
// ci si arriva da Savings e dal blocco Economics del passaporto.

const LIFECYCLE: Record<string, { label: string; dot: string }> = {
  active: { label: "Active", dot: "bg-steady" },
  preview: { label: "Preview", dot: "bg-signal" },
  deprecated: { label: "Deprecated", dot: "bg-signal" },
  sunset: { label: "Sunset", dot: "bg-alarm" },
  retired: { label: "Retired", dot: "bg-ink-400" },
};

const SOURCE_SHORT: Record<string, string> = { official: "Official", secondary: "Secondary", customer: "Customer", angar_estimate: "angar estimate" };

function Lifecycle({ m }: { m: CatModel }) {
  const l = LIFECYCLE[m.lifecycle] ?? LIFECYCLE.active;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`h-1.5 w-1.5 rounded-full ${l.dot}`} />
      {l.label}
      {m.retiresAt && m.lifecycle !== "retired" && <span className="text-ink-400">· {fmtDay(m.retiresAt)}</span>}
    </span>
  );
}

function Source({ f }: { f: Pick<PriceFact, "provenance"> | null }) {
  if (!f) return <span className="text-ink-400">—</span>;
  const label = SOURCE_SHORT[f.provenance.sourceType] ?? f.provenance.sourceType;
  return f.provenance.sourceUrl ? (
    <a href={f.provenance.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-ink-100 hover:underline whitespace-nowrap" title={f.provenance.note ?? undefined}>
      {label} ↗
    </a>
  ) : (
    <span title={f.provenance.note ?? undefined}>{label}</span>
  );
}

const price = (f: PriceFact | null) => (f ? fmtMoney(f.price, f.currency) : "—");

/** Piccola linea a gradini del prezzo nel tempo (solo se ci sono più versioni). */
function Spark({ versions, now }: { versions: CatComponent[]; now: number }) {
  if (versions.length < 2) return null;
  const w = 64;
  const h = 18;
  const ps = versions.map((v) => v.price);
  const max = Math.max(...ps);
  const min = Math.min(...ps);
  const y = (p: number) => (max === min ? h / 2 : h - 2 - ((p - min) / (max - min)) * (h - 4));
  const step = w / versions.length;
  const pts = versions.flatMap((v, i) => [`${i * step},${y(v.price)}`, `${(i + 1) * step},${y(v.price)}`]).join(" ");
  const future = versions.some((v) => v.effectiveFrom.getTime() > now);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-ink-400 inline-block align-middle" aria-label={`${versions.length} price versions${future ? ", one announced" : ""}`}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default async function CatalogPage({ searchParams }: { searchParams: { view?: string; provider?: string; status?: string; model?: string; q?: string } }) {
  const view = searchParams.view === "plans" ? "plans" : "models";
  const cat = catalog();
  const now = new Date();
  const q = (searchParams.q ?? "").trim().toLowerCase();

  const models = cat.models
    .filter((m) => m.providerId !== "angar")
    .filter((m) => !searchParams.provider || m.providerId === searchParams.provider)
    .filter((m) => !searchParams.status || m.lifecycle === searchParams.status)
    .filter((m) => !q || `${m.name} ${m.apiId} ${m.family}`.toLowerCase().includes(q));
  const providers = Array.from(new Set(cat.models.filter((m) => m.providerId !== "angar").map((m) => m.providerId)));
  const seatRows = cat.seatTypes
    .map((st) => {
      const plan = planOf(st);
      const product = productOf(plan);
      return {
        st,
        plan,
        product,
        monthly: getPrice(st.id, null, null, "seat_monthly", now),
        annual: getPrice(st.id, null, null, "seat_annual", now),
        promo: getPrice(st.id, null, null, "seat_annual", now, { serviceTier: "promotion" }),
      };
    })
    .filter((r) => !searchParams.provider || r.product.providerId === searchParams.provider)
    .filter((r) => !q || `${r.product.name} ${r.plan.name} ${r.st.name}`.toLowerCase().includes(q));
  const official = cat.components.filter((c) => c.sourceType === "official").length;
  const selected = searchParams.model ? modelById(searchParams.model) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        crumbs={[{ label: "Savings", href: "/savings" }, { label: "AI price list" }]}
        title="AI price list"
        subtitle={`The list prices angar uses for estimates, with their source and when they were last checked (latest check ${fmtDay(CATALOG_VERIFIED_AT)}).`}
      />

      <Tabs
        active={view}
        items={[
          { key: "models", label: "Models", href: "/catalog", count: cat.models.filter((m) => m.providerId !== "angar").length },
          { key: "plans", label: "Seat plans", href: "/catalog?view=plans", count: cat.seatTypes.length },
        ]}
      />

      <FilterBar
        search={{ placeholder: view === "models" ? "Search models" : "Search plans" }}
        filters={[
          { param: "provider", label: "Provider", options: (view === "models" ? providers : Array.from(new Set(cat.products.filter((p) => p.kind !== "api").map((p) => p.providerId)))).map((p) => ({ value: p, label: providerNameOf(p) })) },
          ...(view === "models" ? [{ param: "status", label: "Status", options: Object.entries(LIFECYCLE).map(([value, l]) => ({ value, label: l.label })) }] : []),
        ]}
        right={`${official} of ${cat.components.length} prices verified on official pages`}
      />

      {view === "models" && selected && <ModelHistory m={selected} now={now} />}

      {view === "models" && (
        <Table
          columns={["Model", "Status", { label: "Input / 1M tokens", className: "text-right" }, { label: "Cached input / 1M tokens", className: "text-right" }, { label: "Output / 1M tokens", className: "text-right" }, { label: "Context", className: "text-right" }, "Source", "Verified", "History"]}
          empty={models.length === 0 ? "No models match these filters." : false}
          footer={<span className="text-xs text-ink-400">Direct API, standard tier, global region. Prices in the provider&apos;s currency; estimates convert USD to EUR at {USD_TO_EUR}. Select a model for every tier, region and version.</span>}
        >
          {models.map((m) => {
            const i = getPrice(m.id, null, null, "input", now);
            const c = getPrice(m.id, null, null, "cached_input", now);
            const o = getPrice(m.id, null, null, "output", now);
            const direct = `model:${m.id}@${DIRECT_DEPLOYMENT[m.providerId]}`;
            const versions = priceHistory(direct, "input");
            const outVersions = priceHistory(direct, "output");
            const hist = versions.length > 1 ? versions : outVersions;
            return (
              <tr key={m.id}>
                <td className={`${td} min-w-[200px]`}>
                  <Link href={`/catalog?model=${encodeURIComponent(m.id)}`} className="flex items-center gap-3 group" scroll={false}>
                    <VendorBadge vendor={providerNameOf(m.providerId)} name={m.name} size={28} />
                    <span className="min-w-0">
                      <span className="block text-ink-100 font-medium group-hover:underline">{m.name}</span>
                      <span className="block text-xs text-ink-400 truncate">{m.apiId}</span>
                    </span>
                  </Link>
                </td>
                <td className={`${td} text-ink-100`}>
                  <Lifecycle m={m} />
                </td>
                <td className={`${td} text-right tabular text-ink-100`}>{price(i)}</td>
                <td className={`${td} text-right tabular text-ink-400`}>{price(c)}</td>
                <td className={`${td} text-right tabular text-ink-100`}>{price(o)}</td>
                <td className={`${td} text-right tabular text-ink-400`}>{m.contextWindow ? `${Math.round(m.contextWindow / 1000).toLocaleString("en-GB")}K` : "—"}</td>
                <td className={`${td} text-ink-400`}>
                  <Source f={i} />
                </td>
                <td className={`${td} text-ink-400 whitespace-nowrap tabular`}>{i ? fmtDay(i.provenance.lastVerifiedAt) : "—"}</td>
                <td className={td}>
                  <Spark versions={hist} now={now.getTime()} />
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      {view === "plans" && (
        <Table
          columns={["Plan", "Seat type", "Billing", { label: "Billed monthly", className: "text-right" }, { label: "Billed yearly, a month", className: "text-right" }, "Source", "Verified"]}
          empty={seatRows.length === 0 ? "No plans match these filters." : false}
          footer={<span className="text-xs text-ink-400">Seat prices a month, before tax, in the provider&apos;s currency. Custom plans have no list price.</span>}
        >
          {seatRows.map((r) => {
            const f = r.monthly ?? r.annual;
            return (
              <tr key={r.st.id}>
                <td className={`${td} min-w-[220px]`}>
                  <span className="flex items-center gap-3">
                    <VendorBadge vendor={providerNameOf(r.product.providerId)} name={r.product.name} size={28} />
                    <span className="min-w-0">
                      <span className="block text-ink-100 font-medium">{r.plan.name}</span>
                      <span className="block text-xs text-ink-400 truncate">{r.plan.notes ?? providerNameOf(r.product.providerId)}</span>
                    </span>
                  </span>
                </td>
                <td className={`${td} text-ink-100`}>{r.st.name}</td>
                <td className={`${td} text-ink-400`}>{BILLING_MODEL_LABEL[r.plan.billingModel]}</td>
                <td className={`${td} text-right tabular text-ink-100`}>{r.monthly ? fmtMoney(r.monthly.price, r.monthly.currency) : r.plan.billingModel === "CUSTOM" ? <span className="text-ink-400">Custom</span> : "—"}</td>
                <td className={`${td} text-right tabular text-ink-100`}>
                  {r.annual ? fmtMoney(r.annual.price, r.annual.currency) : "—"}
                  {r.promo && <span className="block text-xs text-ink-400">Promotion {fmtMoney(r.promo.price, r.promo.currency)} until {fmtDay(new Date(r.promo.effectiveUntil!.getTime() - 86_400_000))}</span>}
                </td>
                <td className={`${td} text-ink-400`}>
                  <Source f={f} />
                </td>
                <td className={`${td} text-ink-400 whitespace-nowrap tabular`}>{f ? fmtDay(f.provenance.lastVerifiedAt) : "—"}</td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  input: "Input",
  cached_input: "Cached input",
  cache_write: "Cache write (5 min)",
  cache_write_1h: "Cache write (1 hour)",
  output: "Output",
  reasoning: "Reasoning",
  audio_input: "Audio input",
  image_input: "Image input",
  search: "Web search",
};
const TIER_ORDER = ["standard", "batch", "flex", "priority", "fast", "promotion"];
const UNIT_LABEL: Record<string, string> = { "1M_tokens": "1M tokens", "1K_requests": "1K searches", seat_month: "seat a month", image: "image", hour: "hour", credit: "credit" };

// Tutte le voci di prezzo di un modello: deployment, livello, regione, contesto e versioni (passate e annunciate).
function ModelHistory({ m, now }: { m: CatModel; now: Date }) {
  const rules = catalog().rules.filter((r) => r.modelId === m.id);
  const rows = rules.flatMap((r) => componentsOfRule(r.id).map((c) => ({ r, c })));
  const depRank = (id: string | null) => (id && id.endsWith("-direct") ? 0 : 1);
  const tierRank = (t: string) => TIER_ORDER.indexOf(t) + 1 || 99;
  const kindRank = (k: string) => Object.keys(KIND_LABEL).indexOf(k) + 1 || 99;
  rows.sort((a, b) => depRank(a.r.deploymentId) - depRank(b.r.deploymentId) || (a.r.deploymentId ?? "").localeCompare(b.r.deploymentId ?? "") || tierRank(a.c.serviceTier) - tierRank(b.c.serviceTier) || a.c.region.localeCompare(b.c.region) || a.c.contextAbove - b.c.contextAbove || kindRank(a.c.kind) - kindRank(b.c.kind) || a.c.effectiveFrom.getTime() - b.c.effectiveFrom.getTime());
  const status = (c: CatComponent) => (c.effectiveFrom > now ? "Announced" : c.effectiveUntil && c.effectiveUntil <= now ? "Past" : "Current");
  return (
    <Panel
      flush
      title={`${m.name} · every price`}
      subtitle={`${providerNameOf(m.providerId)} · ${m.apiId}${m.releasedAt ? ` · released ${fmtDay(m.releasedAt)}` : ""}`}
      action={<Link href="/catalog" className="btn btn-ghost btn-sm" scroll={false}>Close</Link>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bar-thead text-left text-xs text-ink-400 bg-ink border-b border-line">
              {["Where", "Tier", "Region", "Item", "Price", "Valid", "Was", "Source"].map((h) => (
                <th key={h} className="px-5 py-2.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ r, c }) => (
              <tr key={c.key} className={status(c) === "Past" ? "text-ink-400" : "text-ink-100"}>
                <td className={`${td} whitespace-nowrap`}>{deploymentOf(r.deploymentId ?? "")?.name ?? "—"}</td>
                <td className={`${td} capitalize`}>{c.serviceTier}</td>
                <td className={`${td} uppercase text-xs`}>{c.region}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {KIND_LABEL[c.kind] ?? c.kind}
                  {c.contextAbove > 0 && <span className="text-ink-400"> · prompts over {Math.round(c.contextAbove / 1000)}K</span>}
                </td>
                <td className={`${td} tabular whitespace-nowrap`}>
                  {fmtMoney(c.price, c.currency)} <span className="text-ink-400">/ {UNIT_LABEL[c.unit] ?? c.unit}</span>
                </td>
                <td className={`${td} whitespace-nowrap text-ink-400 tabular`}>
                  {status(c)} · {fmtDay(c.effectiveFrom)}
                  {c.effectiveUntil ? ` to ${fmtDay(new Date(c.effectiveUntil.getTime() - 86_400_000))}` : ""}
                </td>
                <td className={`${td} tabular text-ink-400`}>{c.previousPrice != null ? fmtMoney(c.previousPrice, c.currency) : "—"}</td>
                <td className={`${td} text-ink-400 whitespace-nowrap`}>
                  {c.sourceUrl ? (
                    <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-ink-100 hover:underline" title={c.note ?? undefined}>
                      {SOURCE_LABEL[c.sourceType]} ↗
                    </a>
                  ) : (
                    <span title={c.note ?? undefined}>{SOURCE_LABEL[c.sourceType]}</span>
                  )}
                  <span className="block text-xs">verified {fmtDay(c.lastVerifiedAt)} · {c.confidence.toLowerCase()} confidence</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

import Link from "next/link";
import { Panel } from "@/components/ui";
import { fmtDate, fmtEur } from "@/lib/format";
import type { Economics } from "@/lib/pricing/economics";
import { tokenPriceText } from "@/lib/pricing/economics";
import { fmtDay, fmtMoney } from "@/lib/pricing/service";
import { discountText } from "@/lib/pricing/discount";

// Blocco Economics del passaporto: reale (con fonte) vs stimato (con base), scarto,
// posti per tipo, costo unitario, rinnovo, confidenza e provenienza dei prezzi.
// Quello che non si sa è UNKNOWN: mai un numero inventato.

export function EstimatedTag() {
  return <span className="ml-1.5 inline-block align-middle rounded border border-line px-1.5 py-px text-[10px] font-mono uppercase tracking-wide text-ink-400">Estimated</span>;
}

function Unknown() {
  return <span className="text-ink-400 font-medium tracking-wide">UNKNOWN</span>;
}

function Item({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className="text-sm mt-1 text-ink-100 break-words">{children}</dd>
      {hint && <dd className="text-xs text-ink-400 mt-0.5 break-words">{hint}</dd>}
    </div>
  );
}

const money = (eur: number) => `${fmtEur(eur)} a month`;

function None() {
  return <span className="text-ink-400">None</span>;
}

export default function EconomicsBlock({ e, assetId, canEdit = false }: { e: Economics; assetId: string; canEdit?: boolean }) {
  const { actual, estimated, variance } = e.ave;
  // Voce che il modello di fatturazione esclude: "None", non UNKNOWN.
  const noSeats = e.billingModel === "TOKEN_BASED" || e.billingModel === "USAGE_BASED";
  const noUsage = e.billingModel === "SEAT_BASED";
  const m = e.manual;
  const cur = (n: number) => fmtMoney(Math.round(n * 100) / 100, m?.currency ?? "EUR");
  const PERIOD: Record<string, string> = { month: "a month", quarter: "a quarter", year: "a year" };
  const pct = variance ? `${variance.pct >= 0 ? "+" : "−"}${Math.abs(variance.pct * 100).toFixed(1)}%` : null;
  return (
    <Panel
      title="Economics"
      subtitle={e.billingModelLabel ?? undefined}
      action={
        canEdit ? (
          <Link href={`/assets/${assetId}/subscription`} className="btn btn-secondary btn-sm">
            {m ? "Edit subscription" : "Add subscription"}
          </Link>
        ) : undefined
      }
    >
      {/* Reale, stimato, scarto: i tre numeri da non confondere mai. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pb-5 border-b border-line">
        <div className="min-w-0">
          <div className="text-sm font-bold text-ink-100">Actual</div>
          <div className="font-display text-2xl font-light tracking-[-0.03em] tabular text-ink-100 mt-1">{actual ? money(actual.eur) : <Unknown />}</div>
          <div className="text-xs text-ink-400 mt-1 truncate">{actual ? actual.source : "No bill linked"}</div>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-ink-100 flex items-center">Estimated<EstimatedTag /></div>
          <div className="font-display text-2xl font-light tracking-[-0.03em] tabular text-ink-100 mt-1">{estimated && estimated.eur > 0 ? money(estimated.eur) : <Unknown />}</div>
          <div className="text-xs text-ink-400 mt-1 truncate" title={estimated?.basis}>{estimated ? estimated.basis : "Nothing to price"}</div>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-ink-100">Variance</div>
          <div className="font-display text-2xl font-light tracking-[-0.03em] tabular text-ink-100 mt-1">{variance ? pct : <Unknown />}</div>
          {variance && <div className="text-xs text-ink-400 mt-1 tabular">{`${variance.eur >= 0 ? "+" : "−"}${fmtEur(Math.abs(variance.eur))} vs estimate`}</div>}
        </div>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5 pt-5">
        <Item label="Plan" hint={e.cycle ? (e.cycle === "annual" ? "Billed yearly" : e.cycle === "monthly" ? "Billed monthly" : "Billed on usage") : undefined}>
          {e.planName ?? <Unknown />}
        </Item>
        <Item label="Subscription" hint={e.subscriptionCost?.note}>
          {e.subscriptionCost ? (
            <span className="tabular">
              {money(e.subscriptionCost.eur)}
              {e.subscriptionCost.estimated && <EstimatedTag />}
            </span>
          ) : noSeats ? (
            <None />
          ) : (
            <Unknown />
          )}
        </Item>
        <Item label="Usage" hint={e.usageCost?.note}>
          {e.usageCost ? (
            <span className="tabular">
              {money(e.usageCost.eur)}
              {e.usageCost.estimated && <EstimatedTag />}
            </span>
          ) : noUsage ? (
            <None />
          ) : (
            <Unknown />
          )}
        </Item>
        <Item label="Unit cost" hint={e.contractMonthly != null && !m ? `Contract price ${money(e.contractMonthly)}` : undefined}>
          {e.unitCost ? (
            <span className="tabular">
              {fmtEur(e.unitCost.eur, { decimals: true })} a {e.unitCost.unit} a month
              {e.unitCost.estimated && <EstimatedTag />}
            </span>
          ) : (
            <Unknown />
          )}
        </Item>
        <Item label="Renewal" hint={e.renewal?.inferred ? "From the last charge" : e.renewal ? "From the contract" : undefined}>
          {e.renewal ? fmtDate(e.renewal.date) : <Link href={`/assets/${assetId}?edit=contract#contract`} className="text-ink-400 hover:text-ink-100 underline">Add contract</Link>}
        </Item>
        {m && (
          <Item label="Contract price" hint={m.contractMonthly != null ? (m.discountPct != null ? discountText(m.discountPct) : "Discount UNKNOWN · no list price to compare") : undefined}>
            {m.contractMonthly != null ? <span className="tabular">{cur(m.contractMonthly)} a month</span> : <Unknown />}
          </Item>
        )}
        {m && (
          <Item label="Billed" hint={m.billed && m.billed.period !== "month" ? `${cur(m.billed.amount)} ${PERIOD[m.billed.period] ?? ""}` : undefined}>
            {m.billed ? <span className="tabular">{cur(m.billed.period === "year" ? m.billed.amount / 12 : m.billed.period === "quarter" ? m.billed.amount / 3 : m.billed.amount)} a month</span> : <Unknown />}
          </Item>
        )}
        {/* Righe di posti: pagati / attivi, listino del catalogo con provenienza, contratto e sconto. */}
        <div className="col-span-2 sm:col-span-4 min-w-0">
          <dt className="text-xs text-ink-400">Seats (paid / active)</dt>
          {e.seatLines.length ? (
            e.seatLines.map((l, i) => (
              <dd key={i} className="mt-1.5 min-w-0">
                <span className="text-sm text-ink-100 tabular">
                  {l.paid} / {l.active ?? "?"} <span className="text-ink-400">{l.label}</span>
                  {l.contractUnit != null && m && <span className="text-ink-100"> · contract {cur(l.contractUnit)} a month each</span>}
                </span>
                <span className="block text-xs text-ink-400 break-words">
                  {l.list ? (
                    l.list.url ? (
                      <a href={l.list.url} target="_blank" rel="noopener noreferrer" className="hover:text-ink-100 hover:underline">
                        {l.list.text} ↗
                      </a>
                    ) : (
                      l.list.text
                    )
                  ) : (
                    "List price UNKNOWN"
                  )}
                  {l.contractUnit != null && ` · ${l.discountPct != null ? discountText(l.discountPct) : "Discount UNKNOWN"}`}
                </span>
              </dd>
            ))
          ) : (
            <dd className="text-sm mt-1">
              <Unknown />
            </dd>
          )}
          {e.seatLines.length > 1 && e.seatLines.some((l) => l.active == null) && e.observedActive != null && (
            <dd className="text-xs text-ink-400 mt-1.5">{e.observedActive} active in total</dd>
          )}
        </div>
        {m?.note && (
          <div className="col-span-2 sm:col-span-4 min-w-0">
            <dt className="text-xs text-ink-400">Note</dt>
            <dd className="text-sm mt-1 text-ink-100 break-words whitespace-pre-line">{m.note}</dd>
          </div>
        )}
        {e.modelPrice && (
          <div className="col-span-2 sm:col-span-4 min-w-0">
            <dt className="text-xs text-ink-400">Model list price</dt>
            <dd className="text-sm mt-1 text-ink-100 tabular">
              {e.modelPrice.name} · {tokenPriceText("Input", e.modelPrice.input)} · {tokenPriceText("Output", e.modelPrice.output)}
            </dd>
            {e.modelPrice.lifecycle !== "active" && (
              <dd className="text-xs text-signal mt-0.5">
                {e.modelPrice.lifecycle === "deprecated" ? "Deprecated" : e.modelPrice.lifecycle === "retired" ? "Retired" : e.modelPrice.lifecycle === "preview" ? "Preview" : "Sunset"}
                {e.modelPrice.retiresAt ? ` · retires ${fmtDay(e.modelPrice.retiresAt)}` : ""}
              </dd>
            )}
          </div>
        )}
      </dl>

      {e.provenance.length > 0 && (
        <details className="mt-5 pt-4 border-t border-line text-xs text-ink-400">
          <summary className="cursor-pointer list-none hover:text-ink-100 select-none w-fit">Price sources</summary>
          <div className="mt-2 flex flex-col gap-1">
          {e.provenance.map((p) => (
            <span key={p.line}>
              {p.url ? (
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:text-ink-100 hover:underline">
                  {p.line} ↗
                </a>
              ) : (
                p.line
              )}
            </span>
          ))}
          <Link href="/catalog" className="hover:text-ink-100 hover:underline w-fit">AI price list →</Link>
          </div>
        </details>
      )}
    </Panel>
  );
}

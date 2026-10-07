import Link from "next/link";
import { Panel } from "@/components/ui";
import { fmtDate, fmtEur } from "@/lib/format";
import type { Economics } from "@/lib/pricing/economics";
import { tokenPriceText } from "@/lib/pricing/economics";
import { fmtDay } from "@/lib/pricing/service";

// Blocco Economics del passaporto: reale (con fonte) vs stimato (con base), scarto,
// posti per tipo, costo unitario, rinnovo, confidenza e provenienza dei prezzi.
// Quello che non si sa è UNKNOWN: mai un numero inventato.

const CONF_LABEL: Record<string, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

export function EstimatedTag() {
  return <span className="ml-1.5 inline-block align-middle rounded border border-line px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-ink-400">Estimated</span>;
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

export default function EconomicsBlock({ e, assetId }: { e: Economics; assetId: string }) {
  const { actual, estimated, variance } = e.ave;
  // Voce che il modello di fatturazione esclude: "None", non UNKNOWN.
  const noSeats = e.billingModel === "TOKEN_BASED" || e.billingModel === "USAGE_BASED";
  const noUsage = e.billingModel === "SEAT_BASED";
  const pct = variance ? `${variance.pct >= 0 ? "+" : "−"}${Math.abs(variance.pct * 100).toFixed(1)}%` : null;
  return (
    <Panel title="Economics" subtitle={e.billingModelLabel ? `Billing: ${e.billingModelLabel}` : "Billing model unknown"}>
      {/* Reale, stimato, scarto: i tre numeri da non confondere mai. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pb-5 border-b border-line">
        <div className="min-w-0">
          <div className="text-sm font-bold text-ink-100">Actual</div>
          <div className="font-display text-2xl font-semibold tracking-tight tabular text-ink-100 mt-1">{actual ? money(actual.eur) : <Unknown />}</div>
          <div className="text-xs text-ink-400 mt-1">{actual ? `Source: ${actual.source}` : "No bill or invoice linked yet"}</div>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-ink-100 flex items-center">Estimated<EstimatedTag /></div>
          <div className="font-display text-2xl font-semibold tracking-tight tabular text-ink-100 mt-1">{estimated && estimated.eur > 0 ? money(estimated.eur) : <Unknown />}</div>
          <div className="text-xs text-ink-400 mt-1 break-words">{estimated ? estimated.basis : "No seats, plan or usage to price"}</div>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-ink-100">Variance</div>
          <div className="font-display text-2xl font-semibold tracking-tight tabular text-ink-100 mt-1">{variance ? pct : <Unknown />}</div>
          <div className="text-xs text-ink-400 mt-1">{variance ? `${variance.eur >= 0 ? "+" : "−"}${fmtEur(Math.abs(variance.eur))} actual vs estimated` : "Needs both an actual and an estimated cost"}</div>
        </div>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5 pt-5">
        <Item label="Billing model">{e.billingModelLabel ?? <Unknown />}</Item>
        <Item label="Plan" hint={e.cycle ? (e.cycle === "annual" ? "Billed yearly" : e.cycle === "monthly" ? "Billed monthly" : "Billed on usage") : undefined}>
          {e.planName ?? <Unknown />}
        </Item>
        <Item label="Seats (paid / active)">
          {e.seatLines.length ? (
            <span className="flex flex-col gap-0.5">
              {e.seatLines.map((l, i) => (
                <span key={i} className="tabular">
                  {l.paid} / {l.active ?? "?"} <span className="text-ink-400">{l.label}</span>
                </span>
              ))}
            </span>
          ) : (
            <Unknown />
          )}
        </Item>
        <Item label="Cost confidence">{e.confidence ? CONF_LABEL[e.confidence] : <Unknown />}</Item>
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
        <Item label="Effective unit cost" hint={e.contractMonthly != null ? `Contract price ${money(e.contractMonthly)}` : undefined}>
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
          {e.renewal ? fmtDate(e.renewal.date) : <Link href={`/assets/${assetId}?edit=contract#contract`} className="text-ink-400 hover:text-ink-100 underline">UNKNOWN · add the contract</Link>}
        </Item>
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
        <div className="mt-5 pt-4 border-t border-line flex flex-col gap-1 text-xs text-ink-400">
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
      )}
    </Panel>
  );
}

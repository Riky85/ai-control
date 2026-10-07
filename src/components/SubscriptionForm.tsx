"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveManualSubscriptionAction, deleteManualSubscriptionAction } from "@/lib/subscription-actions";
import type { CatalogProductOption, ManualSubscriptionPayload, SeatListPrice } from "@/lib/pricing/manual";
import { discountPct, discountText, toMonthly } from "@/lib/pricing/discount";

// Editor di un abbonamento inserito a mano: prodotto e piano dal catalogo (o "Other"),
// una riga per tipo di posto, ciclo, date, prezzo di contratto (per riga o totale),
// importo fatturato, valuta e nota. Accanto a ogni riga: il listino del catalogo e lo sconto.

const OTHER = "other";

interface LineState {
  key: number;
  seatTypeId: string;
  label: string;
  paid: string;
  active: string;
  contractUnit: string;
}

const num = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

function money(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2, minimumFractionDigits: Math.abs(n % 1) > 0.001 ? 2 : 0 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

const Label = ({ text, children, className = "" }: { text: string; children: React.ReactNode; className?: string }) => (
  <label className={`flex flex-col gap-1 text-xs text-ink-400 min-w-0 ${className}`}>
    {text}
    {children}
  </label>
);

export default function SubscriptionForm({
  assetId,
  options,
  currencies,
  eurPerUnit,
  initial,
  editing,
  observedActive,
}: {
  assetId: string;
  options: CatalogProductOption[];
  currencies: readonly string[];
  /** EUR per 1 unità di ogni valuta (stessa tabella di spend/fx.ts). */
  eurPerUnit: Record<string, number>;
  initial: ManualSubscriptionPayload;
  editing: boolean;
  observedActive: number | null;
}) {
  const [productId, setProductId] = useState(initial.productId ?? (initial.productName ? OTHER : ""));
  const [planId, setPlanId] = useState(initial.planId ?? "");
  const [productName, setProductName] = useState(initial.productName ?? "");
  const [planName, setPlanName] = useState(initial.planName ?? "");
  const [cycle, setCycle] = useState<"monthly" | "annual">(initial.cycle);
  const [contractStart, setContractStart] = useState(initial.contractStart ?? "");
  const [renewalDate, setRenewalDate] = useState(initial.renewalDate ?? "");
  const [currency, setCurrency] = useState(initial.currency);
  const [contractPeriod, setContractPeriod] = useState<"month" | "year">(initial.contractPeriod);
  const [priceMode, setPriceMode] = useState<"none" | "lines" | "total">(initial.priceMode);
  const [contractTotal, setContractTotal] = useState(initial.contractTotal != null ? String(initial.contractTotal) : "");
  const [billedAmount, setBilledAmount] = useState(initial.billedAmount != null ? String(initial.billedAmount) : "");
  const [billedPeriod, setBilledPeriod] = useState<"month" | "quarter" | "year">(initial.billedPeriod);
  const [note, setNote] = useState(initial.note ?? "");
  const [nextKey, setNextKey] = useState(initial.lines.length + 1);
  const [lines, setLines] = useState<LineState[]>(
    initial.lines.map((l, i) => ({
      key: i + 1,
      seatTypeId: l.seatTypeId ?? "",
      label: l.label ?? "",
      paid: String(l.paidSeats),
      active: l.activeSeats != null ? String(l.activeSeats) : "",
      contractUnit: l.contractUnit != null ? String(l.contractUnit) : "",
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const product = options.find((p) => p.id === productId) ?? null;
  const plan = product?.plans.find((p) => p.id === planId) ?? null;
  const seatOptions = plan?.seatTypes ?? [];
  const isOther = productId === OTHER;

  const blankLine = (key: number, seatTypeId = ""): LineState => ({ key, seatTypeId, label: "", paid: "", active: "", contractUnit: "" });

  function pickProduct(id: string) {
    setProductId(id);
    const p = options.find((x) => x.id === id);
    const pl = p?.plans.find((x) => !x.retired) ?? p?.plans[0] ?? null;
    pickPlan(pl?.id ?? "", p ?? null);
  }
  function pickPlan(id: string, p: CatalogProductOption | null = product) {
    setPlanId(id);
    const pl = p?.plans.find((x) => x.id === id);
    const def = pl?.seatTypes[0]?.id ?? "";
    // Le righe esistenti restano (posti e prezzi), col tipo di posto del nuovo piano se c'è.
    setLines((ls) => (ls.length ? ls.map((l, i) => ({ ...l, seatTypeId: pl?.seatTypes[i]?.id ?? def })) : [blankLine(nextKey, def)]));
    setNextKey((k) => k + 1);
  }
  function addLine() {
    const used = new Set(lines.map((l) => l.seatTypeId));
    const free = seatOptions.find((s) => !used.has(s.id))?.id ?? "";
    setLines((ls) => [...ls, blankLine(nextKey, free)]);
    setNextKey((k) => k + 1);
  }
  const setLine = (key: number, patch: Partial<LineState>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key));

  const rate = eurPerUnit[currency] ?? null;
  const listOf = (seatTypeId: string): SeatListPrice | null => {
    const st = seatOptions.find((s) => s.id === seatTypeId);
    return st ? (cycle === "annual" ? st.annual : st.monthly) : null;
  };
  // Listino di un posto al mese nella valuta scelta (null = non noto o valuta non convertibile).
  const listInCurrency = (l: SeatListPrice | null) => (l && rate ? l.eur / rate : null);

  // Riepilogo ricalcolato a ogni render (poche righe: non serve memorizzarlo).
  const summary = (() => {
    const rows = lines.map((l) => {
      const list = isOther ? null : listOf(l.seatTypeId);
      const paid = num(l.paid);
      const unit = priceMode === "lines" ? num(l.contractUnit) : null;
      const unitMonthly = unit != null && !Number.isNaN(unit) ? toMonthly(unit, contractPeriod) : null;
      return { list, listCur: listInCurrency(list), paid: paid != null && !Number.isNaN(paid) ? paid : null, unitMonthly };
    });
    const listMonthly = rows.length && rows.every((r) => r.listCur != null && r.paid != null) ? rows.reduce((t, r) => t + r.listCur! * r.paid!, 0) : null;
    const total = priceMode === "total" ? num(contractTotal) : null;
    const contractMonthly =
      priceMode === "total"
        ? total != null && !Number.isNaN(total)
          ? toMonthly(total, contractPeriod)
          : null
        : priceMode === "lines" && rows.length && rows.every((r) => r.unitMonthly != null && r.paid != null)
          ? rows.reduce((t, r) => t + r.unitMonthly! * r.paid!, 0)
          : null;
    return { rows, listMonthly, contractMonthly, discount: discountPct(listMonthly, contractMonthly) };
  })();

  function payload(): ManualSubscriptionPayload {
    const n = (s: string) => {
      const v = num(s);
      return v == null || Number.isNaN(v) ? null : v;
    };
    return {
      assetId,
      productId: isOther || !productId ? null : productId,
      planId: isOther || !planId ? null : planId,
      productName: isOther ? productName : null,
      planName: isOther ? planName : null,
      cycle,
      contractStart: contractStart || null,
      renewalDate: renewalDate || null,
      currency,
      contractPeriod,
      priceMode,
      contractTotal: priceMode === "total" ? n(contractTotal) : null,
      billedAmount: n(billedAmount),
      billedPeriod,
      note: note || null,
      lines: lines.map((l) => ({
        seatTypeId: isOther ? null : l.seatTypeId || null,
        label: isOther ? l.label : null,
        paidSeats: Number(l.paid),
        activeSeats: l.active.trim() === "" ? null : Number(l.active),
        contractUnit: priceMode === "lines" ? n(l.contractUnit) : null,
      })),
    };
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!productId) return setError("Pick a product, or Other.");
    start(async () => {
      const res = await saveManualSubscriptionAction(payload());
      if (res?.error) setError(res.error);
    });
  }

  function remove() {
    if (!window.confirm("Delete this subscription? angar goes back to the one it works out from bills and seats.")) return;
    setError(null);
    start(async () => {
      const res = await deleteManualSubscriptionAction(assetId);
      if (res?.error) setError(res.error);
    });
  }

  const periodText = contractPeriod === "year" ? "a year" : "a month";

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      {/* Prodotto e piano */}
      <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
        <h2 className="text-sm font-bold text-ink-100">Product and plan</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Label text="Product">
            <select value={productId} onChange={(e) => pickProduct(e.target.value)} className="field w-full" required>
              <option value="">Pick a product…</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.provider} · {p.name}
                </option>
              ))}
              <option value={OTHER}>Other (not in the price list)</option>
            </select>
          </Label>
          {isOther ? (
            <Label text="Product name">
              <input value={productName} onChange={(e) => setProductName(e.target.value)} maxLength={120} required placeholder="e.g. Acme Writer" className="field w-full" />
            </Label>
          ) : (
            <Label text="Plan">
              <select value={planId} onChange={(e) => pickPlan(e.target.value)} className="field w-full" disabled={!product}>
                {!product && <option value="">Pick a product first</option>}
                {product?.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.retired ? " (retired)" : ""}
                  </option>
                ))}
              </select>
            </Label>
          )}
          {isOther && (
            <Label text="Plan name (optional)">
              <input value={planName} onChange={(e) => setPlanName(e.target.value)} maxLength={120} placeholder="e.g. Business" className="field w-full" />
            </Label>
          )}
        </div>
      </section>

      {/* Righe di posti */}
      <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-ink-100">Seats</h2>
          <span className="text-xs text-ink-400">
            Leave active seats empty to use what angar sees{observedActive != null ? ` (${observedActive} active in the last 30 days)` : ""}.
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Label text="Billing cycle">
            <select value={cycle} onChange={(e) => setCycle(e.target.value === "annual" ? "annual" : "monthly")} className="field w-full">
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </Label>
          <Label text="Contract price">
            <select value={priceMode} onChange={(e) => setPriceMode(e.target.value as "none" | "lines" | "total")} className="field w-full">
              <option value="none">Not known</option>
              <option value="lines">For each seat type</option>
              <option value="total">Total</option>
            </select>
          </Label>
          <Label text="Currency">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="field w-full">
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Label>
        </div>

        <div className="flex flex-col divide-y divide-line border-t border-line">
          {lines.map((l, i) => {
            const r = summary.rows[i];
            const d = discountPct(r?.listCur ?? null, r?.unitMonthly ?? null);
            return (
              <div key={l.key} className="pt-4 pb-4 last:pb-0 flex flex-col gap-2">
                <div className="grid grid-cols-2 sm:grid-cols-12 gap-3 items-end">
                  {isOther ? (
                    <Label text="Seat type" className="col-span-2 sm:col-span-4">
                      <input value={l.label} onChange={(e) => setLine(l.key, { label: e.target.value })} maxLength={80} required placeholder="e.g. Standard" className="field w-full" />
                    </Label>
                  ) : (
                    <Label text="Seat type" className="col-span-2 sm:col-span-4">
                      <select value={l.seatTypeId} onChange={(e) => setLine(l.key, { seatTypeId: e.target.value })} className="field w-full" disabled={!plan} required>
                        {!plan && <option value="">Pick a plan first</option>}
                        {seatOptions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </Label>
                  )}
                  <Label text="Paid seats" className="sm:col-span-2">
                    <input type="number" min={1} step={1} inputMode="numeric" value={l.paid} onChange={(e) => setLine(l.key, { paid: e.target.value })} required className="field w-full tabular" />
                  </Label>
                  <Label text="Active seats" className="sm:col-span-2">
                    <input type="number" min={0} step={1} inputMode="numeric" value={l.active} onChange={(e) => setLine(l.key, { active: e.target.value })} placeholder="From usage" className="field w-full tabular" />
                  </Label>
                  {priceMode === "lines" ? (
                    <Label text={`Contract price, each, ${periodText}`} className="col-span-2 sm:col-span-3">
                      <input type="number" min={0} step="0.01" inputMode="decimal" value={l.contractUnit} onChange={(e) => setLine(l.key, { contractUnit: e.target.value })} placeholder="Not known" className="field w-full tabular" />
                    </Label>
                  ) : (
                    <div className="hidden sm:block sm:col-span-3" />
                  )}
                  <div className="col-span-2 sm:col-span-1 flex sm:justify-end">
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(l.key)} className="btn btn-ghost btn-sm" aria-label={`Remove seat line ${i + 1}`}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                {/* Listino del catalogo accanto alla riga, e sconto se c'è un prezzo di contratto. */}
                <p className="text-xs text-ink-400 break-words">
                  {isOther ? (
                    "List price UNKNOWN · not in the angar price list"
                  ) : r?.list ? (
                    r.list.url ? (
                      <a href={r.list.url} target="_blank" rel="noopener noreferrer" className="hover:text-ink-100 hover:underline">
                        {r.list.text} ↗
                      </a>
                    ) : (
                      r.list.text
                    )
                  ) : plan ? (
                    "List price UNKNOWN · no public price for this seat type"
                  ) : null}
                  {priceMode === "lines" && r?.unitMonthly != null && (
                    <span className="text-ink-100">
                      {" · "}
                      {d != null ? discountText(d) : "Discount UNKNOWN"}
                      {r.listCur != null && r.list && r.list.currency !== currency ? ` (list ≈ ${money(r.listCur, currency)} a month)` : ""}
                    </span>
                  )}
                </p>
              </div>
            );
          })}
        </div>
        <div>
          <button type="button" onClick={addLine} className="btn btn-secondary btn-sm" disabled={!isOther && !!plan && lines.length >= seatOptions.length}>
            Add seat type
          </button>
        </div>
        {priceMode === "total" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Label text="Contract total">
              <input type="number" min={0} step="0.01" inputMode="decimal" value={contractTotal} onChange={(e) => setContractTotal(e.target.value)} required className="field w-full tabular" />
            </Label>
          </div>
        )}
        {priceMode !== "none" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Label text="Contract prices are">
              <select value={contractPeriod} onChange={(e) => setContractPeriod(e.target.value === "year" ? "year" : "month")} className="field w-full">
                <option value="month">A month</option>
                <option value="year">A year</option>
              </select>
            </Label>
          </div>
        )}
        {/* Riepilogo: listino, contratto, sconto (al mese, nella valuta scelta). */}
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-line text-sm">
          <div>
            <dt className="text-xs text-ink-400">List price</dt>
            <dd className="text-ink-100 tabular mt-0.5">{summary.listMonthly != null ? `${money(summary.listMonthly, currency)} a month` : "UNKNOWN"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">Contract price</dt>
            <dd className="text-ink-100 tabular mt-0.5">{summary.contractMonthly != null ? `${money(summary.contractMonthly, currency)} a month` : priceMode === "none" ? "Not known" : "UNKNOWN"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">Discount</dt>
            <dd className="text-ink-100 tabular mt-0.5">{summary.contractMonthly != null ? (summary.discount != null ? discountText(summary.discount) : "UNKNOWN") : "—"}</dd>
          </div>
        </dl>
      </section>

      {/* Contratto e fatturato */}
      <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
        <h2 className="text-sm font-bold text-ink-100">Contract and billing</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Label text="Contract start">
            <input type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} className="field w-full" />
          </Label>
          <Label text="Renewal date">
            <input type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} className="field w-full" />
          </Label>
          <Label text={`Amount actually billed (${currency}), if known`}>
            <input type="number" min={0} step="0.01" inputMode="decimal" value={billedAmount} onChange={(e) => setBilledAmount(e.target.value)} placeholder="Not known" className="field w-full tabular" />
          </Label>
          <Label text="Billing period of that amount">
            <select value={billedPeriod} onChange={(e) => setBilledPeriod(e.target.value as "month" | "quarter" | "year")} className="field w-full">
              <option value="month">A month</option>
              <option value="quarter">A quarter</option>
              <option value="year">A year</option>
            </select>
          </Label>
          <Label text="Note" className="sm:col-span-2">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} placeholder="e.g. Order form 2026-114, signed by Finance" className="field w-full" />
          </Label>
        </div>
      </section>

      {error && (
        <p role="alert" className="text-sm text-alarm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save subscription"}
        </button>
        <Link href={`/assets/${assetId}`} className="btn btn-ghost">
          Cancel
        </Link>
        {editing && (
          <button type="button" onClick={remove} className="btn btn-danger ml-auto" disabled={pending}>
            Delete subscription
          </button>
        )}
      </div>
    </form>
  );
}

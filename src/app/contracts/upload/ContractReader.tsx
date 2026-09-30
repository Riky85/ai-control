"use client";

import { useFormState, useFormStatus } from "react-dom";
import CsvDropzone from "@/components/CsvDropzone";
import { readContractAction, applyContractAction, type ReadState } from "@/lib/contract-actions";

const KIND_LABEL = { contract: "Contract", order: "Order form", invoice: "Invoice" } as const;

function SubmitButton({ label, pending }: { label: string; pending: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button className="btn btn-primary" disabled={busy}>
      {busy ? pending : label}
    </button>
  );
}

// Due passi: carica il PDF → controlla i campi trovati e applicali all'AI.
export default function ContractReader({ assets, plans }: { assets: { id: string; label: string }[]; plans: { id: string; name: string }[] }) {
  const [state, read] = useFormState<ReadState, FormData>(readContractAction, null);

  return (
    <>
      <section className="rounded-2xl border border-line bg-panel animate-rise">
        <form action={read} className="flex flex-col">
          <div className="p-5 flex flex-col gap-3">
            <CsvDropzone accept=".pdf,application/pdf" label="Drop a contract, order form or invoice (PDF)" />
            {state && !state.ok && <p className="text-sm text-alarm">{state.error}</p>}
          </div>
          {/* Barra grigia in basso: azione e nota sulla privacy. */}
          <div className="flex items-center justify-between gap-3 bg-ink border-t border-line rounded-b-2xl px-5 py-3 bar-foot">
            <SubmitButton label="Read it" pending="Reading…" />
            <span className="text-xs text-ink-400">The PDF is read once and never stored.</span>
          </div>
        </form>
      </section>

      {state?.ok && <Review key={`${state.fileName}-${state.pages}-${state.fields.contractEnd}-${state.fields.monthlyEur}`} state={state} assets={assets} plans={plans} />}
    </>
  );
}

function Review({ state, assets, plans }: { state: Extract<NonNullable<ReadState>, { ok: true }>; assets: { id: string; label: string }[]; plans: { id: string; name: string }[] }) {
  const f = state.fields;
  const found = [f.plan ?? f.vendor, f.seats && `${f.seats} seats`, f.contractEnd && `ends ${f.contractEnd}`].filter(Boolean).join(" · ");
  const pill = (on: boolean) => `inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${on ? "text-steady bg-steady/10" : "text-ink-400 bg-ink-100/[0.06]"}`;
  const empty = (v: unknown) => v == null || v === "";
  const cls = (v: unknown) => `field w-full ${empty(v) ? "border-dashed" : ""}`;

  return (
    <section className="rounded-2xl border border-line bg-panel animate-rise" aria-labelledby="review-title">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-ink border-b border-line rounded-t-2xl px-5 py-3 bar-head">
        <div className="min-w-0">
          <h2 id="review-title" className="text-sm font-semibold text-ink-100">Check what angar found</h2>
          <p className="text-xs text-ink-400 mt-0.5 truncate">
            {state.fileName} · {state.pages} {state.pages === 1 ? "page" : "pages"}
            {found ? ` · ${found}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {f.kind && <span className={pill(false)}>{KIND_LABEL[f.kind]}</span>}
          <span className={pill(state.refined)}>{state.refined ? "Read by rules + Claude" : "Read by rules"}</span>
        </div>
      </div>

      <form action={applyContractAction} className="px-5 pt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <input type="hidden" name="fileName" value={state.fileName} />
        <input type="hidden" name="kind" value={f.kind ?? ""} />
        {f.dataClauses.map((c) => (
          <input key={c.key} type="hidden" name="clause" value={c.key} />
        ))}

        <label className="col-span-2 sm:col-span-3 flex flex-col gap-1 text-xs text-ink-400">
          For which AI
          <select name="assetId" defaultValue={state.assetId ?? ""} required className={cls(state.assetId)}>
            <option value="">Pick the AI this document is for</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          {!state.assetId && <span className="text-[11px]">{f.vendor ? `No AI from ${f.vendor} found in your list — pick one.` : "Vendor not recognised — pick the AI."}</span>}
        </label>

        <label className="col-span-2 flex flex-col gap-1 text-xs text-ink-400">
          Plan
          <select name="planId" defaultValue={f.planId ?? ""} className={cls(f.planId)}>
            <option value="">{f.plan && !f.planId ? `${f.plan} (not in the price list)` : "Unknown"}</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-400">
          Seats
          <input type="number" min={1} name="seats" defaultValue={f.seats ?? ""} className={cls(f.seats)} />
        </label>

        <label className="flex flex-col gap-1 text-xs text-ink-400">
          Cost a month (€)
          <input type="number" step="0.01" min={0} name="monthlyEur" defaultValue={f.monthlyEur ?? ""} className={cls(f.monthlyEur)} />
          <span className="text-[11px] tabular">
            {[f.seatPriceEur != null && `€${f.seatPriceEur} a seat`, f.totalEur != null && `total €${f.totalEur}`, f.currency && f.currency !== "EUR" && `converted from ${f.currency}`].filter(Boolean).join(" · ") || " "}
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-400">
          Billing
          <select name="billing" defaultValue={f.billing ?? ""} className={cls(f.billing)}>
            <option value="">Don&apos;t know</option>
            <option value="monthly">Monthly</option>
            <option value="annual">Yearly</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-400">
          Auto-renews
          <select name="autoRenew" defaultValue={f.autoRenew == null ? "" : f.autoRenew ? "yes" : "no"} className={cls(f.autoRenew)}>
            <option value="">Don&apos;t know</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-ink-400">
          Start
          <input type="date" name="contractStart" defaultValue={f.contractStart ?? ""} className={cls(f.contractStart)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-400">
          End
          <input type="date" name="contractEnd" defaultValue={f.contractEnd ?? ""} className={cls(f.contractEnd)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-400">
          Notice (days)
          <input type="number" min={0} max={730} name="noticeDays" defaultValue={f.noticeDays ?? ""} className={cls(f.noticeDays)} />
        </label>

        <div className="col-span-2 sm:col-span-3 border-t border-line pt-3 mt-1">
          <div className="text-xs text-ink-400 mb-1.5">Data clauses mentioned</div>
          {f.dataClauses.length === 0 ? (
            <p className="text-sm text-ink-400">None found — ask the vendor for their DPA.</p>
          ) : (
            <ul className="divide-y divide-line">
              {f.dataClauses.map((c) => (
                <li key={c.key} className="py-1.5 flex flex-col sm:flex-row sm:items-baseline gap-x-3 gap-y-0.5">
                  <span className="text-sm text-ink-100 shrink-0 sm:w-56">{c.label}</span>
                  <span className="text-xs text-ink-400 min-w-0 truncate" title={c.snippet}>
                    “{c.snippet}”
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="col-span-2 sm:col-span-3 -mx-5 mt-1 flex items-center justify-between gap-3 bg-ink border-t border-line rounded-b-2xl px-5 py-3 bar-foot">
          <span className="text-xs text-ink-400">Empty fields keep what the AI already has.</span>
          <SubmitButton label="Apply" pending="Saving…" />
        </div>
      </form>
    </section>
  );
}

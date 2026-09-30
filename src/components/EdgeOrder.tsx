"use client";

import { useState } from "react";

// Ordine dispositivi Edge: contatore − n + con totale al mese. Con i pagamenti
// attivi va al checkout Stripe; altrimenti invia una richiesta a vendite.
export default function EdgeOrder({
  price,
  max,
  payments,
  checkoutAction,
  requestAction,
}: {
  price: number;
  max: number;
  payments: boolean;
  checkoutAction: (fd: FormData) => Promise<void>;
  requestAction: (fd: FormData) => Promise<void>;
}) {
  const [n, setN] = useState(1);
  const set = (v: number) => setN(Math.max(1, Math.min(max, Math.round(v) || 1)));
  const step = "h-9 w-9 rounded-lg border border-line text-ink-100 text-lg leading-none flex items-center justify-center hover:bg-ink-100/[0.05] disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
  return (
    <form action={payments ? checkoutAction : requestAction} className="flex flex-col gap-2 mt-auto">
      <input type="hidden" name="quantity" value={n} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-400">Devices</span>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="One less" onClick={() => set(n - 1)} disabled={n <= 1} className={step}>
            −
          </button>
          <input
            aria-label="Number of devices"
            inputMode="numeric"
            value={n}
            onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")))}
            className="w-10 text-center font-semibold tabular text-ink-100 bg-transparent outline-none"
          />
          <button type="button" aria-label="One more" onClick={() => set(n + 1)} disabled={n >= max} className={step}>
            +
          </button>
        </div>
      </div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-400">Total</span>
        <span className="text-ink-100 font-semibold tabular">
          €{price * n}
          <span className="text-ink-400 font-normal"> a month</span>
        </span>
      </div>
      <button className="btn btn-secondary w-full">{payments ? `Order ${n} device${n === 1 ? "" : "s"}` : `Request ${n} device${n === 1 ? "" : "s"}`}</button>
      {!payments && <p className="text-xs text-ink-400 text-center">We confirm by email and send the invoice — no card needed.</p>}
    </form>
  );
}

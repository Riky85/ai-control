"use client";

import Link from "next/link";
import { useState } from "react";
import { WIZARD_COOKIE } from "@/lib/wizard";

export interface WizardStep {
  key: string;
  title: string;
  desc: string;
  href: string;
  cta: string;
  done: boolean;
}

// Wizard di avvio: guida l'utente nei 3 passi che rendono angar utile
// (costi → uso → team). Ogni passo si spunta da solo dai dati reali.
// Aperto: come il blocco Download (bagliore arancio, anteprima a destra).
// Chiuso: una barra sottile con l'avanzamento e il prossimo passo.

// primary = false: sulla Overview con l'Angar Score il pulsante principale è "Improve my score", qui solo secondari.
export default function SetupWizard({ steps, initialHidden = false, primary = true }: { steps: WizardStep[]; initialHidden?: boolean; primary?: boolean }) {
  const main = primary ? "btn-primary" : "btn-secondary";
  // Aperto la prima volta; se lo chiudi resta chiuso (cookie), anche ricaricando la pagina.
  const [hidden, setHidden] = useState(initialHidden);
  const store = (v: boolean) => {
    setHidden(v);
    document.cookie = `${WIZARD_COOKIE}=${v ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const activeIdx = steps.findIndex((s) => !s.done);
  const next = steps[activeIdx];

  if (hidden)
    return (
      <section className="relative overflow-hidden rounded-xl border border-line bg-panel flex items-center gap-4 pl-4 pr-3 py-3">
        <Ring done={doneCount} total={steps.length} />
        <div className="relative flex-1 min-w-0">
          <div className="text-sm font-medium text-ink-100">Setup guide · {doneCount} of {steps.length} done</div>
          <div className="text-xs text-ink-400 truncate">Next: {next.title}</div>
        </div>
        <Link href={next.href} className={`relative btn ${main} btn-sm shrink-0`}>
          {next.cta}
        </Link>
        <button onClick={() => store(false)} className="relative btn btn-ghost btn-sm shrink-0">
          Show steps
        </button>
      </section>
    );

  return (
    <section className="relative overflow-hidden rounded-xl border border-line bg-panel grid grid-cols-1 lg:grid-cols-[1fr_auto]">
      <button
        onClick={() => store(true)}
        aria-label="Hide the setup guide"
        className="btn btn-ghost btn-sm btn-icon absolute right-3 top-3 z-10"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
      </button>

      <div className="relative p-6 lg:p-7 flex flex-col gap-4 min-w-0">
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <span className="rounded-[2px] border border-line px-1.5 py-0.5 font-mono uppercase text-[10px] tracking-[0.05em] text-ink-100 tabular">
            {doneCount} of {steps.length} done
          </span>
          <span>Setup guide</span>
        </div>
        <div>
          <h2 className="font-display text-[24px] leading-tight font-semibold tracking-tight text-ink-100">Get angar working in 3 steps</h2>
          <p className="text-sm text-ink-400 mt-1 max-w-md">Each step ticks itself as soon as the data arrives — you&apos;ll see your AI, costs and savings here.</p>
        </div>
        <div className="h-1.5 w-full max-w-md rounded-full bg-ink-100/[0.07] overflow-hidden">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(6, (doneCount / steps.length) * 100)}%` }} />
        </div>
        <ol className="flex flex-col gap-1.5 max-w-xl">
          {steps.map((s, i) => {
            const active = i === activeIdx;
            return (
              <li key={s.key} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${active ? "bg-accent/[0.07] border border-accent/30" : "border border-transparent"}`}>
                <span className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${s.done ? "bg-steady text-white" : active ? "bg-accent text-white" : "border border-line text-ink-400"}`}>
                  {s.done ? <Check /> : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${s.done ? "text-ink-400 line-through" : "text-ink-100"}`}>{s.title}</div>
                  {active && <div className="text-xs text-ink-400 mt-0.5">{s.desc}</div>}
                </div>
                {!s.done && (
                  <Link href={s.href} className={`btn btn-sm shrink-0 ${active ? main : "btn-ghost"}`}>
                    {s.cta}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="relative hidden lg:flex items-end justify-center px-8 pt-8">
        <Preview />
      </div>
    </section>
  );
}

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5l2.3 2.3 4.7-5" /></svg>
  );
}

/** Anello di avanzamento per la barra chiusa. */
function Ring({ done, total }: { done: number; total: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative h-10 w-10 shrink-0">
      <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3" className="stroke-ink-100/10" />
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-accent" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.04, done / total))} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-ink-100 tabular">
        {done}/{total}
      </span>
    </span>
  );
}

/** Anteprima di cosa si vede a setup finito (numeri d'esempio), come nel blocco Download. */
function Preview() {
  const rows: [string, string, string, boolean][] = [
    ["ChatGPT", "10 seats · 3 used", "€305", true],
    ["Claude", "Team · 6 seats", "€150", false],
    ["Copilot", "Business · 8 seats", "€168", false],
  ];
  return (
    <div className="w-[290px] rounded-t-xl border border-b-0 border-line bg-ink shadow-[0_-8px_32px_rgba(20,20,24,0.06)] dark:bg-sidebar dark:shadow-[0_-10px_60px_rgba(0,0,0,0.35)] select-none" aria-hidden>
      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="rounded-lg border border-line bg-panel px-3 py-2">
          <div className="font-mono uppercase text-[10px] tracking-[0.04em] text-ink-400">AI in use</div>
          <div className="font-display text-[20px] font-semibold tabular text-ink-100 leading-tight">13</div>
        </div>
        <div className="rounded-lg border border-accent/40 bg-panel px-3 py-2">
          <div className="font-mono uppercase text-[10px] tracking-[0.04em] text-ink-400">You could save</div>
          <div className="font-display text-[20px] font-semibold tabular text-accent leading-tight">
            €683<span className="text-[10px] text-ink-400 font-normal">/mo</span>
          </div>
        </div>
      </div>
      <div className="mx-3 mb-3 rounded-lg border border-line bg-panel divide-y divide-line">
        {rows.map(([n, info, eur, flag]) => (
          <div key={n} className="flex items-center gap-2.5 px-3 py-2">
            <span className="h-6 w-6 rounded-md bg-ink-100/[0.08] text-[10px] font-semibold text-ink-100 flex items-center justify-center">{n[0]}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-ink-100">{n}</div>
              <div className={`text-[10px] ${flag ? "text-signal" : "text-ink-400"}`}>{info}</div>
            </div>
            <div className="text-[11px] tabular text-ink-100 font-medium">{eur}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

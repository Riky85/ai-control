"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export interface WizardStep {
  key: string;
  title: string;
  desc: string;
  href: string;
  cta: string;
  done: boolean;
}

const HIDE_KEY = "angar:wizard-hidden";

// Wizard di avvio: guida l'utente nei 3 passi che rendono angar utile
// (costi → uso → team). Ogni passo si spunta da solo dai dati reali.
// Si può chiudere; quando i passi sono tutti fatti, sparisce comunque.
export default function SetupWizard({ steps }: { steps: WizardStep[] }) {
  // null finché non si legge la preferenza: niente lampeggio tra chip e wizard.
  const [hidden, setHidden] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDE_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  const doneCount = steps.filter((s) => s.done).length;
  if (hidden === null || doneCount === steps.length) return null;
  // Chiuso: resta una piccola pillola per riaprirlo.
  if (hidden)
    return (
      <button
        onClick={() => {
          try {
            localStorage.removeItem(HIDE_KEY);
          } catch {
            /* best-effort */
          }
          setHidden(false);
        }}
        className="self-start inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-xs text-ink-400 hover:text-ink-100 hover:border-accent/50 transition-colors"
      >
        <span className="h-4 w-4 rounded-full bg-accent/15 text-accent text-[10px] font-semibold flex items-center justify-center">{doneCount}</span>
        Setup guide · {doneCount} of {steps.length} done — show
      </button>
    );
  // Il primo passo non ancora completato è quello "attivo".
  const activeIdx = steps.findIndex((s) => !s.done);

  return (
    <section className="rounded-xl border border-accent/40 bg-panel overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-3">
        <div>
          <h2 className="text-base font-semibold text-ink-100">Get angar working — {doneCount} of {steps.length} done</h2>
          <p className="text-sm text-ink-400">Three quick steps. Each ticks itself once the data arrives.</p>
        </div>
        <button
          onClick={() => {
            try {
              localStorage.setItem(HIDE_KEY, "1");
            } catch {
              /* best-effort */
            }
            setHidden(true);
          }}
          className="text-xs text-ink-400 hover:text-ink-100 shrink-0"
        >
          Dismiss
        </button>
      </div>
      <div className="h-1 w-full bg-ink-100/[0.06]">
        <div className="h-full bg-accent transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <div className="divide-y divide-line border-t border-line">
        {steps.map((s, i) => (
          <div key={s.key} className={`flex items-center gap-4 px-5 py-3.5 ${i === activeIdx ? "bg-accent/[0.04]" : ""}`}>
            <span className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${s.done ? "bg-steady text-white" : i === activeIdx ? "bg-accent text-white" : "border border-line text-ink-400"}`}>
              {s.done ? "✓" : i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${s.done ? "text-ink-400 line-through" : "text-ink-100"}`}>{s.title}</div>
              {!s.done && <div className="text-xs text-ink-400 mt-0.5">{s.desc}</div>}
            </div>
            {!s.done && (
              <Link href={s.href} className={`btn btn-sm shrink-0 ${i === activeIdx ? "btn-primary" : "btn-secondary"}`}>
                {s.cta}
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

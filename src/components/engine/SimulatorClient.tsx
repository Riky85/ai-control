"use client";

import { useMemo, useState } from "react";
import { simulate, EMPTY_SCENARIO, type Scenario, type SimModel } from "@/lib/engine/simulate";
import { AXES, AXIS_LABEL, type Axis } from "@/lib/engine/score-meta";

/**
 * Simulatore "e se…": scenari a sinistra, effetto a destra. Tutto ricalcolato
 * nel browser dal modello serializzabile preparato dalla pagina server.
 */

const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

const AXIS_WHY: Record<Axis, string> = {
  visibility: "What angar sees of your spend",
  utilization: "Paid seats in use",
  tools: "Tools doing the same job",
  consumption: "Unchanged by these scenarios",
  savings: "Savings left, against spend",
};

function Toggle({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 px-5 py-3 ${disabled ? "opacity-50" : "cursor-pointer hover:bg-ink-100/[0.02]"}`}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`mt-0.5 relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-ink-100/15"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-panel shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </button>
      <span className="min-w-0">
        <span className="block text-sm text-ink-100">{label}</span>
        <span className="block text-xs text-ink-400">{hint}</span>
      </span>
    </label>
  );
}

const select = "rounded-lg border border-line bg-ink px-2.5 py-1.5 text-sm text-ink-100 max-w-full";

export default function SimulatorClient({ model }: { model: SimModel }) {
  const [sc, setSc] = useState<Scenario>(EMPTY_SCENARIO);
  const r = useMemo(() => simulate(model, sc), [model, sc]);
  const set = (patch: Partial<Scenario>) => setSc((s) => ({ ...s, ...patch }));

  // Quanto vale ogni leva da sola (per il suggerimento accanto all'interruttore).
  const alone = useMemo(() => {
    const one = (p: Partial<Scenario>) => simulate(model, { ...EMPTY_SCENARIO, ...p }).saveMonthly;
    return { unused: one({ removeUnused: true }), yearly: one({ yearly: true }) };
  }, [model]);
  const byId = useMemo(() => new Map(model.assets.map((a) => [a.id, a])), [model]);
  const unapproved = model.assets.filter((a) => a.status === "UNAPPROVED" && a.inUse).length;
  const active = Object.values(sc.standardise).some(Boolean) || sc.removeUnused || sc.yearly || sc.blockUnapproved || sc.cut != null;

  const cell = "bg-panel px-5 py-4 flex flex-col gap-1 min-w-0";
  const big = "font-display text-[26px] leading-tight font-semibold tracking-tight tabular";

  return (
    <div className="flex flex-col gap-4">
      {/* Risultato */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-xl border border-line bg-line animate-rise" aria-live="polite" aria-label="Result">
        <div className={cell}>
          <span className="text-xs text-ink-400">Monthly cost</span>
          <span className={`${big} text-ink-100`}>{eur(r.monthly)}</span>
          <span className="text-xs text-ink-400 truncate">{active ? <>Today <s>{eur(r.baseMonthly)}</s></> : "Today"}</span>
        </div>
        <div className={cell}>
          <span className="text-xs text-ink-400">Yearly cost</span>
          <span className={`${big} text-ink-100`}>{eur(r.yearly)}</span>
          <span className="text-xs text-ink-400 truncate tabular">
            {r.seats.after} seat{r.seats.after === 1 ? "" : "s"}
            {r.seats.after !== r.seats.before ? ` · was ${r.seats.before}` : ""}
          </span>
        </div>
        <div className={cell}>
          <span className="text-xs text-ink-400">You save</span>
          <span className={`${big} ${r.saveYearly >= 1 ? "text-accent" : r.saveYearly <= -1 ? "text-alarm" : "text-ink-100"}`}>{r.saveYearly <= -1 ? `−${eur(-r.saveYearly)}` : eur(Math.max(0, r.saveYearly))}</span>
          <span className="text-xs text-ink-400 truncate">a year · {eur(Math.max(0, r.saveMonthly))} a month</span>
        </div>
        <div className={cell}>
          <span className="text-xs text-ink-400">angar Score</span>
          <span className={`${big} text-ink-100`}>
            {r.score.after}
            {r.score.after !== r.score.before && <span className={`ml-2 text-sm font-medium ${r.score.after > r.score.before ? "text-steady" : "text-alarm"}`}>{signed(r.score.after - r.score.before)}</span>}
          </span>
          <span className="text-xs text-ink-400 truncate">{r.score.levelLabel} · today {model.score.score}</span>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
        {/* Scenari */}
        <section className="rounded-xl border border-line bg-panel animate-rise">
          <div className="flex items-center justify-between gap-3 bg-ink border-b border-line rounded-t-xl px-5 py-3 text-sm bar-head">
            <h2 className="font-bold text-ink-100">Scenarios</h2>
            {active && (
              <button type="button" className="text-xs text-ink-400 hover:text-ink-100 underline" onClick={() => setSc(EMPTY_SCENARIO)}>
                Reset
              </button>
            )}
          </div>
          <div className="divide-y divide-line">
            {model.categories.map((c) => (
              <div key={c.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0">
                  <span className="block text-sm text-ink-100">Standardise {c.label.toLowerCase()}</span>
                  <span className="block text-xs text-ink-400">Keep one, move everyone to it, size seats to active people</span>
                </span>
                <select className={select} value={sc.standardise[c.key] ?? ""} onChange={(e) => set({ standardise: { ...sc.standardise, [c.key]: e.target.value || null } })} aria-label={`Standardise ${c.label}`}>
                  <option value="">Keep all {c.assetIds.length}</option>
                  {c.assetIds.map((id) => (
                    <option key={id} value={id}>
                      Only {byId.get(id)?.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <Toggle on={sc.removeUnused} onChange={(v) => set({ removeUnused: v })} label="Remove unused seats" hint={alone.unused >= 1 ? `Seats nobody used in 30 days · ${eur(alone.unused)} a month` : "No unused seats with known users"} disabled={alone.unused < 1 && !sc.removeUnused} />
            <Toggle on={sc.yearly} onChange={(v) => set({ yearly: v })} label="Switch to yearly billing" hint={alone.yearly >= 1 ? `Where the plan has a yearly price · ${eur(alone.yearly)} a month` : "No monthly plans with a cheaper yearly price"} disabled={alone.yearly < 1 && !sc.yearly} />
            <Toggle
              on={sc.blockUnapproved}
              onChange={(v) => set({ blockUnapproved: v })}
              label="Block unapproved AI"
              hint={unapproved ? `${unapproved} AI not allowed but still in use · safer, no cost change` : "No AI that isn't allowed is in use"}
              disabled={!unapproved && !sc.blockUnapproved}
            />
            {model.departments.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0">
                  <span className="block text-sm text-ink-100">Cut seats of a team</span>
                  <span className="block text-xs text-ink-400">Least active people first</span>
                </span>
                <span className="flex flex-wrap gap-2">
                  <select
                    className={select}
                    value={sc.cut?.dept ?? ""}
                    onChange={(e) => set({ cut: e.target.value === "" ? null : { dept: Number(e.target.value), pct: sc.cut?.pct ?? 0.25 } })}
                    aria-label="Team"
                  >
                    <option value="">No team</option>
                    {model.departments.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                  {sc.cut && (
                    <select className={select} value={sc.cut.pct} onChange={(e) => set({ cut: { dept: sc.cut!.dept, pct: Number(e.target.value) } })} aria-label="How many seats">
                      {[0.25, 0.5, 1].map((p) => (
                        <option key={p} value={p}>
                          {p === 1 ? "All seats" : `${p * 100}% of seats`}
                        </option>
                      ))}
                    </select>
                  )}
                </span>
              </div>
            )}
          </div>
        </section>

        <div className="flex flex-col gap-4">
          {/* Effetto sugli assi */}
          <section className="rounded-xl border border-line bg-panel animate-rise">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-ink border-b border-line rounded-t-xl px-5 py-3 text-sm bar-head">
              <h2 className="font-bold text-ink-100">Effect on the score</h2>
              <p className="text-xs text-ink-400">Same calculation as the angar Score</p>
            </div>
            <ul className="divide-y divide-line">
              {AXES.map((a) => {
                const b0 = model.score.axes[a];
                const a0 = r.score.axes[a];
                // Dimensione non misurata (senza peso): una riga semplice.
                if (b0 == null || a0 == null)
                  return (
                    <li key={a} className="grid grid-cols-[9.5rem_minmax(0,1fr)_3rem] items-center gap-4 px-5 py-3">
                      <span className="block text-sm text-ink-100">{AXIS_LABEL[a]}</span>
                      <span className="text-xs text-ink-400">Not measured yet</span>
                      <span className="text-right text-sm text-ink-400">—</span>
                    </li>
                  );
                const before = b0;
                const after = a0;
                const d = r.score.delta[a];
                return (
                  <li key={a} className="grid grid-cols-[9.5rem_minmax(0,1fr)_3rem] items-center gap-4 px-5 py-3">
                    <span className="min-w-0">
                      <span className="block text-sm text-ink-100">{AXIS_LABEL[a]}</span>
                      <span className="block text-[11px] text-ink-400 truncate" title={r.score.notes[a] ?? AXIS_WHY[a]}>
                        {r.score.notes[a] ?? AXIS_WHY[a]}
                      </span>
                    </span>
                    <div className="relative h-3" role="img" aria-label={`${AXIS_LABEL[a]} ${before} to ${after}`}>
                      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
                      <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink-100/20" style={{ width: `${before}%` }} />
                      {d !== 0 && (
                        <div
                          className={`absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full ${d > 0 ? "bg-steady/60" : "bg-alarm/50"}`}
                          style={{ left: `${Math.min(before, after)}%`, width: `${Math.abs(d)}%` }}
                        />
                      )}
                      <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel bg-ink-100" style={{ left: `${Math.max(1.5, Math.min(98.5, after))}%` }} />
                    </div>
                    <span className="text-right text-sm tabular text-ink-100">
                      {after}
                      {d !== 0 && <span className={`block text-[11px] ${d > 0 ? "text-steady" : "text-alarm"}`}>{d > 0 ? "↑" : "↓"} {Math.abs(d)}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Cosa cambia */}
          <section className="rounded-xl border border-line bg-panel animate-rise">
            <div className="bg-ink border-b border-line rounded-t-xl px-5 py-3 text-sm bar-head">
              <h2 className="font-bold text-ink-100">What changes</h2>
            </div>
            {r.changes.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-400">Turn on a scenario to see the changes.</p>
            ) : (
              <ul className="divide-y divide-line">
                {r.changes.map((c) => (
                  <li key={c.key} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                    <span className="text-ink-100 min-w-0">{c.text}</span>
                    <span className={`shrink-0 tabular ${c.monthlyEur <= -1 ? "text-alarm" : "text-ink-100"}`}>
                      {Math.abs(c.monthlyEur) >= 1 ? `${c.monthlyEur > 0 ? "−" : "+"}${eur(Math.abs(c.monthlyEur))}` : "—"}
                      {Math.abs(c.monthlyEur) >= 1 && <span className="text-ink-400"> a month</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

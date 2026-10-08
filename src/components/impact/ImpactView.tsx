import Link from "next/link";
import { PageHeader, Panel, Table, td, BlockHead } from "@/components/ui";
import { SCENARIOS, scenarioQuery } from "@/lib/impact/params";
import { money } from "@/lib/impact/engine";
import type { ImpactOptions, Opt } from "@/lib/impact/options";
import type { CompatStatus, ImpactResult, Kind, ScenarioKind, Val } from "@/lib/impact/types";

/**
 * Impact Simulator — "What happens if I change this?". Componente server (nessun JS nel
 * browser): il modulo è un GET, quindi lo scenario sta nell'URL e si condivide.
 * Riceve dati già calcolati, così si mostra anche con un estate di prova.
 */

const KIND_LABEL: Record<Kind, string> = { observed: "Observed", calculated: "Calculated", estimated: "Estimated", unknown: "Unknown" };
const COMPAT_DOT: Record<CompatStatus, string> = { fits: "bg-steady", gaps: "bg-accent", blocked: "bg-alarm", unknown: "bg-ink-400", "n/a": "bg-line" };
const RISK_DOT: Record<string, string> = { Low: "bg-steady", Medium: "bg-accent", High: "bg-alarm" };
const CONF: Record<string, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Importo con il suo tipo: "≈" per le stime, "Unknown" se non noto; la base nel tooltip. */
function Amount({ v, signed = false, className = "" }: { v: Val; signed?: boolean; className?: string }) {
  if (v.eur == null) return <span className={`text-ink-400 ${className}`} title={v.basis}>Unknown</span>;
  const txt = signed && v.eur > 0 ? `+${money(v.eur)}` : money(v.eur);
  return (
    <span className={`tabular ${className}`} title={`${KIND_LABEL[v.kind]} · ${v.basis}`}>
      {v.kind === "estimated" ? "≈ " : ""}
      {txt}
    </span>
  );
}

const Tag = ({ kind }: { kind: Kind }) => <span className="font-mono uppercase text-[10px] tracking-[0.05em] text-ink-400">{KIND_LABEL[kind]}</span>;

function Select({ name, label, options, value, placeholder, required }: { name: string; label: string; options: Opt[]; value?: string; placeholder?: string; required?: boolean }) {
  const groups: { group: string; items: Opt[] }[] = [];
  for (const o of options) {
    const g = o.group ?? "";
    const last = groups[groups.length - 1];
    if (last && last.group === g) last.items.push(o);
    else groups.push({ group: g, items: [o] });
  }
  return (
    <label className="flex flex-col gap-1.5 eyebrow min-w-0">
      {label}
      <select name={name} defaultValue={value ?? ""} required={required} className="field w-full">
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {groups.map((g) =>
          g.group ? (
            <optgroup key={g.group} label={g.group}>
              {g.items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
          ) : (
            g.items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
          ),
        )}
      </select>
    </label>
  );
}

function Input({ name, label, value, type = "text", placeholder, required, min, max, step }: { name: string; label: string; value?: string; type?: string; placeholder?: string; required?: boolean; min?: number; max?: number; step?: number }) {
  return (
    <label className="flex flex-col gap-1.5 eyebrow min-w-0">
      {label}
      <input name={name} type={type} defaultValue={value ?? ""} placeholder={placeholder} required={required} min={min} max={max} step={step} className="field w-full" />
    </label>
  );
}

const COMPONENT_OPTS: Opt[] = [
  { value: "all", label: "All prices" },
  { value: "input", label: "Input tokens" },
  { value: "output", label: "Output tokens" },
  { value: "seat", label: "Seats" },
];

function Fields({ kind, raw, o }: { kind: ScenarioKind; raw: Record<string, string>; o: ImpactOptions }) {
  const from = o.estateModels.length ? o.estateModels : o.catalogModels;
  switch (kind) {
    case "replace-model":
      return (
        <>
          <Select name="from" label="From model" options={from} value={raw.from} placeholder="Choose" required />
          <Select name="to" label="To model" options={o.catalogModels} value={raw.to} placeholder="Choose" required />
          <Select name="system" label="AI system" options={o.systems} value={raw.system} placeholder="Every AI system" />
        </>
      );
    case "replace-provider":
      return (
        <>
          <Select name="from" label="From" options={o.estateProviders} value={raw.from} placeholder="Choose" required />
          <Select name="to" label="To" options={o.catalogTargets} value={raw.to} placeholder="Choose" required />
          <Select name="system" label="AI system" options={o.systems} value={raw.system} placeholder="Every AI system" />
        </>
      );
    case "remove-system":
      return <Select name="system" label="AI system" options={o.systems} value={raw.system} placeholder="Choose" required />;
    case "price-change":
      return (
        <>
          <Select name="provider" label="Provider" options={o.priceProviders.length ? o.priceProviders : o.estateProviders} value={raw.provider} placeholder="Choose" required />
          <Input name="pct" label="Change (%)" type="number" value={raw.pct || "25"} min={-100} max={1000} step={1} required />
          <Select name="component" label="Price" options={COMPONENT_OPTS} value={raw.component || "all"} />
          <Select name="model" label="Only this model" options={o.estateModels} value={raw.model} placeholder="Every model" />
        </>
      );
    case "deprecation":
      return (
        <>
          <Select name="model" label="Model" options={o.estateModels} value={raw.model} placeholder="Choose" required />
          <Input name="date" label="Retires on" type="date" value={raw.date} />
        </>
      );
    case "outage":
      return <Select name="provider" label="Provider or deployment" options={o.estateProviders} value={raw.provider} placeholder="Choose" required />;
    case "eu-only":
      return <p className="text-sm text-ink-400 self-center">Checks every AI system against an EU-only rule.</p>;
    case "budget":
      return <Input name="target" label="Save (€ a year)" type="number" value={raw.target || "20000"} min={1} step={100} required />;
    case "consolidate":
      return (
        <>
          <Select name="from" label="Move everyone from" options={o.systems} value={raw.from} placeholder="Choose" required />
          <Select name="to" label="Into" options={o.systems} value={raw.to} placeholder="Choose" required />
        </>
      );
  }
}

export interface SavedScenario {
  id: string;
  name: string;
  query: string;
}

export default function ImpactView({
  kind,
  raw,
  options,
  result,
  saved,
  saveAction,
  deleteAction,
  notice,
}: {
  kind: ScenarioKind | null;
  raw: Record<string, string>;
  options: ImpactOptions;
  result: ImpactResult | null;
  saved: SavedScenario[];
  saveAction?: (f: FormData) => Promise<void>;
  deleteAction?: (f: FormData) => Promise<void>;
  notice?: string | null;
}) {
  const active = SCENARIOS.find((s) => s.kind === kind) ?? null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Impact"
        subtitle="What happens if I change this?"
        action={
          <Link href="/simulate" className="btn btn-ghost btn-sm">
            Score what if
          </Link>
        }
      />
      {notice && <div className="rounded-xl border border-line bg-panel px-4 py-3 text-sm text-ink-100">{notice}</div>}

      <div className="grid lg:grid-cols-[240px_minmax(0,1fr)] gap-6 items-start">
        <nav className="rounded-xl border border-line bg-panel animate-rise" aria-label="Scenarios">
          <BlockHead title="Scenario" />
          <ul className="p-2 flex flex-col gap-0.5">
            {SCENARIOS.map((s) => (
              <li key={s.kind}>
                <Link
                  href={`/impact?s=${s.kind}`}
                  title={s.hint}
                  className={`block rounded-[4px] px-3 py-2 text-sm transition-colors ${s.kind === kind ? "bg-ink-100/[0.06] text-ink-100" : "text-ink-400 hover:text-ink-100"}`}
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
          {saved.length > 0 && (
            <div className="border-t border-line p-2">
              <div className="px-3 pt-1 pb-1.5 eyebrow">Saved</div>
              <ul className="flex flex-col gap-0.5">
                {saved.map((s) => (
                  <li key={s.id} className="flex items-center gap-1">
                    <Link href={`/impact?${s.query}`} className="flex-1 min-w-0 truncate rounded-[4px] px-3 py-1.5 text-sm text-ink-400 hover:text-ink-100">
                      {s.name}
                    </Link>
                    {deleteAction && (
                      <form action={deleteAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="btn btn-ghost btn-sm btn-icon" aria-label={`Remove ${s.name}`} title="Remove">×</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>

        <div className="flex flex-col gap-6 min-w-0">
          {!active ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {SCENARIOS.map((s) => (
                <Link key={s.kind} href={`/impact?s=${s.kind}`} className="rounded-xl border border-line bg-panel p-5 hover:border-ink-400 transition-colors animate-rise">
                  <div className="text-sm font-bold text-ink-100">{s.label}</div>
                  <div className="text-sm text-ink-400 mt-1.5">{s.hint}</div>
                </Link>
              ))}
            </div>
          ) : (
            <form action="/impact" method="get" className="rounded-xl border border-line bg-panel animate-rise">
              <BlockHead title={active.label} note={active.hint} />
              <input type="hidden" name="s" value={active.kind} />
              <div className="p-5 grid sm:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
                <Fields kind={active.kind} raw={raw} o={options} />
                <div className="flex items-end">
                  <button className="btn btn-primary btn-go w-full sm:w-auto">Simulate</button>
                </div>
              </div>
            </form>
          )}

          {result && <Result r={result} saveAction={saveAction} />}
        </div>
      </div>
    </div>
  );
}

function Chips({ title, items }: { title: string; items: { id: string; label: string; href?: string | null; sub?: string | null }[] }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow mb-2">
        {title} <span className="!text-ink-100 tabular ml-1">{items.length}</span>
      </div>
      {items.length ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((n) =>
            n.href ? (
              <Link key={n.id} href={n.href} className="inline-flex items-center rounded-[2px] border border-line px-1.5 py-0.5 font-mono uppercase text-[10px] tracking-[0.05em] text-ink-400 hover:text-ink-100 hover:border-ink-400 transition-colors" title={n.sub ?? undefined}>
                {n.label}
              </Link>
            ) : (
              <span key={n.id} className="inline-flex items-center rounded-[2px] border border-line px-1.5 py-0.5 font-mono uppercase text-[10px] tracking-[0.05em] text-ink-400" title={n.sub ?? undefined}>
                {n.label}
              </span>
            ),
          )}
        </div>
      ) : (
        <span className="eyebrow">None</span>
      )}
    </div>
  );
}

function Result({ r, saveAction }: { r: ImpactResult; saveAction?: (f: FormData) => Promise<void> }) {
  const sp = r.spend;
  const involved = sp.current;
  const deltaTone = sp.delta.eur == null || sp.exposedOnly ? "text-ink-100" : sp.delta.eur < 0 ? "text-steady" : sp.delta.eur > 0 ? "text-accent" : "text-ink-100";
  const query = scenarioQuery(r.scenario);

  if (r.empty)
    return (
      <div className="rounded-xl border border-line bg-panel px-5 py-8 text-center text-sm text-ink-400 animate-rise">
        <div className="font-bold text-ink-100 mb-1">{r.title}</div>
        {r.empty}
      </div>
    );

  return (
    <>
      {/* Riga d'apertura e prima → dopo. */}
      <section className="rounded-xl border border-line bg-panel animate-rise">
        <BlockHead title={r.title} note={r.question} />
        <div className="px-5 py-4 text-[15px] text-ink-100 tabular border-b border-line">
          {[plural(r.systems.length, "AI system"), plural(r.applications.length, "application"), plural(r.processes.length, "process", "processes"), plural(r.teams.length, "team")].join(" · ")} ·{" "}
          <span className="text-ink-100">
            <Amount v={involved} /> a month
          </span>{" "}
          {sp.exposedOnly ? "exposed" : "involved"}
        </div>
        <div className="grid sm:grid-cols-[1fr_auto_1fr_1fr] gap-x-6 gap-y-4 px-5 py-5 items-start">
          <div>
            <div className="eyebrow">Now</div>
            <div className="font-display text-[32px] leading-none font-light tracking-[-0.03em] mt-3">
              <Amount v={sp.current} />
            </div>
            <div className="text-xs text-ink-400 mt-2 flex flex-col gap-0.5">
              <span>
                Actual <Amount v={sp.currentActual} className="text-ink-100" /> · <Tag kind={sp.currentActual.kind} />
              </span>
              <span>
                Estimated <Amount v={sp.currentEstimated} className="text-ink-100" />
                {sp.unknown > 0 && ` · ${sp.unknown} with no cost`}
              </span>
            </div>
          </div>
          <div className="hidden sm:block font-mono text-ink-400 text-sm pt-8" aria-hidden>
            [→]
          </div>
          <div>
            <div className="eyebrow">{sp.exposedOnly ? "Exposed" : "After"}</div>
            <div className="font-display text-[32px] leading-none font-light tracking-[-0.03em] mt-3">
              <Amount v={sp.projected} />
            </div>
            <div className="text-xs text-ink-400 mt-2">
              a month · <Tag kind={sp.projected.kind} />
            </div>
          </div>
          <div>
            <div className={`eyebrow ${sp.exposedOnly || (sp.delta.eur ?? 0) > 0 ? "!text-accent" : ""}`}>{sp.exposedOnly ? "At risk" : "Difference"}</div>
            {sp.exposedOnly ? (
              <div className="font-display text-[32px] leading-none font-light tracking-[-0.03em] mt-3 tabular text-accent">{plural(r.systems.filter((s) => s.status?.startsWith("No fallback")).length, "AI", "AI")}</div>
            ) : (
              <div className={`font-display text-[32px] leading-none font-light tracking-[-0.03em] mt-3 ${deltaTone}`}>
                <Amount v={sp.delta} signed />
              </div>
            )}
            <div className="text-xs text-ink-400 mt-2">{sp.exposedOnly ? "with no fallback" : <><Amount v={sp.annualDelta} signed /> a year</>}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-line text-sm">
          {[
            { k: "Switching cost", v: <Amount v={r.switching} />, t: r.switching.basis },
            { k: "Effort", v: r.effort ?? "—", t: "Highest migration effort among the AI systems" },
            { k: "Risk", v: <span className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${RISK_DOT[r.risk]}`} /><span className={r.risk === "Low" ? "" : "text-accent"}>{r.risk}</span></span>, t: "Highest risk among the AI systems" },
            { k: "Confidence", v: CONF[r.confidence], t: r.confidenceWhy },
          ].map((x, i) => (
            <div key={x.k} className={`px-5 py-3 ${i ? "sm:border-l border-line" : ""} ${i % 2 ? "border-l sm:border-l" : ""} ${i > 1 ? "border-t sm:border-t-0" : ""}`} title={x.t}>
              <div className="eyebrow">{x.k}</div>
              <div className="text-ink-100 mt-1">{x.v}</div>
            </div>
          ))}
        </div>
      </section>

      {r.budget && (
        <Table
          title="Actions"
          note={r.budget.reached ? `Target reached · ${money(r.budget.total.eur)} a year` : `${money(r.budget.total.eur)} of ${money(r.budget.target)} a year`}
          columns={["Action", { label: "A year", className: "text-right" }, "Effort", "Confidence", { label: "Fit", className: "text-right" }, { label: "Running total", className: "text-right" }]}
          empty={r.budget.actions.length ? false : "No action found."}
        >
          {r.budget.actions.slice(0, 12).map((a) => (
            <tr key={a.key} className={a.picked ? "" : "opacity-60"}>
              <td className={td}>
                <div className="text-ink-100 flex items-center gap-2">
                  {a.picked && <span className="h-1.5 w-1.5 rounded-full bg-steady shrink-0" title="Picked" />}
                  {a.title}
                </div>
                <div className="text-xs text-ink-400 mt-0.5 line-clamp-1" title={a.detail}>{a.detail}</div>
              </td>
              <td className={`${td} text-right`}>
                <Amount v={a.annual} className="text-ink-100" />
              </td>
              <td className={td}>{a.effort}</td>
              <td className={td}>{CONF[a.confidence]}</td>
              <td className={`${td} text-right tabular`}>{a.compatibility == null ? "—" : `${a.compatibility}%`}</td>
              <td className={`${td} text-right tabular text-ink-400`}>{a.cumulativeAnnual == null ? "—" : money(a.cumulativeAnnual)}</td>
            </tr>
          ))}
        </Table>
      )}

      <Table
        title="AI systems"
        note="Hover a value for its basis"
        columns={["AI system", { label: "Now", className: "text-right" }, { label: sp.exposedOnly ? "Exposed" : "After", className: "text-right" }, "Compatibility", "Effort", "Risk", "Confidence"]}
      >
        {r.systems.map((s) => (
          <tr key={s.id} className="align-top">
            <td className={`${td} min-w-[200px]`}>
              <Link href={s.href} className="text-ink-100 hover:underline">{s.name}</Link>
              <div className="eyebrow mt-0.5" title={s.fractionNote}>
                {s.change}
                {s.fraction != null && s.fraction < 1 ? ` · ${Math.round(s.fraction * 100)}%` : ""}
                {s.status && s.status !== s.change ? ` · ${s.status}` : ""}
              </div>
            </td>
            <td className={`${td} text-right whitespace-nowrap`}>
              <Amount v={s.current.base} className="text-ink-100" />
              <div><Tag kind={s.current.base.kind} /></div>
            </td>
            <td className={`${td} text-right whitespace-nowrap`}>
              <Amount v={s.projected} className="text-ink-100" />
              <div><Tag kind={s.projected.kind} /></div>
            </td>
            <td className={`${td} min-w-[160px]`} title={s.compat.checks.map((c) => `${c.label}: ${c.reason}`).join("\n") || undefined}>
              {s.compat.score != null ? (
                <>
                  <span className="flex items-center gap-2 text-ink-100">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${COMPAT_DOT[s.compat.status]}`} />
                    <span className={`tabular ${s.compat.status === "gaps" ? "text-accent" : ""}`}>{s.compat.score}%</span>
                  </span>
                  <div className="eyebrow mt-0.5">{s.compat.label}</div>
                </>
              ) : (
                <span className="flex items-start gap-2 text-ink-100">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 mt-2 ${COMPAT_DOT[s.compat.status]}`} />
                  {s.compat.label}
                </span>
              )}
            </td>
            <td className={td}>{s.effort ?? "—"}</td>
            <td className={td} title={s.riskWhy.join(" · ") || "No risk factor found"}>
              <span className="flex items-center gap-2 text-ink-100">
                <span className={`h-1.5 w-1.5 rounded-full ${RISK_DOT[s.risk]}`} />
                <span className={s.risk === "Low" ? "" : "text-accent"}>{s.risk}</span>
              </span>
            </td>
            <td className={td} title={s.confidenceWhy}>{CONF[s.confidence]}</td>
          </tr>
        ))}
      </Table>

      <Panel title="What depends on it">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-6">
          <Chips title="Applications" items={r.applications} />
          <Chips title="Processes" items={r.processes} />
          <Chips title="Teams" items={r.teams} />
          <Chips title="Data" items={r.data} />
        </div>
      </Panel>

      {r.contracts.length > 0 && (
        <Table title="Contracts and renewals" columns={["AI system", "Billing", "Renewal", { label: "Committed until renewal", className: "text-right" }]}>
          {r.contracts.map((c) => (
            <tr key={c.systemId}>
              <td className={`${td} text-ink-100`}>{c.system}</td>
              <td className={`${td} text-ink-400 capitalize`}>{c.billingCycle ?? "—"}</td>
              <td className={`${td} tabular`}>{c.renewalDate ? <>{c.renewalDate} <span className="eyebrow ml-1">in {c.inDays} days</span></> : <span className="text-ink-400">Not known</span>}</td>
              <td className={`${td} text-right`}>
                <Amount v={c.committed} className="text-ink-100" />
              </td>
            </tr>
          ))}
        </Table>
      )}

      {r.notes.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm text-ink-400 px-1">
          {r.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}

      <details className="rounded-xl border border-line bg-panel animate-rise group">
        <summary className="cursor-pointer list-none select-none bg-ink bar-head rounded-xl group-open:rounded-b-none px-5 py-3 text-sm font-bold text-ink-100">Show calculation</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bar-thead text-left font-mono uppercase text-[11px] tracking-[0.04em] text-ink-400 bg-ink border-b border-line">
                <th className="px-5 py-2.5 font-normal">Item</th>
                <th className="px-3 py-2.5 font-normal text-right">Value</th>
                <th className="px-3 py-2.5 font-normal">Type</th>
                <th className="px-5 py-2.5 font-normal">Basis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.calc.map((c, i) => (
                <tr key={i} className="align-top">
                  <td className="px-5 py-2.5 text-ink-100 whitespace-nowrap">{c.label}</td>
                  <td className="px-3 py-2.5 text-right tabular text-ink-100 whitespace-nowrap">{c.value}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap"><Tag kind={c.kind} /></td>
                  <td className="px-5 py-2.5 text-xs text-ink-400 sm:min-w-[320px]">{c.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.systems.some((s) => s.compat.checks.length || s.alternatives?.length) && (
          <div className="border-t border-line px-5 py-4 grid md:grid-cols-2 gap-5">
            {r.systems.filter((s) => s.compat.checks.length || s.alternatives?.length).map((s) => (
              <div key={s.id} className="min-w-0">
                <div className="text-sm font-bold text-ink-100 mb-1.5">
                  {s.name}
                  {s.compat.target ? <span className="font-normal text-ink-400"> → {s.compat.target}</span> : null}
                </div>
                <ul className="flex flex-col gap-1">
                  {s.compat.checks.map((c) => (
                    <li key={c.label} className="grid grid-cols-[1fr_40px] gap-3 text-xs">
                      <span className="text-ink-400"><span className="text-ink-100">{c.label}</span> · {c.reason}</span>
                      <span className="text-right tabular text-ink-100">{c.score == null ? "—" : c.score}</span>
                    </li>
                  ))}
                </ul>
                {s.alternatives && s.alternatives.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {s.alternatives.map((a) => (
                      <li key={a.name} className="text-xs text-ink-400">
                        <span className="text-ink-100">{a.name}</span> · {a.provider} · fit {a.compatibility}% · {a.effort} effort · <Amount v={a.monthly} /> a month
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-line px-5 py-3 text-xs text-ink-400">Observed: billed. Calculated: arithmetic on billed amounts. Estimated: catalog list prices or a stated assumption. Same inputs always give the same result.</div>
      </details>

      {saveAction && (
        <form action={saveAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="query" value={query} />
          <input type="hidden" name="title" value={r.title} />
          <input name="name" defaultValue={r.title} maxLength={80} className="field w-full sm:w-72" aria-label="Scenario name" />
          <button className="btn btn-secondary">Save scenario</button>
        </form>
      )}
    </>
  );
}

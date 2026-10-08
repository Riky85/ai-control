import Link from "next/link";
import { Panel } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import { currentSession } from "@/lib/auth";
import { loadEstateCached, chainOf, impactOf, nodeKey, type GEdge, type GNode, type EstateData } from "@/lib/estate/graph";
import { capLabel, type Alternative } from "@/lib/estate/replaceability";
import { createProcessAction, createApplicationAction, linkDependencyAction, reviewEdgeAction, saveProfileAction, recordEvaluationAction } from "@/lib/estate-actions";
import { SURFACE_LABEL } from "@/lib/estate/portability";
import type { SystemRow } from "@/lib/estate/assess";
import type { Replaceability } from "@/lib/estate/replaceability";

/** Link all'Impact Simulator per questo AI system. */
function impactLinkFor(row: SystemRow, repl: Replaceability): string {
  const primary = [...row.uses].sort((a, b) => (b.share ?? 0) - (a.share ?? 0))[0];
  const from = primary?.modelId ?? null;
  if (from && repl.best?.type === "model") return `/impact?s=replace-model&from=${encodeURIComponent(from)}&to=${encodeURIComponent(repl.best.id)}&system=${encodeURIComponent(row.id)}`;
  if (from) return `/impact?s=replace-model&from=${encodeURIComponent(from)}&system=${encodeURIComponent(row.id)}`;
  return `/impact?s=remove-system&system=${encodeURIComponent(row.id)}`;
}

/**
 * AI system: Dependencies (catena a monte e a valle), Replaceability ed Exit readiness.
 * Componenti server separati, inseriti nella pagina dell'AI con una riga.
 */

const SOURCE: Record<string, string> = { observed: "Observed", declared: "Declared", inferred: "Inferred", catalog: "Catalog" };
const REL: Record<string, string> = { uses: "Uses", calls: "Calls", reads: "Reads", owned_by: "Owned by", subscribes: "Subscribes to", provided_by: "Provided by", runs_on: "Runs on", made_by: "Made by", hosted_by: "Hosted by", sold_by: "Sold by" };
const TYPE: Record<string, string> = { process: "Process", application: "Application", system: "AI system", model: "Model", provider: "Provider", deployment: "Deployment", data: "Data", team: "Team", person: "Owner", product: "Product" };
const INPUT = "field";
const pct = (n: number) => `${Math.round(n * 100)}%`;

const isAdmin = () => {
  const r = currentSession()?.role;
  return r === "ADMIN" || r === "OWNER";
};

function Provenance({ e }: { e: GEdge }) {
  const label = SOURCE[e.source] ?? e.source;
  return (
    <span title={e.evidence ?? undefined} className={`eyebrow ${e.source === "inferred" && e.status !== "confirmed" ? "!text-accent" : ""}`}>
      {e.status === "confirmed" && e.source === "inferred" ? "Confirmed" : label}
    </span>
  );
}

function ReviewButtons({ e, back }: { e: GEdge; back: string }) {
  if (e.source !== "inferred" || e.status === "confirmed" || !e.rowId || e.table === "catalog") return null;
  return (
    <span className="flex gap-1">
      {(["confirm", "reject"] as const).map((d) => (
        <form key={d} action={reviewEdgeAction}>
          <input type="hidden" name="table" value={e.table} />
          <input type="hidden" name="id" value={e.rowId!} />
          <input type="hidden" name="decision" value={d} />
          <input type="hidden" name="back" value={back} />
          <button className="btn btn-ghost btn-sm">{d === "confirm" ? "Confirm" : "Reject"}</button>
        </form>
      ))}
    </span>
  );
}

function Row({ rel, node, e, extra, back, admin }: { rel: string; node: GNode; e: GEdge; extra?: string | null; back: string; admin: boolean }) {
  const name = node.href ? (
    <Link href={node.href} className="text-ink-100 hover:underline">{node.label}</Link>
  ) : (
    <span className="text-ink-100">{node.label}</span>
  );
  return (
    <li className="flex items-center gap-3 px-5 py-2.5 text-sm">
      <span className="w-24 shrink-0 eyebrow">{rel}</span>
      <span className="flex-1 min-w-0 truncate">
        {name}
        <span className="text-ink-400"> · {TYPE[node.type]}{extra ? ` · ${extra}` : ""}</span>
      </span>
      <Provenance e={e} />
      {admin && <ReviewButtons e={e} back={back} />}
    </li>
  );
}

export async function AssetDependencies({ assetId, orgId }: { assetId: string; orgId: string }) {
  return <DependenciesPanel est={await loadEstateCached(orgId)} assetId={assetId} admin={isAdmin()} />;
}

/** Corpo della sezione "Dependencies" (dati già caricati). */
export function DependenciesPanel({ est, assetId, admin }: { est: EstateData; assetId: string; admin: boolean }) {
  const key = nodeKey("system", assetId);
  if (!est.graph.nodes.has(key)) return null;
  const back = `/assets/${assetId}`;
  const { upstream, downstream, providers } = chainOf(est.graph, key);
  // Secondo livello a monte: processi che usano le applicazioni che chiamano questa AI.
  const procs = upstream.flatMap((u) => (u.node.type === "application" ? (est.graph.in.get(u.node.key) ?? []).map((e) => ({ edge: e, node: est.graph.nodes.get(e.from)! })) : [])).filter((x) => x.node);
  const impact = impactOf(est.graph, key);
  const deps = downstream.filter((d) => d.edge.relation !== "runs_on");
  const runsOn = new Map(downstream.filter((d) => d.edge.relation === "runs_on").map((d) => [d.edge.useId, d.node.label]));
  const linkable = [...est.processes.map((p) => ({ v: `process:${p.id}`, l: `Process · ${p.name}` })), ...est.applications.map((a) => ({ v: `application:${a.id}`, l: `Application · ${a.name}` }))];

  return (
    <Panel
      flush
      title="Dependencies"
      subtitle={impact && (impact.processes.length || impact.applications.length) ? `${impact.processes.length} process${impact.processes.length === 1 ? "" : "es"} · ${impact.applications.length} app${impact.applications.length === 1 ? "" : "s"}` : undefined}
      footer={
        admin ? (
          <details className="w-full group">
            <summary className="cursor-pointer list-none eyebrow hover:!text-ink-100 select-none">Link a process or application</summary>
            <div className="grid sm:grid-cols-3 gap-3 mt-3">
              {linkable.length > 0 && (
                <form action={linkDependencyAction} className="flex flex-col gap-2">
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="to" value={`system:${assetId}`} />
                  <select name="from" className={INPUT} aria-label="Existing">
                    {linkable.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                  <button className="btn btn-secondary btn-sm">Link existing</button>
                </form>
              )}
              <form action={createProcessAction} className="flex flex-col gap-2">
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="to" value={`system:${assetId}`} />
                <input name="name" required maxLength={120} placeholder="New process, e.g. Customer support" className={INPUT} />
                <select name="criticality" defaultValue="medium" className={INPUT} aria-label="Criticality">
                  {["low", "medium", "high", "critical"].map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)} criticality</option>)}
                </select>
                <button className="btn btn-secondary btn-sm">Add process</button>
              </form>
              <form action={createApplicationAction} className="flex flex-col gap-2">
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="to" value={`system:${assetId}`} />
                <input name="name" required maxLength={120} placeholder="New application, e.g. Zendesk" className={INPUT} />
                <select name="kind" defaultValue="saas" className={INPUT} aria-label="Kind">
                  <option value="saas">SaaS</option>
                  <option value="internal">Internal</option>
                </select>
                <button className="btn btn-secondary btn-sm">Add application</button>
              </form>
            </div>
          </details>
        ) : undefined
      }
    >
      <ul className="divide-y divide-line">
        {[...procs, ...upstream].map((u) => <Row key={u.edge.id + u.node.key} rel="Used by" node={u.node} e={u.edge} back={back} admin={admin} />)}
        {deps.map((d) => (
          <Row
            key={d.edge.id}
            rel={REL[d.edge.relation] ?? d.edge.relation}
            node={d.node}
            e={d.edge}
            back={back}
            admin={admin}
            extra={[d.edge.share != null && d.edge.share < 1 ? pct(d.edge.share) : null, d.edge.useId ? runsOn.get(d.edge.useId) ?? null : null].filter(Boolean).join(" · ") || d.node.sub}
          />
        ))}
        {providers.map((p) => <Row key={p.node.key + p.edge.relation} rel={REL[p.edge.relation] ?? p.edge.relation} node={p.node} e={p.edge} back={back} admin={false} extra={`via ${p.via.label}`} />)}
        {upstream.length + deps.length === 0 && <li className="px-5 py-4 text-sm text-ink-400" title="They appear from Gateway logs, cloud billing and connectors.">No dependencies yet.</li>}
      </ul>
    </Panel>
  );
}

const CONF: Record<string, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

function AltRow({ a, current }: { a: Alternative; current: number | null }) {
  return (
    <tr>
      <td className="px-5 py-2.5">
        <div className="text-ink-100" title={a.gaps.slice(0, 2).join(", ") || undefined}>{a.name}</div>
        <div className="eyebrow mt-0.5">{[a.providerName, a.inUse ? "in use" : null].filter(Boolean).join(" · ")}</div>
      </td>
      <td className="px-3 py-2.5 text-right tabular text-ink-100" title={`Confidence ${CONF[a.confidence]} · ${a.tested ? "Tested" : "Not tested"}`}>{a.compatibility}%</td>
      <td className="px-3 py-2.5 text-ink-400">{a.effort}</td>
      <td className="px-5 py-2.5 text-right tabular" title={a.estimateBasis}>
        {a.estimatedMonthlyEur != null ? <span className="text-ink-100">≈ {fmtEur(a.estimatedMonthlyEur)}</span> : <span className="text-ink-400">Unknown</span>}
        {a.savingEur != null && current != null && <div className={`text-xs ${a.savingEur > 0 ? "text-steady" : "text-ink-400"}`}>{a.savingEur > 0 ? `saves ≈ ${fmtEur(a.savingEur)}` : `costs ≈ ${fmtEur(-a.savingEur)} more`}</div>}
      </td>
    </tr>
  );
}

const STATUS_TONE: Record<string, string> = { "Not ready": "bg-alarm", "Partially ready": "bg-accent", Ready: "bg-steady", "Production-ready": "bg-steady" };

export async function AssetReplaceability({ assetId, orgId }: { assetId: string; orgId: string }) {
  return <ReplaceabilityPanel est={await loadEstateCached(orgId)} assetId={assetId} admin={isAdmin()} />;
}

/** Corpo di "Replaceability" + riga "Exit readiness" (dati già caricati). */
export function ReplaceabilityPanel({ est, assetId, admin }: { est: EstateData; assetId: string; admin: boolean }) {
  const a = est.assessments.get(assetId);
  const row = est.rows.find((r) => r.id === assetId);
  if (!a || !row) return null;
  const { repl, exit, fallback } = a;
  const back = `/assets/${assetId}`;
  const p = row.profile;
  const capKeys = ["toolCalling", "structuredOutput", "mcp", "reasoning", "vision", "audio", "caching", "batch", "streaming", "embeddings", "fineTuning"];
  const candidates = repl.all.slice(0, 12);

  return (
    <>
      <Panel
        flush
        title="Replaceability"
        subtitle={repl.applicable ? (repl.kind === "seat" ? "Seat product" : repl.current.label) : undefined}
        footer={
          admin ? (
            <details className="w-full">
              <summary className="cursor-pointer list-none eyebrow hover:!text-ink-100 select-none">Requirements and tests</summary>
              <div className="grid sm:grid-cols-2 gap-5 mt-3">
                <form action={saveProfileAction} className="flex flex-col gap-2 text-xs text-ink-400">
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="assetId" value={assetId} />
                  <span className="eyebrow" title="Leave empty to assume everything the current model does">Needs</span>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {capKeys.map((k) => (
                      <label key={k} className="flex items-center gap-1.5 text-ink-100">
                        <input type="checkbox" name="required" value={k} defaultChecked={p?.requiredCapabilities.includes(k)} /> {capLabel(k)}
                      </label>
                    ))}
                  </div>
                  <label className="flex flex-col gap-1">Context needed (K tokens)<input name="minContextK" type="number" min={1} defaultValue={p?.minContextTokens ? Math.round(p.minContextTokens / 1000) : ""} className={INPUT} /></label>
                  <label className="flex flex-col gap-1">Provider-specific features used<input name="providerSpecific" maxLength={300} defaultValue={p?.providerSpecific.join(", ") ?? ""} placeholder="e.g. Assistants API, fine-tuned model" className={INPUT} /></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">EU data residency
                      <select name="eu" defaultValue={p?.euResidencyRequired == null ? "" : p.euResidencyRequired ? "yes" : "no"} className={INPUT}><option value="">Not set</option><option value="yes">Required</option><option value="no">Not required</option></select>
                    </label>
                    <label className="flex flex-col gap-1">Data export
                      <select name="export" defaultValue={p?.dataExport == null ? "" : p.dataExport ? "yes" : "no"} className={INPUT}><option value="">Not known</option><option value="yes">Available</option><option value="no">Not available</option></select>
                    </label>
                  </div>
                  <button className="btn btn-secondary btn-sm">Save requirements</button>
                </form>
                {candidates.length > 0 && (
                  <form action={recordEvaluationAction} className="flex flex-col gap-2 text-xs text-ink-400">
                    <input type="hidden" name="back" value={back} />
                    <input type="hidden" name="assetId" value={assetId} />
                    <input type="hidden" name="candidateType" value={repl.kind === "seat" ? "product" : "model"} />
                    <span className="eyebrow">Record a test you ran on real tasks</span>
                    <select name="candidateId" className={INPUT} aria-label="Alternative">
                      {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1">Tasks tested<input name="tasks" type="number" min={1} required className={INPUT} /></label>
                      <label className="flex flex-col gap-1">Passed (%)<input name="passRate" type="number" min={0} max={100} required className={INPUT} /></label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select name="method" className={INPUT} aria-label="Method"><option value="eval suite">Eval suite</option><option value="shadow traffic">Shadow traffic</option><option value="pilot">Pilot</option></select>
                      <select name="passed" className={INPUT} aria-label="Result"><option value="yes">Good enough</option><option value="no">Not good enough</option></select>
                    </div>
                    <button className="btn btn-secondary btn-sm">Record test</button>
                  </form>
                )}
              </div>
            </details>
          ) : undefined
        }
      >
        {!repl.applicable ? (
          <p className="px-5 py-4 text-sm text-ink-400">{repl.reason ?? "Not enough data yet."}</p>
        ) : (
          <div className="flex flex-col">
            <div className="grid sm:grid-cols-[180px_1fr] gap-x-6 gap-y-4 px-5 py-4">
              <div>
                <div className={`font-display text-[40px] leading-none font-light tracking-[-0.04em] tabular ${repl.score != null && repl.score < 40 ? "text-accent" : "text-ink-100"}`}>
                  {repl.score}
                  <span className="text-base tracking-normal text-ink-400 font-normal ml-0.5">/100</span>
                </div>
                <div className="eyebrow mt-3">Migration effort <span className="!text-ink-100">{repl.effort}</span></div>
                {repl.limiters.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1">
                    {repl.limiters.map((l) => <li key={l} className="text-xs text-accent">{l}</li>)}
                  </ul>
                )}
              </div>
              <ul className="flex flex-col gap-2 min-w-0">
                {repl.components.map((c) => (
                  <li key={c.key} className="grid grid-cols-[1fr_44px] items-baseline gap-3 text-sm max-w-md">
                    <span className="text-ink-100" title={c.reason}>{c.label}</span>
                    <span className={`text-right tabular ${c.score != null && c.score < 40 ? "text-accent" : "text-ink-100"}`}>{c.score == null ? "—" : c.score}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bar-thead text-left font-mono uppercase text-[11px] tracking-[0.04em] text-ink-400 bg-ink border-b border-line">
                    <th className="px-5 py-2.5 font-normal">Alternatives</th>
                    <th className="px-3 py-2.5 font-normal text-right">Fit</th>
                    <th className="px-3 py-2.5 font-normal">Effort</th>
                    <th className="px-5 py-2.5 font-normal text-right" title={`Estimates from list prices${repl.current.surface ? ` · current API: ${SURFACE_LABEL[repl.current.surface]}` : ""} · ranked by compatibility, not price${repl.required.assumed ? " · needs assumed from the current model" : ""}`}>A month</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {repl.alternatives.map((x) => <AltRow key={x.id} a={x} current={repl.current.costEur} />)}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>

      <div className={`rounded-xl border border-line bg-panel px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-2 animate-rise ${exit.status === "Not ready" || exit.status === "Partially ready" ? "tile-warn" : ""}`}>
        <span className="text-sm font-bold text-ink-100">Exit readiness</span>
        <span className="flex items-center gap-2 text-sm text-ink-100 tabular" title={exit.blockers.join(" · ") || undefined}>
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_TONE[exit.status]}`} />
          <span className="text-lg font-light tracking-[-0.03em]">{exit.score}<span className="text-xs tracking-normal text-ink-400">/100</span></span>
          <span className={`eyebrow ${exit.status === "Not ready" || exit.status === "Partially ready" ? "!text-accent" : ""}`}>{exit.status}</span>
        </span>
        {fallback.configured && <span className="eyebrow">Fallback: {fallback.configured}</span>}
        {/* Impact Simulator: modello principale → alternativa più compatibile (mai la più economica); senza modelli, togliere l'AI. */}
        <Link href={impactLinkFor(row, repl)} className="btn btn-secondary btn-sm sm:ml-auto">
          What happens if I change this?
        </Link>
      </div>
    </>
  );
}

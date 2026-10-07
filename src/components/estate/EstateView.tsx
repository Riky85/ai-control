import { StatCard, Panel } from "@/components/ui";
import { currentSession } from "@/lib/auth";
import { loadEstateCached, toParts, type EstateData } from "@/lib/estate/graph";
import { createProcessAction, createApplicationAction, reviewEdgeAction } from "@/lib/estate-actions";
import EstateGraphView from "@/components/estate/EstateGraphView";

/** Vista "Graph" dell'elenco "Your AI": metriche di dipendenza, grafo, dichiarazioni (solo admin). */
export default async function EstateView({ orgId }: { orgId: string }) {
  const role = currentSession()?.role;
  return <EstateViewBody est={await loadEstateCached(orgId)} admin={role === "ADMIN" || role === "OWNER"} />;
}

/** Corpo della vista (dati già caricati). */
export function EstateViewBody({ est, admin }: { est: EstateData; admin: boolean }) {
  const back = "/?view=graph#your-ai";
  const m = est.metrics;
  const systems = est.rows.map((r) => ({ id: r.id, name: r.name }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Provider concentration" value={m.providerConcentration ? `${Math.round(m.providerConcentration.share * 100)}%` : "—"} hint={m.providerConcentration ? m.providerConcentration.label : undefined} tone={m.providerConcentration && m.providerConcentration.share >= 0.6 ? "signal" : undefined} href="/providers" />
        <StatCard label="No owner" value={String(m.unowned)} />
        <StatCard label="High dependencies" value={String(m.highDependencies)} hint={m.highDependencies ? "Not ready to exit" : undefined} tone={m.highDependencies ? "signal" : undefined} />
      </div>

      <EstateGraphView parts={toParts(est.graph)} concentration={m.providerConcentration} />

      {admin && est.pending.length > 0 && (
        <Panel flush title="Links to check" subtitle={`${est.pending.length}`}>
          <ul className="divide-y divide-line">
            {est.pending.slice(0, 20).map((p) => (
              <li key={p.table + p.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                <span className="flex-1 min-w-0 truncate text-ink-100">
                  {p.from} <span className="text-ink-400">{p.relation.replace(/_/g, " ")}</span> {p.to}
                  {p.evidence && <span className="text-ink-400"> · {p.evidence}</span>}
                </span>
                {(["confirm", "reject"] as const).map((d) => (
                  <form key={d} action={reviewEdgeAction}>
                    <input type="hidden" name="table" value={p.table} />
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="decision" value={d} />
                    <input type="hidden" name="back" value={back} />
                    <button className="btn btn-ghost btn-sm">{d === "confirm" ? "Confirm" : "Reject"}</button>
                  </form>
                ))}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {admin && (
        <details className="rounded-xl border border-line bg-panel px-5 py-4">
          <summary className="cursor-pointer list-none text-sm text-ink-400 hover:text-ink-100 select-none">Add a process or application</summary>
          <div className="grid sm:grid-cols-2 gap-4 mt-3">
            <form action={createProcessAction} className="flex flex-col gap-2">
              <input type="hidden" name="back" value={back} />
              <input name="name" required maxLength={120} placeholder="Process, e.g. Customer support" className="field" />
              <select name="criticality" defaultValue="medium" className="field" aria-label="Criticality">
                {["low", "medium", "high", "critical"].map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)} criticality</option>)}
              </select>
              <select name="to" defaultValue="" className="field" aria-label="Uses">
                <option value="">Uses… (optional)</option>
                {est.applications.map((a) => <option key={a.id} value={`application:${a.id}`}>Application · {a.name}</option>)}
                {systems.map((s) => <option key={s.id} value={`system:${s.id}`}>AI · {s.name}</option>)}
              </select>
              <button className="btn btn-secondary btn-sm">Add process</button>
            </form>
            <form action={createApplicationAction} className="flex flex-col gap-2">
              <input type="hidden" name="back" value={back} />
              <input name="name" required maxLength={120} placeholder="Application, e.g. Zendesk" className="field" />
              <input name="vendor" maxLength={120} placeholder="Vendor (optional)" className="field" />
              <select name="kind" defaultValue="saas" className="field" aria-label="Kind">
                <option value="saas">SaaS</option>
                <option value="internal">Internal</option>
              </select>
              <select name="to" defaultValue="" className="field" aria-label="Uses AI">
                <option value="">Uses AI… (optional)</option>
                {systems.map((s) => <option key={s.id} value={`system:${s.id}`}>{s.name}</option>)}
              </select>
              <button className="btn btn-secondary btn-sm">Add application</button>
            </form>
          </div>
        </details>
      )}
    </div>
  );
}

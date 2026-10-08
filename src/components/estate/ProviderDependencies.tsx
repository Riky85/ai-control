import Link from "next/link";
import { Table, td } from "@/components/ui";
import { loadEstateCached, dependencyFraction, bestCost, type EstateData } from "@/lib/estate/graph";
import { providerExit } from "@/lib/estate/exit-readiness";

const TONE: Record<string, string> = { "Not ready": "bg-alarm", "Partially ready": "bg-accent", Ready: "bg-steady", "Production-ready": "bg-steady" };

/** Fornitori: chi dipende da ciascuno (anche via modello o deployment) ed Exit readiness. */
export default async function ProviderDependencies({ orgId }: { orgId: string }) {
  return <ProviderDependenciesTable est={await loadEstateCached(orgId)} />;
}

/** Tabella dei fornitori (dati già caricati). */
export function ProviderDependenciesTable({ est }: { est: EstateData }) {
  const rows = est.concentration.rows.map((c) => {
    const memo = new Map<string, boolean>();
    const deps = est.rows
      .map((r) => {
        const k = `system:${r.id}`;
        const f = dependencyFraction(est.graph, k, c.providerKey, memo);
        return { r, f, weight: bestCost(est.graph.cost.get(k)) * f };
      })
      .filter((x) => x.f > 0);
    const exit = providerExit(deps.map((d) => ({ exit: est.assessments.get(d.r.id)!.exit, weight: d.weight })));
    return { c, deps, exit };
  });
  if (!rows.length) return null;
  return (
    <Table title="Dependencies" columns={["Provider", "AI", { label: "Share", className: "text-right" }, "Exit readiness"]}>
      {rows.map(({ c, deps, exit }) => (
        <tr key={c.providerKey}>
          <td className={`${td} font-medium text-ink-100`}>
            <Link href="/estate/graph" className="hover:underline">{c.label}</Link>
            {/* Impact Simulator: cosa si ferma se il fornitore non risponde (solo fornitori del catalogo). */}
            {!c.providerKey.startsWith("provider:name:") && (
              <Link href={`/impact?s=outage&provider=${encodeURIComponent(c.providerKey.slice("provider:".length))}`} className="block eyebrow hover:!text-ink-100 transition-colors mt-0.5">
                Simulate [→]
              </Link>
            )}
          </td>
          <td className={td}>
            <div className="flex flex-wrap gap-1.5">
              {deps.slice(0, 6).map((d) => (
                <Link key={d.r.id} href={`/assets/${d.r.id}`} className="inline-flex items-center rounded-[2px] border border-line px-1.5 py-0.5 font-mono uppercase text-[10px] tracking-[0.05em] text-ink-400 hover:text-ink-100 hover:border-ink-400 transition-colors">
                  {d.r.name}{d.f < 1 ? ` · ${Math.round(d.f * 100)}%` : ""}
                </Link>
              ))}
              {deps.length > 6 && <span className="eyebrow">+{deps.length - 6}</span>}
            </div>
          </td>
          <td className={`${td} text-right tabular text-ink-100`}>{est.concentration.total > 0 ? `${Math.round(c.share * 100)}%` : "—"}</td>
          <td className={`${td} whitespace-nowrap`}>
            <span className="flex items-center gap-2 text-sm text-ink-100 tabular" title={exit.blockers.slice(0, 2).join(" · ") || undefined}>
              <span className={`h-1.5 w-1.5 rounded-full ${TONE[exit.status]}`} />
              {exit.score}
              <span className={`eyebrow ${exit.status === "Not ready" || exit.status === "Partially ready" ? "!text-accent" : ""}`}>{exit.status}</span>
            </span>
          </td>
        </tr>
      ))}
    </Table>
  );
}

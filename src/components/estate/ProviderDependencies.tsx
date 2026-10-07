import Link from "next/link";
import { Table, td } from "@/components/ui";
import { loadEstateCached, dependencyFraction, bestCost, type EstateData } from "@/lib/estate/graph";
import { providerExit } from "@/lib/estate/exit-readiness";

const TONE: Record<string, string> = { "Not ready": "bg-alarm", "Partially ready": "bg-signal", Ready: "bg-steady", "Production-ready": "bg-steady" };

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
            <Link href={`/?view=graph#your-ai`} className="hover:underline">{c.label}</Link>
          </td>
          <td className={td}>
            <div className="flex flex-wrap gap-1.5">
              {deps.slice(0, 6).map((d) => (
                <Link key={d.r.id} href={`/assets/${d.r.id}`} className="text-xs rounded-full border border-line px-2 py-0.5 text-ink-400 hover:text-ink-100">
                  {d.r.name}{d.f < 1 ? ` · ${Math.round(d.f * 100)}%` : ""}
                </Link>
              ))}
              {deps.length > 6 && <span className="text-xs text-ink-400">+{deps.length - 6}</span>}
            </div>
          </td>
          <td className={`${td} text-right tabular text-ink-100`}>{est.concentration.total > 0 ? `${Math.round(c.share * 100)}%` : "—"}</td>
          <td className={`${td} whitespace-nowrap`}>
            <span className="flex items-center gap-2 text-sm text-ink-100 tabular" title={exit.blockers.slice(0, 2).join(" · ") || undefined}>
              <span className={`h-2 w-2 rounded-full ${TONE[exit.status]}`} />
              {exit.score} · {exit.status}
            </span>
          </td>
        </tr>
      ))}
    </Table>
  );
}

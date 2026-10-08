import Link from "next/link";
import { Table, td } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import type { Opportunity } from "@/lib/opportunities/types";
import { CategoryPill } from "@/components/opportunities/parts";

/**
 * "What to do next" della home: una tabella semplice (opportunità, tipo, impegno, valore)
 * con la stessa grafica delle altre tabelle. Ogni riga apre il dettaglio in /opportunities.
 */
export default function NextActions({ list, total }: { list: Opportunity[]; total: number }) {
  if (!list.length) return null;
  return (
    <Table
      title="What to do next"
      action={<Link href="/opportunities" className="eyebrow hover:!text-ink-100 transition-colors">All {total} [→]</Link>}
      columns={["Opportunity", "Type", "Effort", { label: "Saving", className: "text-right" }, ""]}
    >
      {list.map((o) => {
        const href = `/opportunities?open=${encodeURIComponent(o.key)}`;
        const planned = o.status === "accepted" || o.status === "in_progress";
        return (
          <tr key={o.key} className="hover:bg-ink-100/[0.02] transition-colors">
            <td className={`${td} max-w-0 w-full`}>
              <Link href={href} className="block group min-w-0">
                <span className="block text-ink-100 truncate group-hover:underline underline-offset-4 decoration-ink-100/30">{o.title}</span>
                <span className="block text-xs text-ink-400 truncate mt-0.5">{planned ? "Planned · " : ""}{o.reason}</span>
              </Link>
            </td>
            <td className={`${td} whitespace-nowrap`}>
              <CategoryPill category={o.category} />
            </td>
            <td className={`${td} whitespace-nowrap text-ink-400`}>{o.effort}</td>
            <td className={`${td} whitespace-nowrap text-right tabular`}>
              {o.savings && o.savings.eur >= 1 ? (
                <span className="text-ink-100">
                  {o.savings.kind === "estimated" ? "≈ " : ""}
                  {fmtEur(o.savings.eur)}
                  <span className="text-xs text-ink-400 ml-0.5">/mo</span>
                </span>
              ) : (
                <span className="text-ink-400">—</span>
              )}
            </td>
            <td className={`${td} whitespace-nowrap text-right`}>
              <Link href={href} className="btn btn-ghost btn-sm">Review</Link>
            </td>
          </tr>
        );
      })}
    </Table>
  );
}

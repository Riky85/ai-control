import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { PageHeader, Table, td } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";
import { loadMarketFeed, otherChangesCount } from "@/lib/market/service";
import { changeHeadline, impactLine, simulateHref } from "@/lib/market/format";
import { fmtDay } from "@/lib/pricing/service";

export const dynamic = "force-dynamic";

const CONF: Record<string, string> = { HIGH: "High confidence", MEDIUM: "Medium confidence", LOW: "Low confidence" };

// "Il mercato AI è cambiato: ci riguarda?" Solo i cambiamenti che toccano davvero l'AI estate dell'azienda.
export default async function MarketChangesPage() {
  const orgId = currentOrgId();
  const now = new Date();
  const [rows, others] = await Promise.all([loadMarketFeed(orgId, { now }), otherChangesCount(orgId)]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Price changes" subtitle="Market changes that affect your AI" />
      <Table
        columns={["Provider", "Model", "Change", "Impact on your AI", { label: "", className: "w-[1%]" }]}
        empty={rows.length === 0 ? "No market change affects your AI right now." : false}
        footer={others > 0 ? <span className="text-ink-400">{others} other change{others === 1 ? "" : "s"} in the catalog don&apos;t affect your AI.</span> : undefined}
      >
        {rows.map((r) => {
          const h = changeHeadline(r.change, now);
          const sim = simulateHref(r.change);
          return (
            <tr key={r.id}>
              <td className={`${td} whitespace-nowrap`}>
                <span className="flex items-center gap-2.5 text-ink-100">
                  <VendorBadge vendor={h.provider} name={h.provider} size={24} />
                  {h.provider}
                </span>
              </td>
              <td className={`${td} text-ink-100 whitespace-nowrap`}>{h.subject}</td>
              <td className={td}>
                <div className="text-ink-100 font-medium">{h.change}</div>
                <div className="text-xs text-ink-400 mt-0.5">
                  {r.change.sourceUrl ? (
                    <a href={r.change.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-ink-100">Source ↗</a>
                  ) : null}
                  {" · "}
                  {CONF[r.change.confidence] ?? r.change.confidence} · detected {fmtDay(r.change.detectedAt)}
                </div>
              </td>
              <td className={`${td} text-ink-100`}>{impactLine(r)}</td>
              <td className={`${td} whitespace-nowrap`}>
                <div className="flex gap-1 justify-end">
                  <Link href={`/market/${r.change.id}`} className="btn btn-ghost btn-sm">See systems</Link>
                  {sim && <Link href={sim} className="btn btn-ghost btn-sm">Simulate</Link>}
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}

import Link from "next/link";
import { EmptyState, Notice, PageHeader, StatCard, Table, td } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";
import { fmtDate, fmtEur } from "@/lib/format";
import { aiHref } from "@/lib/links";
import type { RenewalMonth } from "@/lib/renewals-calendar";

const left = (n: number) => (n < 0 ? "passed" : n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

/**
 * Calendario dei rinnovi (corpo): numeri in alto, poi un blocco per mese. I dati arrivano già
 * calcolati (pagina reale o pagina di prova).
 */
export default function RenewalsView({
  months,
  stats,
  error,
}: {
  months: RenewalMonth[];
  stats: { renewing90: number; renewing90Eur: number; deadlines30: number; nextDeadline: Date | null; autoRenewOff: number };
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Renewals"
        subtitle="Every contract and subscription renewal"
        action={
          <>
            <a href="/spend/renewals/calendar.ics" className="btn btn-secondary btn-sm" title="Notice deadlines as a calendar file, with a reminder a week before each">
              Export to calendar
            </a>
            <Link href="/opportunities?view=contracts" className="btn btn-ghost btn-sm">Contracts</Link>
          </>
        }
      />
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard label="Renewing in 90 days" value={String(stats.renewing90)} hint={stats.renewing90Eur >= 1 ? `${fmtEur(stats.renewing90Eur)} a year at stake` : "Nothing renews soon"} />
        <StatCard
          label="Notice deadlines in 30 days"
          value={String(stats.deadlines30)}
          hint={stats.nextDeadline ? `Next one ${fmtDate(stats.nextDeadline)}` : "No deadline coming up"}
          tone={stats.deadlines30 > 0 ? "warn" : undefined}
        />
        <StatCard label="Auto-renew off" value={String(stats.autoRenewOff)} hint={stats.autoRenewOff ? "These contracts end unless renewed" : "Every known contract renews by itself"} />
      </div>

      {months.length === 0 ? (
        <EmptyState
          text="No renewal in the next 12 months."
          action={<Link href="/opportunities?view=contracts" className="btn btn-secondary">Add contract dates</Link>}
        />
      ) : (
        months.map((m) => (
          <Table
            key={m.key}
            title={m.label}
            note={`${m.rows.length} renewal${m.rows.length === 1 ? "" : "s"}${m.yearlyEur >= 1 ? ` · ${fmtEur(m.yearlyEur)} a year` : ""}`}
            columns={["AI system", "Renews / ends on", "Notice deadline", { label: "Yearly cost", className: "text-right" }, "Owner", { label: "", className: "text-right" }]}
          >
            {m.rows.map((r) => (
              <tr key={r.assetId}>
                <td className={td}>
                  <Link href={aiHref(r.assetId)} className="flex items-center gap-3 min-w-0 group">
                    <VendorBadge vendor={r.vendor ?? ""} name={r.name} size={28} />
                    <span className="min-w-0">
                      <span className="block text-ink-100 font-medium truncate group-hover:underline">{r.name}</span>
                      <span className="block eyebrow mt-0.5">{r.billing} · {r.from === "contract" ? "contract" : "from charges"}</span>
                    </span>
                  </Link>
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  <span className="text-ink-100 tabular">{fmtDate(r.date)}</span>
                  <span className="block eyebrow mt-0.5">{r.endsOnly ? "Ends" : r.autoRenew ? "Renews by itself" : "Renews"}</span>
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {r.noticeBy ? (
                    <>
                      <span className={`tabular ${r.noticeSoon ? "text-accent font-medium" : "text-ink-100"}`}>{fmtDate(r.noticeBy)}</span>
                      <span className={`block eyebrow mt-0.5 ${r.noticeSoon ? "!text-accent" : ""}`}>
                        {r.noticeLeft != null ? left(r.noticeLeft) : ""} · {r.noticeDays} days notice
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
                <td className={`${td} text-right tabular text-ink-100 whitespace-nowrap`}>{r.yearlyEur != null && r.yearlyEur > 0 ? fmtEur(r.yearlyEur) : <span className="text-ink-400">—</span>}</td>
                <td className={`${td} text-ink-400 max-w-[200px] truncate`} title={r.owner ?? undefined}>{r.owner ?? "—"}</td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  <span className="inline-flex items-center gap-1.5">
                    <a href={`/spend/renewals/calendar.ics?asset=${encodeURIComponent(r.assetId)}`} className="btn btn-ghost btn-sm" title="Add a calendar reminder a week before the notice deadline (or the renewal)">
                      Set reminder
                    </a>
                    <Link href={`/negotiate/${encodeURIComponent(r.assetId)}`} className="btn btn-secondary btn-sm">Negotiate</Link>
                  </span>
                </td>
              </tr>
            ))}
          </Table>
        ))
      )}
    </div>
  );
}

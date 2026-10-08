import Link from "next/link";
import { EmptyState, PageHeader, Panel, StatCard, Table, td } from "@/components/ui";
import ExportMenu from "@/components/ExportMenu";
import { VendorBadge } from "@/components/VendorIcon";
import ForecastCard, { type ForecastCardProps } from "@/components/engine/ForecastCard";
import AnomalyList from "@/components/engine/AnomalyList";
import type { Anomaly } from "@/lib/engine/forecast";
import { fmtEur } from "@/lib/format";
import type { SpendBar, SpendOverview } from "@/lib/spend-overview";

export interface PriceChangeRow {
  id: string;
  title: string;
  impact: string;
  annualDeltaEur: number | null;
  simulateHref: string | null;
}

/** Barre orizzontali neutre: etichetta, barra, valore (≈ se in parte stimato). */
function Bars({ rows, total, max = 6, more }: { rows: SpendBar[]; total: number; max?: number; more?: string }) {
  if (!rows.length) return <p className="px-5 py-8 text-center text-sm text-ink-400">No costs yet.</p>;
  const top = rows[0]?.eur || 1;
  return (
    <div className="divide-y divide-line">
      {rows.slice(0, max).map((r) => {
        // Icona dell'AI (fornitore o prodotto) accanto al nome; i team non ne hanno.
        const label = (
          <span className="flex items-center gap-2.5 min-w-0" title={r.note}>
            {r.vendor !== undefined && <VendorBadge vendor={r.vendor} name={r.iconName ?? r.label} size={24} />}
            <span className="text-sm text-ink-100 truncate">{r.label}</span>
          </span>
        );
        return (
          <div key={r.key} className="px-5 py-2.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-4">
            {r.href ? <Link href={r.href} className="min-w-0 hover:underline">{label}</Link> : <span className="min-w-0">{label}</span>}
            <span className="h-1 rounded-full bg-ink-100/[0.08] overflow-hidden">
              <span className="block h-full rounded-full bg-ink-100/70 animate-grow" style={{ width: `${Math.max(2, (r.eur / top) * 100)}%` }} />
            </span>
            <span className="text-sm tabular text-ink-100 text-right w-24">
              {r.estimatedEur >= r.eur - 0.5 && r.eur > 0 ? "≈ " : ""}
              {fmtEur(r.eur)}
              <span className="block font-mono text-[10px] text-ink-400">{total > 0 ? `${Math.round((r.eur / total) * 100)}%` : ""}</span>
            </span>
          </div>
        );
      })}
      {(rows.length > max || more) && <div className="px-5 py-2.5 eyebrow">{rows.length > max ? `+${rows.length - max} more` : ""}{more ? `${rows.length > max ? " · " : ""}${more}` : ""}</div>}
    </div>
  );
}

/** Spend — corpo della pagina (dati già calcolati). */
export default function SpendView({ s, forecast, anomalies, priceChanges }: { s: SpendOverview; forecast: ForecastCardProps | null; anomalies: Anomaly[]; priceChanges: PriceChangeRow[] }) {
  const pct = (n: number) => (s.total > 0 ? `${Math.round((n / s.total) * 100)}%` : "—");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Spend" subtitle="What your AI costs, and why" action={<><Link href="/report" className="btn btn-ghost btn-sm">Monthly report</Link><ExportMenu dataset="assets" /></>} />

      {s.total <= 0 ? (
        <EmptyState text="Add what you pay to see your AI spend." action={<Link href="/sources" className="btn btn-primary">Add a bank statement</Link>} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard label="Monthly AI spend" value={fmtEur(s.total)} hint={`${fmtEur(s.total * 12)} a year · ${s.aiCount} AI`} />
            <StatCard label="Actual" value={fmtEur(s.actual)} hint={`${pct(s.actual)} from bills and invoices`} />
            <StatCard label="Estimated" value={s.estimated >= 1 ? `≈ ${fmtEur(s.estimated)}` : "—"} hint={s.estimated >= 1 ? `${pct(s.estimated)} from list prices` : "Nothing estimated"} tone={s.estimated / s.total >= 0.3 ? "warn" : undefined} href={s.estimated >= 1 ? "/sources" : undefined} />
            <StatCard label="Usage-based" value={fmtEur(s.usage)} hint={`${pct(s.usage)} · fixed ${fmtEur(s.fixed)}`} />
          </div>

          {forecast && <ForecastCard {...forecast} />}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <Panel flush title="By provider">
              <Bars rows={s.byProvider} total={s.total} />
            </Panel>
            <Panel flush title="By model" subtitle="Usage-based AI">
              <Bars rows={s.byModel} total={s.byModel.reduce((t, b) => t + b.eur, 0)} more={s.unattributedModelEur >= 1 ? `${fmtEur(s.unattributedModelEur)} with no model known` : undefined} />
            </Panel>
            <Panel flush title="By AI system">
              <Bars rows={s.bySystem} total={s.total} max={8} />
            </Panel>
            <Panel flush title="By team" subtitle="Split by who uses each AI">
              <Bars rows={s.byTeam} total={s.byTeam.reduce((t, b) => t + b.eur, 0)} max={8} />
            </Panel>
          </div>

          {s.variance.length > 0 && (
            <Table title="Actual vs estimated" note="Bills compared with list price × seats or tokens" columns={["AI", { label: "Actual", className: "text-right" }, { label: "Estimated", className: "text-right" }, { label: "Variance", className: "text-right" }]}>
              {s.variance.slice(0, 8).map((v) => (
                <tr key={v.id}>
                  <td className={td}>
                    <Link href={`/estate/${v.id}`} className="flex items-center gap-3 group min-w-0">
                      <VendorBadge vendor={v.vendor ?? ""} name={v.name} size={28} />
                      <span className="min-w-0">
                        <span className="block text-ink-100 group-hover:underline truncate">{v.name}</span>
                        <span className="block eyebrow mt-0.5 truncate max-w-md" title={`${v.source} · ${v.basis}`}>{v.source}</span>
                      </span>
                    </Link>
                  </td>
                  <td className={`${td} text-right tabular text-ink-100`}>{fmtEur(v.actual)}</td>
                  <td className={`${td} text-right tabular text-ink-400`}>{fmtEur(v.estimated)}</td>
                  <td className={`${td} text-right tabular ${Math.abs(v.pct) >= 0.1 ? "text-accent" : "text-ink-100"}`}>
                    {v.pct > 0 ? "+" : v.pct < 0 ? "−" : ""}
                    {Math.abs(Math.round(v.pct * 1000) / 10)}%
                  </td>
                </tr>
              ))}
            </Table>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <AnomalyList anomalies={anomalies} limit={5} />
            <Panel flush title="Price changes" subtitle="Effect on your AI" action={<Link href="/market" className="eyebrow hover:!text-ink-100 transition-colors">See all [→]</Link>}>
              {priceChanges.length ? (
                <div className="divide-y divide-line">
                  {priceChanges.slice(0, 5).map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                      <Link href={`/market/${p.id}`} className="flex-1 min-w-0 hover:underline">
                        <span className="block text-ink-100 truncate">{p.title}</span>
                        <span className="block text-xs text-ink-400 mt-0.5">{p.impact}</span>
                      </Link>
                      {p.simulateHref && <Link href={p.simulateHref} className="btn btn-ghost btn-sm shrink-0">Simulate impact</Link>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-5 py-8 text-center text-sm text-ink-400">No price change affects your AI right now.</p>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

import Link from "next/link";
import { fmtEur } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { PageHeader, StatCard, Table, td } from "@/components/ui";
import ExportMenu from "@/components/ExportMenu";
import { VendorBadge } from "@/components/VendorIcon";
import { computeSavingsCached, monthlyOf } from "@/lib/savings";
import { savingsByAsset } from "@/components/AiTable";
import PriceIndexCard, { loadPriceIndexCard } from "@/components/engine/PriceIndexCard";
import { EmptyState, Insight } from "@/components/insight";

export const dynamic = "force-dynamic";

// Da chi dipendi e quanto paghi a ciascuno: quota di spesa, AI coinvolte,
// risparmi possibili e rischio di concentrazione.
export default async function ProvidersPage() {
  const orgId = currentOrgId();
  const [{ items, assets }, priceIndex] = await Promise.all([computeSavingsCached(orgId), loadPriceIndexCard(orgId)]);
  const save = savingsByAsset(items);

  const byVendor = new Map<string, typeof assets>();
  for (const a of assets) {
    const key = a.vendor ?? "Unknown";
    byVendor.set(key, [...(byVendor.get(key) ?? []), a]);
  }
  const rows = Array.from(byVendor, ([vendor, list]) => {
    const spend = list.reduce((t, a) => t + (monthlyOf(a)?.eur ?? 0), 0);
    const estimated = list.some((a) => monthlyOf(a)?.estimated);
    const couldSave = list.reduce((t, a) => {
      const s = save.get(a.id);
      return t + (s === -1 ? monthlyOf(a)?.eur ?? 0 : Math.min(s ?? 0, monthlyOf(a)?.eur ?? 0));
    }, 0);
    return { vendor, list, spend, estimated, couldSave };
  }).sort((a, b) => b.spend - a.spend || b.list.length - a.list.length);

  const total = rows.reduce((t, r) => t + r.spend, 0);
  const top = rows[0];
  const topShare = total && top ? Math.round((top.spend / total) * 100) : 0;
  const totalSave = rows.reduce((t, r) => t + r.couldSave, 0);
  // Dall'indice prezzi: le AI per cui paghi un posto più del mercato (o del listino).
  const above = priceIndex.rows.filter((r) => r.verdict === "above");

  if (assets.length === 0)
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Providers" subtitle="Who your company depends on for AI, and how much you pay each one." />
        <EmptyState title="No providers yet" text="Drop a bank statement or invoices — angar finds every AI provider you pay." href="/sources" cta="Add costs" />
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Providers" subtitle="Who your company depends on for AI, and how much you pay each one." action={<ExportMenu dataset="providers" />} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard href="/#your-ai" label="Providers" value={String(rows.length)} hint={`${assets.length} AI in total`} tone="accent" />
        <StatCard href="/?paid=yes#your-ai" label="Monthly spend" value={total ? fmtEur(total) : "—"} hint={total ? `${fmtEur(total * 12)} a year` : "Add a bank statement"} />
        <StatCard
          href={top ? `/?q=${encodeURIComponent(top.vendor)}#your-ai` : "/"}
          label="Biggest dependency"
          value={top ? `${topShare}%` : "—"}
          hint={top ? `of spend on ${top.vendor}` : "—"}
          tone={topShare >= 60 ? "signal" : undefined}
        />
        <StatCard href="/savings" label="Could save" value={totalSave >= 1 ? `${fmtEur(totalSave)}/mo` : "—"} hint={totalSave >= 1 ? `${fmtEur(totalSave * 12)} a year` : "Nothing found"} />
      </div>

      {above.length > 0 && (
        <Insight tone="signal" href={`/assets/${above[0].assetIds[0]}`} cta={`Open ${above[0].name}`}>
          You pay more than the {priceIndex.networkCompanies ? "market" : "list price"} for {above.slice(0, 2).map((r) => r.name).join(" and ")}
          {above.length > 2 ? ` and ${above.length - 2} more` : ""} — worth asking for a better price.
        </Insight>
      )}
      {total > 0 && (
        <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4 animate-rise">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-ink-100">Share of AI spend</h2>
            {topShare >= 60 && top && (
              <span className="text-sm text-signal">
                {topShare}% on {top.vendor} — if its prices change or it goes down, {top.list.length} AI {top.list.length === 1 ? "is" : "are"} affected.
              </span>
            )}
          </div>
          <div className="flex h-3 w-full gap-0.5 rounded-full overflow-hidden bg-ink">
            {rows.filter((r) => r.spend > 0).map((r, i) => (
              <div
                key={r.vendor}
                title={`${r.vendor}: ${fmtEur(r.spend)} (${Math.round((r.spend / total) * 100)}%)`}
                className="h-full animate-grow bg-accent"
                style={{ width: `${(r.spend / total) * 100}%`, opacity: Math.max(0.25, 1 - i * 0.18) }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {rows.filter((r) => r.spend > 0).map((r, i) => (
              <span key={r.vendor} className="flex items-center gap-2 text-ink-400">
                <span className="h-2.5 w-2.5 rounded-full bg-accent" style={{ opacity: Math.max(0.25, 1 - i * 0.18) }} />
                <span className="text-ink-100">{r.vendor}</span>
                <span className="tabular">{Math.round((r.spend / total) * 100)}%</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <Table
        columns={["Provider", "AI", { label: "Share", className: "w-56" }, { label: "Cost / month", className: "text-right" }, { label: "Could save", className: "text-right" }]}
        empty={rows.length === 0 && "No AI yet — add a bank statement or another source."}
      >
        {rows.map((r) => {
          const share = total ? (r.spend / total) * 100 : 0;
          return (
            <tr key={r.vendor} className="hover:bg-ink-100/[0.02] transition-colors">
              <td className={td}>
                <Link href={`/?q=${encodeURIComponent(r.vendor)}#your-ai`} className="flex items-center gap-3 group">
                  <VendorBadge vendor={r.vendor} name={r.list[0]?.name} size={32} />
                  <span>
                    <span className="block font-medium text-ink-100 group-hover:underline">{r.vendor}</span>
                    <span className="block text-xs text-ink-400">{r.list.length} AI</span>
                  </span>
                </Link>
              </td>
              <td className={td}>
                <div className="flex flex-wrap gap-1.5">
                  {r.list.map((a) => (
                    <Link key={a.id} href={`/assets/${a.id}`} className="text-xs rounded-full border border-line px-2 py-0.5 text-ink-400 hover:text-ink-100 hover:border-ink-400 transition-colors">
                      {a.name}
                    </Link>
                  ))}
                </div>
              </td>
              <td className={td}>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 rounded-full bg-ink overflow-hidden">
                    <div className="h-full rounded-full bg-accent animate-grow" style={{ width: `${Math.max(share, share ? 3 : 0)}%` }} />
                  </div>
                  <span className="w-10 text-right text-xs text-ink-400 tabular">{Math.round(share)}%</span>
                </div>
              </td>
              <td className={`${td} text-right tabular`}>
                {r.spend ? <span className={r.estimated ? "text-ink-400" : "font-medium text-ink-100"}>{r.estimated ? "≈ " : ""}{fmtEur(r.spend)}</span> : <span className="text-ink-400">Not paid</span>}
              </td>
              <td className={`${td} text-right tabular`}>
                {r.couldSave >= 1 ? <Link href="/savings" className="font-medium text-accent hover:underline">{fmtEur(Math.round(r.couldSave))}</Link> : <span className="text-ink-400">—</span>}
              </td>
            </tr>
          );
        })}
      </Table>

      {priceIndex.rows.length > 0 && <PriceIndexCard {...priceIndex} />}
    </div>
  );
}

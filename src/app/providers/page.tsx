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
import ProviderDependencies from "@/components/estate/ProviderDependencies";

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
      <div className="flex flex-col gap-6">
        <PageHeader title="Providers" />
        <EmptyState title="No providers yet" text="Drop a bank statement or invoices — angar finds every AI provider you pay." href="/sources" cta="Add costs" />
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Providers" action={<ExportMenu dataset="providers" />} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard href="/#your-ai" label="Providers" value={String(rows.length)} hint={`${assets.length} AI`} />
        <StatCard href="/?paid=yes#your-ai" label="Monthly spend" value={total ? fmtEur(total) : "—"} hint={total ? `${fmtEur(total * 12)} a year` : undefined} />
        <StatCard
          href={top ? `/?q=${encodeURIComponent(top.vendor)}#your-ai` : "/"}
          label="Largest share"
          value={top ? `${topShare}%` : "—"}
          hint={top ? top.vendor : undefined}
          tone={topShare >= 60 ? "signal" : undefined}
        />
        <StatCard href="/savings" label="Could save" value={totalSave >= 1 ? `${fmtEur(totalSave)}/mo` : "—"} hint={totalSave >= 1 ? `${fmtEur(totalSave * 12)} a year` : undefined} />
      </div>

      {above.length > 0 && (
        <Insight tone="signal" href={`/assets/${above[0].assetIds[0]}`} cta={`Open ${above[0].name}`}>
          Above {priceIndex.networkCompanies ? "market" : "list price"}: {above.slice(0, 2).map((r) => r.name).join(", ")}
          {above.length > 2 ? ` +${above.length - 2}` : ""}
        </Insight>
      )}
      <Table
        columns={["Provider", "AI", { label: "Share", className: "w-56" }, { label: "Monthly", className: "text-right" }, { label: "Save", className: "text-right" }]}
        empty={rows.length === 0 && "No AI yet."}
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
                    <div className="h-full rounded-full bg-ink-100 animate-grow" style={{ width: `${Math.max(share, share ? 3 : 0)}%` }} />
                  </div>
                  <span className="w-10 text-right text-xs text-ink-400 tabular">{Math.round(share)}%</span>
                </div>
              </td>
              <td className={`${td} text-right tabular`}>
                {r.spend ? <span className={r.estimated ? "text-ink-400" : "font-medium text-ink-100"}>{r.estimated ? "≈ " : ""}{fmtEur(r.spend)}</span> : <span className="text-ink-400">Not paid</span>}
              </td>
              <td className={`${td} text-right tabular`}>
                {r.couldSave >= 1 ? <Link href="/savings" className="font-medium text-steady hover:underline">{fmtEur(Math.round(r.couldSave))}</Link> : <span className="text-ink-400">—</span>}
              </td>
            </tr>
          );
        })}
      </Table>

      {/* AI Estate: dipendenza da ciascun fornitore (anche via modello o deployment) ed Exit readiness. */}
      <ProviderDependencies orgId={orgId} />

      {priceIndex.rows.length > 0 && <PriceIndexCard {...priceIndex} />}
    </div>
  );
}

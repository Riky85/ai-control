import Link from "next/link";
import { VendorBadge } from "@/components/VendorIcon";
import Badge from "@/components/Badge";
import { Table } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import { categoryOf, monthlyOf, type AssetForSavings, type Saving } from "@/lib/savings";
import { CATEGORY_LABEL, PLANS } from "@/lib/pricing/catalog";

const DAY = 86400000;

/** Risparmio per AI. Per i doppioni, l'intero costo delle AI da togliere (FULL). */
const FULL = -1;
export function savingsByAsset(items: Saving[]) {
  const m = new Map<string, number>();
  for (const s of items) {
    if (s.kind === "duplicate") for (const a of s.assets.slice(1)) m.set(a.id, FULL);
    else if (s.assets[0] && m.get(s.assets[0].id) !== FULL) m.set(s.assets[0].id, (m.get(s.assets[0].id) ?? 0) + s.monthlyEur);
  }
  return m;
}

// La tabella unica delle AI: stessa in Home e in "Your AI".
export default function AiTable({ assets, savings, empty }: { assets: AssetForSavings[]; savings: Saving[]; empty?: string }) {
  const save = savingsByAsset(savings);
  const now = Date.now();
  const rows = assets
    .map((a) => ({ a, m: monthlyOf(a) }))
    .sort((x, y) => (y.m?.eur ?? -1) - (x.m?.eur ?? -1) || x.a.name.localeCompare(y.a.name));

  return (
    <Table
      columns={["AI", "Plan", "People", { label: "Cost / month", className: "text-right" }, { label: "Could save", className: "text-right" }, ""]}
      empty={rows.length === 0 && (empty ?? "Nothing here yet.")}
    >
      {rows.map(({ a, m }) => {
        const cat = categoryOf(a);
        const plan = a.cost?.planId ? PLANS.find((p) => p.id === a.cost!.planId) : null;
        const seats = a.cost?.seats ?? null;
        const active = a.usages.filter((u) => u.lastSeenAt && now - u.lastSeenAt.getTime() < 30 * DAY).length;
        const people =
          seats && a.usages.length ? `${active} of ${seats} active` : seats ? `${seats} paid · usage unknown` : a.usages.length ? `${a.usages.length}` : "—";
        const s = save.get(a.id);
        const couldSave = s === FULL ? m?.eur ?? 0 : Math.min(s ?? 0, m?.eur ?? Infinity);
        const isNew = now - a.firstSeenAt.getTime() < 30 * DAY;
        const needsDecision = a.status === "UNKNOWN" || a.status === "UNREVIEWED";
        return (
          <tr key={a.id} className="hover:bg-ink-100/[0.02] transition-colors">
            <td className="px-5 py-3">
              <Link href={`/assets/${a.id}`} className="flex items-center gap-3 group">
                <VendorBadge vendor={a.vendor ?? a.connector?.provider ?? ""} name={a.name} size={32} />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-ink-100 group-hover:underline truncate">{a.name}</span>
                    {isNew && <span className="text-[10px] font-medium text-accent border border-accent/40 rounded-full px-1.5 py-px">New</span>}
                  </span>
                  <span className="block text-xs text-ink-400 truncate">{[a.vendor, cat ? CATEGORY_LABEL[cat] : null].filter(Boolean).join(" · ") || "—"}</span>
                </span>
              </Link>
            </td>
            <td className="px-5 py-3 text-ink-400">{plan ? `${seats && seats > 1 ? `${seats} × ` : ""}${plan.name}` : m && !m.estimated ? "Usage-based" : "—"}</td>
            <td className="px-5 py-3 text-ink-400 tabular">{people}</td>
            <td className="px-5 py-3 text-right tabular">
              {m ? (
                <span className={m.estimated ? "text-ink-400" : "text-ink-100 font-medium"} title={m.estimated ? "Estimated from list prices" : undefined}>
                  {m.estimated ? "≈ " : ""}
                  {fmtEur(m.eur)}
                </span>
              ) : (
                <span className="text-ink-400" title="Not paid by the company, or free">Not paid</span>
              )}
            </td>
            <td className="px-5 py-3 text-right tabular">
              {couldSave >= 1 ? <Link href="/savings" className="font-medium text-accent hover:underline">{fmtEur(Math.round(couldSave))}</Link> : <span className="text-ink-400">—</span>}
            </td>
            <td className="px-5 py-3 text-right">
              {needsDecision ? (
                <Link href={`/review?id=${a.id}`} className="btn btn-secondary btn-sm">Decide</Link>
              ) : a.status === "UNAPPROVED" ? (
                <Badge>UNAPPROVED</Badge>
              ) : null}
            </td>
          </tr>
        );
      })}
    </Table>
  );
}

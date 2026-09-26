import { categoryOf, monthlyOf, type AssetForSavings } from "@/lib/savings";
import { CATEGORY_LABEL, type Category } from "@/lib/pricing/catalog";
import type { FilterDef } from "@/components/FilterBar";

export type AiFilterParams = { q?: string; category?: string; status?: string; paid?: string };

/** Filtri con i conteggi reali: si mostrano solo le scelte che hanno risultati. */
export function aiFilters(all: AssetForSavings[]): FilterDef[] {
  const count = (fn: (a: AssetForSavings) => boolean) => all.filter(fn).length;
  const opts = (list: { value: string; label: string; fn: (a: AssetForSavings) => boolean }[]) =>
    list.map((o) => ({ value: o.value, label: o.label, count: count(o.fn) })).filter((o) => o.count > 0);
  return [
    { param: "category", label: "Category", options: opts((Object.keys(CATEGORY_LABEL) as Category[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c], fn: (a) => categoryOf(a) === c }))) },
    {
      param: "status",
      label: "Status",
      options: opts([
        { value: "APPROVED", label: "Allowed", fn: (a) => a.status === "APPROVED" },
        { value: "TODECIDE", label: "To decide", fn: (a) => a.status === "UNKNOWN" || a.status === "UNREVIEWED" },
        { value: "UNAPPROVED", label: "Not allowed", fn: (a) => a.status === "UNAPPROVED" },
      ]),
    },
    {
      param: "paid",
      label: "Paid",
      options: opts([
        { value: "yes", label: "Paid by the company", fn: (a) => Boolean(monthlyOf(a)) },
        { value: "no", label: "Not paid", fn: (a) => !monthlyOf(a) },
      ]),
    },
  ].filter((f) => f.options.length > 1);
}

export function filterAssets(all: AssetForSavings[], p: AiFilterParams) {
  const q = p.q?.toLowerCase().trim();
  return all
    .filter((a) => !p.status || (p.status === "TODECIDE" ? a.status === "UNKNOWN" || a.status === "UNREVIEWED" : a.status === p.status))
    .filter((a) => !p.paid || (p.paid === "yes") === Boolean(monthlyOf(a)))
    .filter((a) => !q || a.name.toLowerCase().includes(q) || (a.vendor ?? "").toLowerCase().includes(q))
    .filter((a) => !p.category || categoryOf(a) === p.category);
}

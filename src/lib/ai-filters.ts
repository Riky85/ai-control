import { categoryOf, monthlyOf, type AssetForSavings } from "@/lib/savings";
import { CATEGORY_LABEL, type Category } from "@/lib/pricing/catalog";
import type { FilterDef } from "@/components/FilterBar";

export type AiFilterParams = { q?: string; category?: string; status?: string; paid?: string };

export const AI_FILTERS: FilterDef[] = [
  { param: "category", label: "Category", options: (Object.keys(CATEGORY_LABEL) as Category[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c] })) },
  { param: "status", label: "Status", options: [{ value: "APPROVED", label: "Allowed" }, { value: "TODECIDE", label: "To decide" }, { value: "UNAPPROVED", label: "Not allowed" }] },
  { param: "paid", label: "Paid", options: [{ value: "yes", label: "Paid by the company" }, { value: "no", label: "Not paid" }] },
];

export function filterAssets(all: AssetForSavings[], p: AiFilterParams) {
  const q = p.q?.toLowerCase().trim();
  return all
    .filter((a) => !p.status || (p.status === "TODECIDE" ? a.status === "UNKNOWN" || a.status === "UNREVIEWED" : a.status === p.status))
    .filter((a) => !p.paid || (p.paid === "yes") === Boolean(monthlyOf(a)))
    .filter((a) => !q || a.name.toLowerCase().includes(q) || (a.vendor ?? "").toLowerCase().includes(q))
    .filter((a) => !p.category || categoryOf(a) === p.category);
}

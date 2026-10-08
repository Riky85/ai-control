import Link from "next/link";
import ExportMenu from "@/components/ExportMenu";
import { EmptyState, Notice, PageHeader, StatCard, Table, Tabs, td } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import { restoreOpportunitiesAction } from "@/lib/opportunities/actions";
import { CATEGORIES, CATEGORY_LABEL, STATUS_LABEL, type Category, type Opportunity, type OpportunitySummary } from "@/lib/opportunities/types";
import GoalBox from "./GoalBox";
import { CategoryPill, OpportunityDrawer, OpportunityRow } from "./parts";

export type OppView = "all" | "progress" | "contracts" | "subscriptions" | "autopilot";

export const parseView = (v: string | undefined): OppView => (v === "progress" || v === "contracts" || v === "subscriptions" || v === "autopilot" ? v : "all");

/**
 * Pagina Opportunities (corpo): intestazione, obiettivo, numeri, schede e lista. I dati arrivano
 * già calcolati (pagina reale o pagina di prova).
 */
export default function OpportunitiesView({
  view,
  category,
  openKey,
  error,
  list,
  summary,
  savedMonthly,
  savedHint,
  inProgressCount,
  contractsSoon,
  hidden,
  canEdit,
  goal,
  tab,
}: {
  view: OppView;
  category: Category | null;
  openKey: string | null;
  error?: string | null;
  list: Opportunity[];
  summary: OpportunitySummary;
  savedMonthly: number;
  savedHint?: string;
  inProgressCount: number;
  contractsSoon: number;
  hidden: number;
  canEdit: boolean;
  goal: React.ComponentProps<typeof GoalBox>;
  /** Contenuto delle schede In progress / Contracts / Subscriptions / Autopilot. */
  tab?: React.ReactNode;
}) {
  const open = list.filter((o) => o.status === "new" || o.status === "accepted" || o.status === "in_progress");
  const shown = open.filter((o) => !category || o.category === category);
  const qs = new URLSearchParams();
  if (view !== "all") qs.set("view", view);
  if (category) qs.set("cat", category);
  if (goal.goal) qs.set("goal", goal.goal);
  if (goal.goal === "save") qs.set("target", String(goal.target));
  if (goal.goal === "dependency" && goal.provider) qs.set("provider", goal.provider);
  if (goal.goal === "deprecation" && goal.model) qs.set("model", goal.model);
  const base = `/opportunities${qs.toString() ? `?${qs}` : ""}`;
  const selected = openKey ? list.find((o) => o.key === openKey) ?? null : null;
  const catHref = (c: Category | null) => {
    const q = new URLSearchParams(qs);
    if (c) q.set("cat", c);
    else q.delete("cat");
    return `/opportunities${q.toString() ? `?${q}` : ""}`;
  };
  const openCount = open.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Opportunities"
        subtitle="What to change, and what it's worth"
        action={
          <>
            <Link href="/advisor" className="btn btn-ghost btn-sm">Advisor</Link>
            <Link href="/simulate" className="btn btn-ghost btn-sm">Quick simulator</Link>
            <ExportMenu dataset="savings" />
          </>
        }
      />

      {error && <Notice tone="error">{error}</Notice>}

      <GoalBox {...goal} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard label="Potential savings" value={summary.totalMonthly >= 1 ? `${fmtEur(summary.totalMonthly)}/mo` : "—"} hint={summary.totalMonthly >= 1 ? `${fmtEur(summary.totalMonthly * 12)} a year` : undefined} />
        <StatCard label="Saved so far" value={savedMonthly >= 1 ? `${fmtEur(savedMonthly)}/mo` : "—"} hint={savedHint} href="/opportunities?view=progress" />
        <StatCard label="Open opportunities" value={String(openCount)} hint={summary.notCountedMonthly >= 1 ? `+${fmtEur(summary.notCountedMonthly)}/mo not in total` : undefined} />
      </div>

      <Tabs
        active={view}
        items={[
          { key: "all", label: "All", href: "/opportunities", count: openCount || undefined },
          { key: "progress", label: "In progress", href: "/opportunities?view=progress", count: inProgressCount || undefined },
          { key: "contracts", label: "Contracts", href: "/opportunities?view=contracts", count: contractsSoon || undefined },
          { key: "subscriptions", label: "Subscriptions", href: "/opportunities?view=subscriptions" },
          { key: "autopilot", label: "Autopilot", href: "/opportunities?view=autopilot" },
        ]}
      />

      {view === "all" ? (
        <>
          {open.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 -mt-2" aria-label="Category">
              <Link href={catHref(null)} scroll={false} className={`rounded-[4px] px-3 py-1 text-sm transition-colors ${!category ? "bg-ink-100/[0.08] text-ink-100" : "text-ink-400 hover:text-ink-100"}`}>
                All categories
              </Link>
              {CATEGORIES.filter((c) => summary.byCategory[c] > 0).map((c) => (
                <Link key={c} href={catHref(c)} scroll={false} className={`rounded-[4px] px-3 py-1 text-sm transition-colors ${category === c ? "bg-ink-100/[0.08] text-ink-100" : "text-ink-400 hover:text-ink-100"}`}>
                  {CATEGORY_LABEL[c]} <span className="font-mono text-[11px] text-ink-400 tabular ml-0.5">{summary.byCategory[c]}</span>
                </Link>
              ))}
            </div>
          )}
          {shown.length === 0 ? (
            <EmptyState
              text={open.length ? "No opportunity in this category." : "Nothing to change right now."}
              action={!open.length ? <Link href="/sources" className="btn btn-secondary">Add costs</Link> : undefined}
            />
          ) : (
            <div className="rounded-xl border border-line bg-panel overflow-hidden animate-rise">
              <div className="divide-y divide-line">
                {shown.map((o) => (
                  <OpportunityRow key={o.key} o={o} base={base} canEdit={canEdit} />
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 bg-ink border-t border-line px-5 py-3 text-xs text-ink-400 bar-foot">
                <span>Total counts each AI once, up to its cost. Estimates are marked ≈.</span>
                {hidden > 0 && canEdit && (
                  <form action={restoreOpportunitiesAction}>
                    <button className="underline hover:text-ink-100">Show {hidden} hidden</button>
                  </form>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        tab
      )}

      {selected && <OpportunityDrawer o={selected} closeHref={base} back={`${base}${base.includes("?") ? "&" : "?"}open=${encodeURIComponent(selected.key)}`} canEdit={canEdit} />}
    </div>
  );
}

/** "In progress" per le opportunità fuori dal registro dei risparmi (OpportunityState). */
export function StateProgress({ list }: { list: Opportunity[] }) {
  const rows = list.filter((o) => o.ledger === "state" && (o.status === "accepted" || o.status === "in_progress" || o.status === "done"));
  if (!rows.length) return null;
  return (
    <Table title="Other decisions" columns={["Opportunity", "Category", "Status", ""]}>
      {rows.map((o) => (
        <tr key={o.key}>
          <td className={`${td} text-ink-100`}>
            <Link href={`/opportunities?open=${encodeURIComponent(o.key)}`} className="hover:underline">{o.title}</Link>
          </td>
          <td className={td}>
            <CategoryPill category={o.category} />
          </td>
          <td className={`${td} text-ink-400`}>{STATUS_LABEL[o.status]}</td>
          <td className={`${td} text-right`}>
            <Link href={o.href} className="btn btn-ghost btn-sm">Review</Link>
          </td>
        </tr>
      ))}
    </Table>
  );
}

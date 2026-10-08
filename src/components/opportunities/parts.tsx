import Link from "next/link";
import { VendorBadge } from "@/components/VendorIcon";
import { fmtEur } from "@/lib/format";
import { setOpportunityStatusAction } from "@/lib/opportunities/actions";
import { CATEGORY_LABEL, STATUS_LABEL, type Category, type Figure, type Opportunity, type Status } from "@/lib/opportunities/types";

/** Pezzi condivisi di Opportunities (righe, cassetto dei dettagli). Componenti server. */

export const CONF_LABEL: Record<string, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
const KIND_LABEL: Record<Figure["kind"], string> = { actual: "Actual", calculated: "Calculated", estimated: "Estimated" };

/** Pillola neutra della categoria (niente arcobaleno: un solo tono). */
export function CategoryPill({ category }: { category: Category }) {
  return <span className={`inline-flex items-center rounded-[2px] border px-1.5 py-0.5 font-mono uppercase text-[10px] tracking-[0.05em] whitespace-nowrap ${category === "FIX" || category === "REDUCE_DEPENDENCY" ? "border-accent/45 text-accent" : "border-line text-ink-400"}`}>{CATEGORY_LABEL[category]}</span>;
}

export function StatusPill({ status }: { status: Status }) {
  if (status === "new") return null;
  const cls = status === "done" ? "text-steady bg-steady/10" : status === "dismissed" ? "text-ink-400 bg-ink-100/[0.06]" : "text-ink-100 bg-ink-100/10";
  return <span className={`text-[10px] rounded-[2px] px-1.5 py-0.5 font-mono uppercase tracking-[0.05em] whitespace-nowrap ${cls}`}>{STATUS_LABEL[status]}</span>;
}

/** "€350 a month" con "€4,200 a year" sotto. */
export function Money({ o }: { o: Opportunity }) {
  if (!o.savings) return <span className="text-sm text-ink-400">—</span>;
  const counted = o.countedMonthlyEur >= o.savings.eur - 0.5;
  return (
    <div className="text-right" title={o.notCountedWhy ?? undefined}>
      <div className={`font-display text-xl font-light tracking-[-0.03em] tabular ${counted ? "text-ink-100" : "text-ink-400"}`}>
        {o.savings.kind === "estimated" ? "≈ " : ""}
        {fmtEur(o.savings.eur)}
        <span className="text-xs tracking-normal text-ink-400"> a month</span>
      </div>
      <div className="font-mono text-[11px] text-ink-400 tabular mt-0.5">{fmtEur(o.savings.eur * 12)} a year{counted ? "" : " · not in total"}</div>
    </div>
  );
}

/** Pulsante di stato (form verso l'azione server). */
export function StatusButton({ o, to, label, back, ghost = true, icon }: { o: Opportunity; to: Status; label: string; back: string; ghost?: boolean; icon?: boolean }) {
  return (
    <form action={setOpportunityStatusAction}>
      <input type="hidden" name="key" value={o.key} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="back" value={back} />
      <button className={`btn btn-sm ${ghost ? "btn-ghost" : "btn-secondary"} ${icon ? "btn-icon w-8" : ""}`} aria-label={icon ? label : undefined} title={label}>
        {icon ? "✕" : label}
      </button>
    </form>
  );
}

/** Azione principale della riga: Simulate se c'è uno scenario, altrimenti Review. */
export function PrimaryAction({ o }: { o: Opportunity }) {
  return o.simulateHref ? (
    <Link href={o.simulateHref} className="btn btn-secondary btn-sm" title="What happens if we do it — Impact simulator">Simulate</Link>
  ) : (
    <Link href={o.href} className="btn btn-secondary btn-sm">Review</Link>
  );
}

const withOpen = (base: string, key: string) => `${base}${base.includes("?") ? "&" : "?"}open=${encodeURIComponent(key)}`;

export function OpportunityRow({ o, base, canEdit }: { o: Opportunity; base: string; canEdit: boolean }) {
  const open = o.status === "new" || o.status === "accepted" || o.status === "in_progress";
  return (
    <div className="px-5 py-4 flex flex-wrap md:flex-nowrap items-center gap-x-5 gap-y-3">
      <Link href={withOpen(base, o.key)} scroll={false} className="flex-1 min-w-0 flex items-center gap-3 group">
        <div className="hidden sm:flex -space-x-2 shrink-0 w-[52px]">
          {o.systems.slice(0, 2).map((a) => (
            <span key={a.id} className="rounded-[4px] ring-2 ring-panel">
              <VendorBadge vendor={a.vendor ?? ""} name={a.name} size={32} />
            </span>
          ))}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryPill category={o.category} />
            <span className="text-[15px] font-bold text-ink-100 group-hover:underline">{o.title}</span>
            <StatusPill status={o.status} />
          </div>
          <p className="text-sm text-ink-400 mt-0.5 truncate">{o.reason}</p>
        </div>
      </Link>
      <div className="flex items-center gap-5 shrink-0 ml-auto">
        <div className="w-36 flex justify-end">
          <Money o={o} />
        </div>
        <dl className="hidden lg:grid grid-cols-2 gap-x-4 text-xs w-36">
          <dt className="eyebrow">Effort</dt>
          <dd className="text-ink-100">{o.effort}</dd>
          <dt className="eyebrow">Confidence</dt>
          <dd className="text-ink-100">{CONF_LABEL[o.confidence]}</dd>
        </dl>
        <div className="flex items-center gap-1.5">
          <PrimaryAction o={o} />
          {canEdit && open && <StatusButton o={o} to="done" label="Mark done" back={base} />}
          {canEdit && open && <StatusButton o={o} to="dismissed" label="Dismiss" back={base} icon />}
        </div>
      </div>
    </div>
  );
}

function FigureBox({ label, f, years }: { label: string; f: Figure | null; years?: boolean }) {
  return (
    <div className="rounded-lg border border-line p-3 min-w-0">
      <div className="eyebrow">{label}</div>
      {f ? (
        <>
          <div className="font-display text-2xl font-light tracking-[-0.03em] text-ink-100 tabular mt-2">
            {fmtEur(f.eur)}
            <span className="text-xs tracking-normal text-ink-400"> a month</span>
          </div>
          {years && <div className="font-mono text-[11px] text-ink-400 tabular">{fmtEur(f.eur * 12)} a year</div>}
          <div className="text-[11px] text-ink-400 mt-1.5 line-clamp-3" title={f.basis}>
            {KIND_LABEL[f.kind]} · {f.basis}
          </div>
        </>
      ) : (
        <div className="text-sm text-ink-400 mt-2">Not known</div>
      )}
    </div>
  );
}

const ENGINE_LABEL: Record<string, string> = { savings: "Savings engine", score: "angar Score plan", estate: "AI estate", market: "AI market changes", impact: "Replaceability", pricing: "Pricing" };

/** Cassetto a destra con prove, motivo e calcolo. Si chiude tornando alla lista (link senza ?open). */
export function OpportunityDrawer({ o, closeHref, back, canEdit }: { o: Opportunity; closeHref: string; back: string; canEdit: boolean }) {
  const moves: { to: Status; label: string }[] =
    o.status === "new"
      ? [{ to: "accepted", label: "Accept" }, { to: "done", label: "Mark done" }, { to: "dismissed", label: "Dismiss" }]
      : o.status === "accepted"
        ? [...(o.ledger === "state" ? [{ to: "in_progress" as Status, label: "Start" }] : []), { to: "done", label: "Mark done" }, { to: "new", label: "Reopen" }]
        : o.status === "in_progress"
          ? [{ to: "done", label: "Mark done" }, { to: "new", label: "Reopen" }]
          : [{ to: "new", label: "Reopen" }];
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={o.title}>
      <Link href={closeHref} scroll={false} aria-label="Close" className="absolute inset-0 bg-black/30" />
      <aside className="relative h-full w-full max-w-xl bg-panel border-l border-line overflow-y-auto animate-fade">
        <div className="sticky top-0 z-10 bg-panel border-b border-line px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <CategoryPill category={o.category} />
            <StatusPill status={o.status} />
          </div>
          <Link href={closeHref} scroll={false} className="btn btn-ghost btn-sm btn-icon w-8" aria-label="Close">✕</Link>
        </div>
        <div className="px-6 py-5 flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-bold text-ink-100 leading-snug">{o.title}</h2>
            <p className="text-sm text-ink-400 mt-1">{o.reason}</p>
          </div>

          <div className="rounded-lg bg-ink-100/[0.04] px-4 py-3">
            <div className="eyebrow">Recommended action</div>
            <div className="text-sm font-bold text-ink-100 mt-1">{o.recommendedAction}</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FigureBox label="Current cost" f={o.currentCost} />
            <FigureBox label="Expected cost" f={o.expectedCost} />
            <FigureBox label="Potential saving" f={o.savings} years />
          </div>
          {o.notCountedWhy && o.savings && <p className="text-xs text-ink-400 -mt-3">{o.notCountedWhy}.</p>}

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[
              ["Effort", o.effort],
              ["Risk", o.risk],
              ["Confidence", CONF_LABEL[o.confidence]],
              ["Score", o.scorePoints ? `+${o.scorePoints} points` : "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="eyebrow">{k}</dt>
                <dd className="text-ink-100 mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>

          <Section title="Affected AI">
            {o.systems.length ? (
              <div className="flex flex-wrap gap-1.5">
                {o.systems.map((s) => (
                  <Link key={s.id} href={`/assets/${s.id}`} className="inline-flex items-center gap-1.5 text-xs rounded-[2px] border border-line pl-1 pr-2 py-0.5 text-ink-100 hover:border-ink-400 transition-colors">
                    <VendorBadge vendor={s.vendor ?? ""} name={s.name} size={18} />
                    {s.name}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-400">Company-wide</p>
            )}
          </Section>

          <Section title="Migration impact">
            <p className="text-sm text-ink-100">{o.migrationImpact}</p>
            {o.processes.length > 0 && <p className="text-xs text-ink-400 mt-1">Processes: {o.processes.join(", ")}</p>}
          </Section>

          <Section title="Evidence">
            <ul className="flex flex-col gap-1 text-sm text-ink-100 list-disc pl-4">
              {o.evidence.map((e, i) => (
                <li key={i} className="break-words">{e}</li>
              ))}
            </ul>
          </Section>

          <Section title="Calculation">
            <ul className="flex flex-col gap-1 text-xs text-ink-400">
              {o.calculation.map((c, i) => (
                <li key={i} className="break-words">{c}</li>
              ))}
              <li>From: {o.engines.map((e) => ENGINE_LABEL[e] ?? e).join(", ")}</li>
            </ul>
          </Section>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line pt-4">
            <Link href={o.href} className="btn btn-secondary btn-sm">Review</Link>
            {o.simulateHref && <Link href={o.simulateHref} className="btn btn-secondary btn-sm">Simulate</Link>}
            <span className="flex-1" />
            {canEdit && moves.map((m) => <StatusButton key={m.to} o={o} to={m.to} label={m.label} back={back} ghost={m.to !== "accepted" && m.to !== "done"} />)}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="eyebrow mb-2">{title}</h3>
      {children}
    </section>
  );
}

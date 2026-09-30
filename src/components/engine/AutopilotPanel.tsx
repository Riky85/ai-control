import Link from "next/link";
import { currentSession } from "@/lib/auth";
import { fmtEur } from "@/lib/format";
import { autopilotSummary, autopilotTasks, syncAutopilot, type AutopilotMode, type AutopilotStep, type AutopilotSummary, type TaskStatus } from "@/lib/engine/autopilot";
import { approveAutopilotAction, dismissAutopilotAction, markAutopilotStepAction, retryAutopilotAction, setAutopilotModeAction } from "@/lib/engine/autopilot-actions";

export interface AutopilotTaskView {
  id: string;
  kind: string;
  title: string;
  status: TaskStatus;
  expectedMonthlyEur: number;
  steps: AutopilotStep[];
  result: string | null;
  needsApproval: boolean;
}

export interface AutopilotPanelProps {
  summary: AutopilotSummary;
  tasks: AutopilotTaskView[];
  /** Più piani di quelli mostrati. */
  more: number;
  canEdit: boolean;
  canAdmin: boolean;
}

const MAX = 6;
const RANK = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 } as const;

/** Props del pannello: sincronizza i piani (se l'Autopilot è acceso) e li ordina. */
export async function loadAutopilotPanel(orgId: string): Promise<AutopilotPanelProps> {
  const first = await autopilotSummary(orgId);
  if (first.mode !== "off") await syncAutopilot(orgId).catch((err) => console.error("[autopilot] sync failed", err));
  const [summary, all] = await Promise.all([first.mode !== "off" ? autopilotSummary(orgId) : first, autopilotTasks(orgId)]);
  const order = (t: AutopilotTaskView) => (t.needsApproval ? 0 : t.status === "failed" ? 1 : t.status === "approved" || t.status === "running" ? 2 : t.steps.some((s) => s.id === "verify" && !s.done) ? 3 : 4);
  const sorted = all
    .map(({ approvedBy: _a, updatedAt: _u, ...t }) => t)
    .sort((a, b) => order(a) - order(b) || b.expectedMonthlyEur - a.expectedMonthlyEur);
  const role = currentSession()?.role ?? "VIEWER";
  return { summary, tasks: sorted.slice(0, MAX), more: Math.max(0, sorted.length - MAX), canEdit: RANK[role] >= RANK.EDITOR, canAdmin: RANK[role] >= RANK.ADMIN };
}

const MODES: { id: AutopilotMode; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "Autopilot does nothing" },
  { id: "approve", label: "Ask me", hint: "angar prepares each plan, you approve it" },
  { id: "auto", label: "Automatic", hint: "angar runs safe plans on its own. Removing seats still needs you" },
];

const STATUS: Record<TaskStatus, { label: string; cls: string }> = {
  proposed: { label: "Ready", cls: "text-accent bg-accent/10" },
  approved: { label: "Approved", cls: "text-ink-100 bg-ink-100/10" },
  running: { label: "In progress", cls: "text-ink-100 bg-ink-100/10" },
  done: { label: "Done", cls: "text-steady bg-steady/10" },
  failed: { label: "Stopped", cls: "text-alarm bg-alarm/10" },
  dismissed: { label: "Hidden", cls: "text-ink-400 bg-ink-400/10" },
};

const external = (href: string) => /^https?:\/\//.test(href);

/**
 * Savings Autopilot: ogni risparmio diventa un piano con passi chiari
 * ("angar lo fa" / "lo fai tu"), si approva con un clic e si verifica sulle
 * bollette successive. Server component, solo form: nessun JavaScript nel browser.
 */
export default function AutopilotPanel({ summary, tasks, more, canEdit, canAdmin }: AutopilotPanelProps) {
  const off = summary.mode === "off";
  return (
    <section className="relative overflow-hidden rounded-2xl border border-line bg-panel animate-rise" aria-labelledby="autopilot-title">
      {/* Barra grigia in alto: titolo, stato e modalità. */}
      <header className="relative flex flex-wrap items-center justify-between gap-3 bg-ink border-b border-line rounded-t-2xl px-5 py-2.5 text-sm">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className={`relative inline-flex h-2 w-2 rounded-full ${off ? "bg-ink-400/50" : "bg-steady"}`} />
          <h2 id="autopilot-title" className="font-semibold text-ink-100">Autopilot</h2>
        </div>
        <ModeControl mode={summary.mode} canAdmin={canAdmin} />
      </header>

      {off ? (
        <p className="relative p-5 text-sm text-ink-400">Off. Turn it on and angar turns each saving into a plan it can run.</p>
      ) : (
        <>
          <dl className="relative grid grid-cols-3 gap-px border-b border-line bg-line">
            <Figure label="Ready to save" value={`${fmtEur(summary.proposedMonthlyEur)}`} unit="a month" hint={summary.proposedCount ? `${summary.proposedCount} plan${summary.proposedCount === 1 ? "" : "s"} to approve` : "Nothing waiting"} accent={summary.proposedMonthlyEur > 0} />
            <Figure label="In progress" value={String(summary.runningCount)} hint={summary.doneMonthlyEur > 0 ? `${fmtEur(summary.doneMonthlyEur)} a month done` : "plans running"} />
            <Figure label="Verified on bills" value={fmtEur(summary.verifiedMonthlyEur)} unit="a month" hint="from real charges" good={summary.verifiedMonthlyEur > 0} />
          </dl>

          {tasks.length === 0 ? (
            <p className="relative px-5 py-6 text-sm text-ink-400">No plans yet. angar prepares one for each saving it finds.</p>
          ) : (
            <ul className="relative divide-y divide-line">
              {tasks.map((t) => (
                <TaskRow key={t.id} t={t} canEdit={canEdit} />
              ))}
            </ul>
          )}

          <footer className="relative flex flex-wrap items-center justify-between gap-2 bg-ink border-t border-line rounded-b-2xl px-5 py-3 text-[11px] text-ink-400">
            <span className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-accent" />angar does this</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full ring-1 ring-ink-400" />you do this</span>
            </span>
            <span>{more > 0 ? `+${more} more` : "Proved on your next bills"}</span>
          </footer>
        </>
      )}
    </section>
  );
}

function ModeControl({ mode, canAdmin }: { mode: AutopilotMode; canAdmin: boolean }) {
  return (
    <form action={setAutopilotModeAction} className="inline-flex rounded-lg border border-line bg-ink-100/[0.03] p-0.5" role="radiogroup" aria-label="Autopilot mode">
      {MODES.map((m) => {
        const on = m.id === mode;
        return (
          <button
            key={m.id}
            name="mode"
            value={m.id}
            role="radio"
            aria-checked={on}
            disabled={!canAdmin || on}
            title={canAdmin ? m.hint : `${m.hint}. Admins can change it`}
            className={`h-7 rounded-md px-3 text-xs font-medium transition-colors disabled:cursor-default ${on ? "bg-panel text-ink-100 shadow-sm ring-1 ring-line" : "text-ink-400 hover:text-ink-100 disabled:hover:text-ink-400"}`}
          >
            {m.label}
          </button>
        );
      })}
    </form>
  );
}

function Figure({ label, value, unit, hint, accent, good }: { label: string; value: string; unit?: string; hint: string; accent?: boolean; good?: boolean }) {
  return (
    <div className="bg-panel px-5 py-3.5 min-w-0">
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className="mt-1">
        <span className={`font-display text-2xl font-semibold tracking-tight tabular ${accent ? "text-ink-100" : good ? "text-steady" : "text-ink-100"}`}>{value}</span>
        {unit && <span className="ml-1 text-xs text-ink-400">{unit}</span>}
      </dd>
      <dd className="text-[11px] text-ink-400 mt-0.5 truncate">{hint}</dd>
    </div>
  );
}

function TaskRow({ t, canEdit }: { t: AutopilotTaskView; canEdit: boolean }) {
  const st = t.needsApproval && t.status !== "proposed" ? { label: "Needs you", cls: "text-signal bg-signal/10" } : STATUS[t.status];
  const active = t.status === "approved" || t.status === "running";
  return (
    <li className="px-5 py-3.5 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="flex-1 min-w-[12rem]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink-100">{t.title}</span>
            <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 shrink-0 ${st.cls}`}>{st.label}</span>
          </div>
          {t.result && <p className={`text-xs mt-0.5 ${t.status === "failed" ? "text-alarm" : "text-ink-400"}`}>{t.result}</p>}
        </div>
        <div className="text-right shrink-0">
          <span className="font-display text-lg font-semibold tabular text-ink-100">{fmtEur(t.expectedMonthlyEur)}</span>
          <span className="ml-1 text-xs text-ink-400">a month</span>
        </div>
        {canEdit && (t.needsApproval || t.status === "failed") && (
          <div className="flex items-center gap-1.5 shrink-0">
            {t.needsApproval && (
              <form action={approveAutopilotAction}>
                <input type="hidden" name="id" value={t.id} />
                <button className="btn btn-primary btn-sm">Approve</button>
              </form>
            )}
            {t.status === "failed" && (
              <form action={retryAutopilotAction}>
                <input type="hidden" name="id" value={t.id} />
                <button className="btn btn-secondary btn-sm">Retry</button>
              </form>
            )}
            {(t.status === "proposed" || t.status === "failed") && (
              <form action={dismissAutopilotAction}>
                <input type="hidden" name="id" value={t.id} />
                <button className="btn btn-ghost btn-sm">Not for us</button>
              </form>
            )}
          </div>
        )}
      </div>
      <Steps t={t} canMark={canEdit && active} />
    </li>
  );
}

/** Tracciato compatto dei passi: fatto / angar / tu (con link e "Done"). */
function Steps({ t, canMark }: { t: AutopilotTaskView; canMark: boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5" aria-label="Steps">
      {t.steps.map((s, i) => {
        const cls = s.done
          ? "border-steady/30 text-ink-400"
          : s.auto
            ? "border-accent/30 text-ink-100"
            : "border-line text-ink-100";
        const mark = s.done ? (
          <span className="text-steady" aria-label="done">✓</span>
        ) : s.auto ? (
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="angar does this" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full ring-1 ring-ink-400" aria-label="you do this" />
        );
        const label =
          !s.done && !s.auto && s.href ? (
            external(s.href) ? (
              <a href={s.href} target="_blank" rel="noopener noreferrer" className="underline decoration-line underline-offset-2 hover:decoration-ink-100">{s.label} ↗</a>
            ) : (
              <Link href={s.href} className="underline decoration-line underline-offset-2 hover:decoration-ink-100">{s.label}</Link>
            )
          ) : (
            <span>{s.label}</span>
          );
        return (
          <li key={`${s.id}:${s.ref ?? ""}:${i}`} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden className="h-px w-2 bg-line" />}
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${cls}`} title={s.detail ?? undefined}>
              {mark}
              {label}
              {s.detail && !s.done && <span className="text-ink-400">· {s.detail}</span>}
              {canMark && !s.done && !s.auto && (
                <form action={markAutopilotStepAction} className="contents">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="step" value={i} />
                  <button className="ml-0.5 rounded-full px-1.5 text-[10px] font-medium text-accent hover:bg-accent/10" title="Mark this step done">Done</button>
                </form>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

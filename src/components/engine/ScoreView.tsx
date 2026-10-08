import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader, Panel, StatCard, Table, td } from "@/components/ui";
import { LevelPill, ScoreBar } from "@/components/engine/ScoreCard";
import type { ScorePoint, FullScore } from "@/lib/engine/score";
import type { Dimension, ActionPlan } from "@/lib/engine/score-model";
import { AXIS_HINT, AXIS_WEIGHT, CONFIDENCE_TEXT, UNMEASURED_CAP } from "@/lib/engine/score-meta";
import { fmtEur } from "@/lib/format";

const fmtDay = (day: string) => new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const minus = (n: number) => (n < 0 ? `−${Math.abs(n)}` : n > 0 ? `+${n}` : "0");

export interface ScoreViewProps {
  result: FullScore;
  plan: ActionPlan;
  /** Fotografie del metodo attuale (la più vecchia per prima). */
  current: ScorePoint[];
  /** Primo giorno del metodo attuale, se ci sono fotografie del metodo precedente. */
  changedOn: string | null;
  changed: { from: number; to: number; since: string; savedMonthlyEur: number } | null;
  children?: ReactNode;
}

/**
 * Pagina /score (solo presentazione, dati dal server), stessa grammatica della home:
 * intestazione, quattro numeri, la tabella delle dimensioni (con il "perché") e l'andamento.
 */
export default function ScoreView({ result, plan, current, changedOn, changed, children }: ScoreViewProps) {
  const first = current[0];
  // Variazione: prima quella di "what changed" (con i risparmi), altrimenti dalla prima fotografia.
  const moved = changed && changed.to !== changed.from ? { d: changed.to - changed.from, since: changed.since } : current.length >= 2 && result.score !== first.score ? { d: result.score - first.score, since: first.day } : null;
  const scoreHint = [result.levelLabel, moved ? `${moved.d > 0 ? "▲" : "▼"} ${Math.abs(moved.d)} since ${fmtDay(moved.since)}` : null].filter(Boolean).join(" · ");
  const actions = plan.actions.length;
  const gap = result.gaps[0];
  const lost = result.drivers.reduce((s, d) => s + d.points, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Angar Score"
        subtitle="How well your AI spend is used"
        action={
          <>
            <Link href="/impact?view=score" className="btn btn-ghost btn-sm">What if</Link>
            <Link href="/opportunities?view=score" className="btn btn-primary btn-sm btn-go">Improve my score</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Score" value={`${result.score}/100`} hint={scoreHint} tone={result.level === "weak" ? "warn" : undefined} />
        <StatCard
          label="Potential"
          value={plan.potential > result.score ? `up to ${plan.potential}` : "—"}
          hint={actions ? `with ${actions} action${actions === 1 ? "" : "s"}` : "Nothing to improve"}
          href="/opportunities?view=score"
        />
        <StatCard
          label="Savings found"
          value={result.savingsMonthlyEur >= 1 ? `${fmtEur(result.savingsMonthlyEur)}/mo` : "—"}
          hint={changed && changed.savedMonthlyEur >= 1 ? `${fmtEur(changed.savedMonthlyEur)}/mo saved since ${fmtDay(changed.since)}` : result.savingsMonthlyEur >= 1 ? `${fmtEur(result.savingsMonthlyEur * 12)} a year` : undefined}
          href="/opportunities"
        />
        <StatCard label="Confidence" value={result.confidenceLabel} hint={gap ? gap.label : CONFIDENCE_TEXT[result.confidence]} href={gap?.href} />
      </div>

      <Table
        id="why"
        title="Dimensions"
        note={lost < 0 ? `${minus(lost)} points lost` : "Nothing holds it back"}
        columns={["Dimension", "Value", "Level", "Why", { label: "", className: "w-px" }]}
        footer={
          result.capPoints > 0 || result.gaps.length > 1 ? (
            <>
              {result.capPoints > 0 && <span className="text-ink-400">No usage data <span className="tabular text-accent ml-1">{minus(-result.capPoints)}</span></span>}
              {result.gaps.map((g) => (
                <Link key={g.label} href={g.href} className="eyebrow hover:!text-ink-100 transition-colors">{g.label} [→]</Link>
              ))}
            </>
          ) : undefined
        }
      >
        {result.dimensions.map((d) => (
          <DimensionRow key={d.axis} d={d} />
        ))}
      </Table>

      <Panel title="Score history" subtitle={changedOn ? `Method changed ${fmtDay(changedOn)}` : current.length >= 2 ? `Since ${fmtDay(current[0].day)}` : undefined}>
        <Trend points={current} />
      </Panel>

      {children}
    </div>
  );
}

/** Riga di una dimensione: nome, barra sottile, valore, livello, il motivo principale e il link per sistemarlo. */
function DimensionRow({ d }: { d: Dimension }) {
  const unmeasured = d.status === "unmeasured" || d.status === "na";
  const weight =
    d.status === "na"
      ? "Not counted: no data for this dimension."
      : d.status === "unmeasured"
        ? `Counts as ${UNMEASURED_CAP} until measured · ${Math.round(d.weight * 100)}% of the score`
        : `${Math.round(d.weight * 100)}% of the score${Math.round(d.weight * 100) !== Math.round(AXIS_WEIGHT[d.axis] * 100) ? ` (${Math.round(AXIS_WEIGHT[d.axis] * 100)}% base)` : ""}`;
  const reasons = d.drivers.filter((r) => r.points < 0).sort((a, b) => a.points - b.points);
  const top = reasons[0];
  return (
    <tr id={`axis-${d.axis}`} className="scroll-mt-20 target:bg-ink-100/[0.04]">
      <td className={`${td} min-w-[160px]`}>
        <div className="text-ink-100" title={AXIS_HINT[d.axis]}>{d.label}</div>
        <div className="eyebrow mt-0.5">{weight}</div>
      </td>
      <td className={`${td} whitespace-nowrap`}>
        <div className="flex items-center gap-3">
          <ScoreBar value={unmeasured ? 0 : d.value ?? 0} className="w-20" />
          <span className={`tabular ${d.level === "weak" ? "text-accent" : "text-ink-100"}`}>{unmeasured ? "—" : d.value}</span>
        </div>
      </td>
      <td className={td}>
        <LevelPill level={d.level} label={d.levelLabel} />
      </td>
      <td className={`${td} text-ink-400 min-w-[220px]`}>
        {top ? (
          <span title={reasons.map((r) => `${minus(r.points)} ${r.label}`).join("\n")}>
            <span className="tabular text-accent mr-1.5">{minus(d.points)}</span>
            {top.label}
            {reasons.length > 1 && <span className="eyebrow ml-1.5">+{reasons.length - 1} more</span>}
          </span>
        ) : (
          AXIS_HINT[d.axis]
        )}
      </td>
      <td className={`${td} text-right`}>
        {top && (
          <Link href={top.href} className="btn btn-ghost btn-sm">{top.missingData ? "Connect" : "Fix"}</Link>
        )}
      </td>
    </tr>
  );
}

/** Andamento del punteggio (solo il metodo attuale), linea grigia. Con meno di due giorni non c'è ancora una linea. */
function Trend({ points }: { points: ScorePoint[] }) {
  if (points.length < 2) return <p className="text-sm text-ink-400">Trend starts tomorrow.</p>;
  const W = 480;
  const H = 72;
  const vals = points.map((p) => p.score);
  const lo = Math.max(0, Math.min(...vals) - 5);
  const hi = Math.min(100, Math.max(...vals) + 5);
  const x = (i: number) => (i * W) / (points.length - 1);
  const y = (v: number) => 4 + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - 8);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[72px] text-ink-400" preserveAspectRatio="none" aria-label={`Score trend, from ${vals[0]} to ${vals[vals.length - 1]}`}>
        <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between font-mono uppercase tracking-[0.04em] text-[10px] text-ink-400 tabular mt-1">
        <span>
          {fmtDay(points[0].day)} · {vals[0]}
        </span>
        <span>Today · {vals[vals.length - 1]}</span>
      </div>
    </div>
  );
}

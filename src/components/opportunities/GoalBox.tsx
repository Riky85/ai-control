import Link from "next/link";
import { fmtEur } from "@/lib/format";
import { BlockFoot, BlockHead } from "@/components/ui";
import { GOALS, type GoalAnswer, type GoalKind } from "@/lib/opportunities/goals";
import { CONF_LABEL } from "./parts";

/**
 * "Goal" — decision intelligence in cima a Opportunities: obiettivi predefiniti, ciascuno
 * risposto dal motore con un piano ordinato (dettaglio nell'Impact simulator).
 * Modulo GET: l'obiettivo sta nell'URL, si condivide.
 */
export default function GoalBox({
  goal,
  answer,
  target,
  provider,
  model,
  providers,
  models,
}: {
  goal: GoalKind | null;
  answer: GoalAnswer | null;
  target: number;
  provider: string | null;
  model: string | null;
  providers: { id: string; label: string; share: number }[];
  models: { id: string; label: string; date: string | null }[];
}) {
  const chip = (k: GoalKind, label: string) => {
    const href = k === "save" ? `/opportunities?goal=save&target=${target}` : `/opportunities?goal=${k}`;
    return (
      <Link key={k} href={href} scroll={false} className={`rounded-[4px] border px-3 py-1 text-sm transition-colors ${goal === k ? "border-ink-100 text-ink-100 bg-ink-100/[0.04]" : "border-line text-ink-400 hover:text-ink-100 hover:border-ink-400"}`}>
        {k === "save" ? `Save ${fmtEur(target)} a year` : k === "dependency" ? `Reduce dependency${providers[0] ? ` on ${providers.find((p) => p.id === provider)?.label ?? providers[0].label}` : ""}` : label}
      </Link>
    );
  };
  const needsForm = goal === "save" || (goal === "dependency" && providers.length > 1) || (goal === "deprecation" && models.length > 1);
  return (
    <section className="rounded-xl border border-line bg-panel animate-rise flex flex-col">
      <BlockHead title="Goal" note="Pick a goal: angar answers with a ranked plan" />
      <div className="p-5 flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">{GOALS.map((g) => chip(g.kind, g.label))}</div>
        {needsForm && (
          <form method="get" action="/opportunities" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="goal" value={goal!} />
            {goal === "save" && (
              <label className="flex flex-col gap-1.5 eyebrow">
                Target, € a year
                <input name="target" type="number" min={100} step={100} defaultValue={target} className="field w-40 tabular" />
              </label>
            )}
            {goal === "dependency" && (
              <label className="flex flex-col gap-1.5 eyebrow">
                Provider
                <select name="provider" defaultValue={provider ?? providers[0]?.id} className="field w-56">
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} · {Math.round(p.share * 100)}%
                    </option>
                  ))}
                </select>
              </label>
            )}
            {goal === "deprecation" && (
              <label className="flex flex-col gap-1.5 eyebrow">
                Model
                <select name="model" defaultValue={model ?? models[0]?.id} className="field w-64">
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {m.date ? ` · ${m.date}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="btn btn-primary">Plan</button>
          </form>
        )}
        {answer && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-100">
              <span className="font-bold">{answer.title}.</span> {answer.summary}
            </p>
            {answer.steps.length > 0 && (
              <div className="rounded-lg border border-line overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bar-thead text-left font-mono uppercase text-[11px] tracking-[0.04em] text-ink-400 bg-ink border-b border-line">
                      <th className="text-left font-normal px-4 py-2.5 w-8">#</th>
                      <th className="text-left font-normal px-4 py-2.5">Step</th>
                      <th className="text-right font-normal px-4 py-2.5 whitespace-nowrap">Change a month</th>
                      <th className="text-left font-normal px-4 py-2.5">Effort</th>
                      <th className="text-left font-normal px-4 py-2.5">Risk</th>
                      <th className="text-left font-normal px-4 py-2.5">Confidence</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {answer.steps.slice(0, 8).map((s, i) => (
                      <tr key={s.key} className={s.picked ? "" : "opacity-60"}>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-ink-400 tabular">{String(i + 1).padStart(2, "0")}</td>
                        <td className="px-4 py-2.5 min-w-[220px]">
                          <div className="text-ink-100">{s.title}</div>
                          <div className="text-xs text-ink-400">{s.detail}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular whitespace-nowrap" title={s.monthly?.basis}>
                          {s.monthly ? (
                            <span className={s.monthly.eur < 0 ? "text-steady" : "text-ink-100"}>
                              {s.monthly.kind === "estimated" ? "≈ " : ""}
                              {s.monthly.eur < 0 ? "−" : s.monthly.eur > 0 ? "+" : ""}
                              {fmtEur(Math.abs(s.monthly.eur))}
                            </span>
                          ) : (
                            <span className="text-ink-400">Not known</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-ink-100">{s.effort ?? "—"}</td>
                        <td className={`px-4 py-2.5 ${s.risk === "High" || s.risk === "Medium" ? "text-accent" : "text-ink-100"}`}>{s.risk ?? "—"}</td>
                        <td className="px-4 py-2.5 text-ink-100">{s.confidence ? CONF_LABEL[s.confidence] : "—"}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">{s.href && <Link href={s.href} className="eyebrow hover:!text-ink-100 transition-colors">Open [→]</Link>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      {answer && (
        <BlockFoot className="justify-between text-xs text-ink-400">
          <span className="min-w-0">{answer.basis}</span>
          {answer.impactHref && <Link href={answer.impactHref} className="eyebrow hover:!text-ink-100 transition-colors shrink-0">Open in Impact simulator [→]</Link>}
        </BlockFoot>
      )}
    </section>
  );
}

import { fmtEur } from "@/lib/format";

type Step = { label: string; state: "done" | "auto" | "you" };

const STEPS: Step[] = [
  { label: "Found 9 inactive seats", state: "done" },
  { label: "Asked the 9 people", state: "done" },
  { label: "Approve removing 9 seats", state: "you" },
  { label: "Remove seats via API", state: "auto" },
  { label: "Verify on the next bills", state: "auto" },
];

/**
 * Copia statica del tracciato dei passi dell'Autopilot (il pannello vero usa
 * server action): piano, stato, risparmio e passi fatto / angar / tu.
 */
export default function StepTrackerMock() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink-100">Remove unused ChatGPT seats</span>
            <span className="text-[11px] font-medium rounded-full px-2 py-0.5 text-signal bg-signal/10">Needs you</span>
          </div>
          <p className="text-xs text-ink-400 mt-0.5">9 of 40 seats unused for 30 days</p>
        </div>
        <div className="text-right shrink-0">
          <span className="font-display text-lg font-semibold tabular text-ink-100">{fmtEur(283)}</span>
          <span className="block text-[11px] text-ink-400">a month</span>
        </div>
      </div>

      <ol className="flex flex-col gap-0" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.label} className="relative flex items-center gap-3 py-1.5">
            {i < STEPS.length - 1 && <span aria-hidden className={`absolute left-[7px] top-[22px] h-[calc(100%-14px)] w-px ${s.state === "done" ? "bg-steady/40" : "bg-line"}`} />}
            <Mark state={s.state} />
            <span className={`text-xs ${s.state === "done" ? "text-ink-400" : "text-ink-100"}`}>{s.label}</span>
            {s.state === "you" && <span className="ml-auto text-[11px] text-signal whitespace-nowrap">waiting for you</span>}
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-3 text-[11px] text-ink-400">
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-accent" />angar does this</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full ring-1 ring-ink-400" />you do this</span>
      </div>
    </div>
  );
}

function Mark({ state }: { state: Step["state"] }) {
  if (state === "done")
    return (
      <span className="relative z-[1] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-steady/15 text-steady" aria-label="done">
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="m2 5.2 2 2 4-4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  return (
    <span className="relative z-[1] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-panel ring-1 ring-line" aria-label={state === "auto" ? "angar does this" : "you do this"}>
      <span className={`h-1.5 w-1.5 rounded-full ${state === "auto" ? "bg-accent" : "ring-1 ring-ink-400"}`} />
    </span>
  );
}

export type StageState = "done" | "active" | "pending" | "continuous";

export interface Stage {
  label: string;
  state: StageState;
}

const DOT: Record<StageState, string> = {
  done: "bg-ink-100",
  active: "bg-accent",
  pending: "bg-line",
  continuous: "bg-steady",
};

const STATE_TEXT: Record<StageState, string> = {
  done: "Done",
  active: "In progress",
  pending: "Pending",
  continuous: "Continuous",
};

// Stepper orizzontale a 4 stadi — il pezzo visivo che rende la dashboard
// una "lifecycle view" invece di un semplice elenco di numeri.
export default function WorkflowStepper({ stages }: { stages: Stage[] }) {
  return (
    <div className="grid grid-cols-4">
      {stages.map((s, i) => (
        <div key={s.label} className={`relative pb-3 ${i > 0 ? "pl-4" : ""}`}>
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.state]} shrink-0`} />
            <span className="text-xs font-medium text-ink-100">{s.label}</span>
          </div>
          <div className="text-[11px] text-ink-400 mt-0.5 pl-[14px]">{STATE_TEXT[s.state]}</div>
          <div
            className={`absolute left-0 right-0 -bottom-0 h-px ${
              s.state === "pending" ? "bg-line" : "bg-ink-100/50"
            } ${i === 0 ? "left-[7px]" : ""} ${i === stages.length - 1 ? "right-1/2" : ""}`}
          />
        </div>
      ))}
    </div>
  );
}

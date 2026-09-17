export type StageState = "done" | "active" | "pending" | "continuous";

export interface Stage {
  label: string;
  state: StageState;
}

const DOT: Record<StageState, string> = {
  done: "bg-ink-100",
  active: "bg-signal",
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
        <div key={s.label} className={`relative pb-4 ${i > 0 ? "pl-4" : ""}`}>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${DOT[s.state]} shrink-0`} />
            <span className="text-sm font-medium text-ink-100">{s.label}</span>
          </div>
          <div className="text-xs text-ink-400 mt-0.5 pl-[18px]">{STATE_TEXT[s.state]}</div>
          <div
            className={`absolute left-0 right-0 -bottom-0 h-[2px] ${
              s.state === "pending" ? "bg-line" : "bg-ink-100/70"
            } ${i === 0 ? "left-[10px]" : ""} ${i === stages.length - 1 ? "right-1/2" : ""}`}
          />
        </div>
      ))}
    </div>
  );
}

export type StageState = "done" | "active" | "pending" | "continuous";

export interface Stage {
  label: string;
  state: StageState;
}

const STATE_TEXT: Record<StageState, string> = {
  done: "Done",
  active: "In progress",
  pending: "Pending",
  continuous: "Continuous",
};

// Icone per posizione — le 4 fasi sono sempre le stesse (Discover, Risk
// assessment, Review & approve, Monitor & enforce), quindi un'icona fissa
// per indice è più leggibile di un dot generico. Stile OneTrust: badge
// circolare con glifo dentro, non un semplice punto colorato.
function StageIcon({ index, state }: { index: number; state: StageState }) {
  const common = { width: 15, height: 15, viewBox: "0 0 15 15", fill: "none" as const };
  const stroke = { stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const glyphs = [
    <svg key="0" {...common}><circle {...stroke} cx="6.2" cy="6.2" r="4" /><path {...stroke} d="M9.5 9.5L13 13" /></svg>, // discover: lente
    <svg key="1" {...common}><path {...stroke} d="M7.5 1.5l5 2v3.5c0 3.5-2.2 5.8-5 6.8-2.8-1-5-3.3-5-6.8V3.5l5-2z" /></svg>, // risk: scudo
    <svg key="2" {...common}><circle {...stroke} cx="7.5" cy="5" r="2" /><path {...stroke} d="M3 13c0-2.2 2-3.8 4.5-3.8S12 10.8 12 13" /></svg>, // review: persona
    <svg key="3" {...common}><path {...stroke} d="M2 12h11M4 12V7l2.5 2.5L9 6l3 3" /></svg>, // monitor: grafico
  ];
  const bg =
    state === "done" ? "bg-ink-100 text-panel" : state === "continuous" ? "bg-accent text-white" : state === "active" ? "bg-accent-soft text-accent" : "bg-panel text-ink-400 border border-line";
  return <span className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${bg}`}>{state === "done" ? <Check /> : glyphs[index]}</span>;
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Stepper orizzontale a 4 stadi — badge circolari con icona per fase,
// linea di collegamento colorata in base a quanto è già stato completato.
export default function WorkflowStepper({ stages }: { stages: Stage[] }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {stages.map((s, i) => (
        <div key={s.label} className="flex flex-col gap-2">
          <div className="relative flex items-center">
            <StageIcon index={i} state={s.state} />
            {i < stages.length - 1 && (
              <div className={`h-[2px] flex-1 ml-1 ${s.state === "pending" ? "bg-line" : "bg-accent"}`} />
            )}
          </div>
          <div>
            <div className="text-xs font-medium text-ink-100">{s.label}</div>
            <div className="text-[11px] text-ink-400 mt-0.5">{STATE_TEXT[s.state]}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

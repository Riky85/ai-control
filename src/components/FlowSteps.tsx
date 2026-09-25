// Indicatore del percorso guidato: Collega → Rivedi → Risultati.
export default function FlowSteps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Connect", "Review", "See results"];
  return (
    <ol className="flex items-center gap-3 text-sm">
      {steps.map((s, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={s} className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span
                className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                  done ? "bg-steady text-white" : active ? "bg-accent text-white" : "bg-ink text-ink-400"
                }`}
              >
                {done ? "✓" : n}
              </span>
              <span className={active ? "font-medium text-ink-100" : "text-ink-400"}>{s}</span>
            </span>
            {n < steps.length && <span className="w-10 h-px bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}

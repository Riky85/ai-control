/**
 * Fascia orizzontale di metriche in stile "readout" — deliberatamente non
 * un set di card identiche con ombra: qui la gerarchia (quale numero conta
 * di più) è resa con la dimensione del carattere, non con box ripetuti.
 */
export interface SignalItem {
  label: string;
  value: number;
  tone?: "default" | "signal" | "alarm";
}

const TONE_CLASS: Record<string, string> = {
  default: "text-ink-100",
  signal: "text-signal",
  alarm: "text-alarm",
};

export default function SignalStrip({ items }: { items: SignalItem[] }) {
  return (
    <div className="flex items-stretch border border-line rounded-md bg-panel overflow-hidden">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`flex-1 px-6 py-5 ${i > 0 ? "border-l border-line" : ""}`}
        >
          <div className={`tabular text-3xl font-display font-semibold ${TONE_CLASS[item.tone ?? "default"]}`}>
            {item.value}
          </div>
          <div className="text-xs text-ink-400 mt-1">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Arco di rischio disegnato a mano — l'unico elemento "audace" della UI.
 * Deliberatamente non un badge colorato: il punteggio 0-100 del risk
 * engine deterministico (src/lib/risk-engine.ts) ha bisogno di un posto
 * dove essere l'oggetto principale della pagina, non un dettaglio a lato.
 */
// Stessa semantica di Badge: verde = basso, arancio = medio (da guardare), rosso = alto/critico.
const TONE: Record<string, string> = {
  LOW: "rgb(var(--c-steady))",
  MEDIUM: "#FF7323",
  HIGH: "rgb(var(--c-alarm))",
  CRITICAL: "rgb(var(--c-alarm))",
};

export default function RiskGauge({ score, level }: { score: number; level: string }) {
  const radius = 54;
  const stroke = 8;
  const circumference = Math.PI * radius; // semicerchio
  const progress = Math.min(100, Math.max(0, score)) / 100;
  const dash = circumference * progress;
  const color = TONE[level] ?? "rgb(var(--c-muted))";

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="80" viewBox="0 0 140 80">
        <path
          d="M 10 74 A 60 60 0 0 1 130 74"
          fill="none"
          stroke="rgb(var(--c-line))"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d="M 10 74 A 60 60 0 0 1 130 74"
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <div className="tabular text-[32px] font-display font-light tracking-[-0.03em] -mt-6" style={{ color }}>
        {score}
      </div>
      <div className="eyebrow mt-1">out of 100</div>
    </div>
  );
}

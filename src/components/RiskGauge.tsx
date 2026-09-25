/**
 * Arco di rischio disegnato a mano — l'unico elemento "audace" della UI.
 * Deliberatamente non un badge colorato: il punteggio 0-100 del risk
 * engine deterministico (src/lib/risk-engine.ts) ha bisogno di un posto
 * dove essere l'oggetto principale della pagina, non un dettaglio a lato.
 */
const TONE: Record<string, string> = {
  LOW: "#1F9254",
  MEDIUM: "#C2650C",
  HIGH: "#C4433B",
  CRITICAL: "#C4433B",
};

export default function RiskGauge({ score, level }: { score: number; level: string }) {
  const radius = 54;
  const stroke = 8;
  const circumference = Math.PI * radius; // semicerchio
  const progress = Math.min(100, Math.max(0, score)) / 100;
  const dash = circumference * progress;
  const color = TONE[level] ?? "#5F5F69";

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="80" viewBox="0 0 140 80">
        <path
          d="M 10 74 A 60 60 0 0 1 130 74"
          fill="none"
          stroke="#E6E6EB"
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
      <div className="tabular text-3xl font-display font-semibold -mt-6" style={{ color }}>
        {score}
      </div>
      <div className="text-xs text-ink-400 mt-0.5">out of 100</div>
    </div>
  );
}

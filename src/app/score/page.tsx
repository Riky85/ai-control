import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { PageHeader } from "@/components/ui";
import ScoreRing from "@/components/engine/ScoreRing";
import ForecastCard, { loadForecastCard } from "@/components/engine/ForecastCard";
import AnomalyList, { loadAnomalyList } from "@/components/engine/AnomalyList";
import PriceIndexCard, { loadPriceIndexCard } from "@/components/engine/PriceIndexCard";
import { formatPts, AxisGauge } from "@/components/engine/ScoreCard";
import { computeScoreCached, recordScoreSnapshot, scoreHistory, romeDay, type ScorePoint, type Driver } from "@/lib/engine/score";
import { AXES, AXIS_LABEL, AXIS_WEIGHT, type Axis } from "@/lib/engine/score-meta";

export const dynamic = "force-dynamic";

const AXIS_HINT: Record<Axis, string> = {
  efficiency: "Money that does work",
  governance: "Reviewed, owned, classified",
  risk: "Higher is safer",
  adoption: "People on approved AI",
};

const CONFIDENCE_TEXT = {
  high: "High confidence: costs, usage and discovery are connected.",
  medium: "Medium confidence: some sources are missing.",
  low: "Early estimate: angar has little data yet.",
} as const;

// angar Score: voto del parco AI, i 4 assi con i punti persi o recuperati e come sistemarli.
export default async function ScorePage() {
  const orgId = currentOrgId();
  const [forecast, anomalies, priceIndex] = await Promise.all([loadForecastCard(orgId), loadAnomalyList(orgId), loadPriceIndexCard(orgId)]);
  const [result, history] = await Promise.all([computeScoreCached(orgId), scoreHistory(orgId, 90)]);

  // Fotografia di oggi se manca (il lavoro giornaliero la aggiorna comunque).
  const today = romeDay();
  let points: ScorePoint[] = history;
  if (!history.some((p) => p.day === today)) {
    await recordScoreSnapshot(orgId, new Date(), result).catch(() => null);
    points = [...history, { day: today, score: result.score, axes: result.axes }];
  }
  const first = points[0];
  const delta = points.length >= 2 ? result.score - first.score : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="angar Score" subtitle="How well your company runs AI — cost, control, risk and use." />

      {/* Hero: anello, voto, verdetto, andamento */}
      <section className="relative overflow-hidden rounded-2xl border border-line bg-panel animate-rise">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 p-6 lg:p-8 items-center">
          <div className="flex justify-center">
            <ScoreRing score={result.score} grade={result.grade} size={210} />
          </div>
          <div className="flex flex-col gap-5 min-w-0">
            <div>
              <div className="flex items-center gap-2 text-xs text-ink-400">
                <span className="rounded-full border border-accent/40 px-2 py-0.5 text-accent font-medium">Grade {result.grade}</span>
                {delta != null && delta !== 0 && (
                  <span className={`tabular font-medium ${delta > 0 ? "text-steady" : "text-alarm"}`}>
                    {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} since {fmtDay(first.day)}
                  </span>
                )}
              </div>
              <h2 className="font-display text-[26px] leading-tight font-semibold tracking-tight text-ink-100 mt-2">{result.verdict}</h2>
              <p className="text-sm text-ink-400 mt-1">Computed only from your data. Every point has a reason below.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {AXES.map((a) => (
                <AxisGauge key={a} label={AXIS_LABEL[a]} value={result.axes[a]} size={76} />
              ))}
            </div>
            <Trend points={points} />
          </div>
        </div>
      </section>

      {/* I 4 assi con i loro driver */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {AXES.map((a) => (
          <AxisCard key={a} axis={a} value={result.axes[a]} drivers={result.drivers.filter((d) => d.axis === a)} />
        ))}
      </div>

      {/* angar Engine: previsione, anomalie e prezzi di mercato */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
        <ForecastCard {...forecast} />
        <AnomalyList {...anomalies} />
      </div>
      <PriceIndexCard {...priceIndex} />

      {/* Confidenza: quanto sa angar */}
      <section className="rounded-xl border border-line bg-panel px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm animate-rise">
        <span className="flex items-center gap-2 text-ink-100">
          <span className={`h-2 w-2 rounded-full ${result.confidence === "high" ? "bg-steady" : result.confidence === "medium" ? "bg-signal" : "bg-alarm"}`} />
          {CONFIDENCE_TEXT[result.confidence]}
        </span>
        {result.gaps.map((g) => (
          <Link key={g.href + g.label} href={g.href} className="text-ink-400 hover:text-ink-100">
            {g.label} →
          </Link>
        ))}
      </section>
    </div>
  );
}

function AxisCard({ axis, value, drivers }: { axis: Axis; value: number; drivers: Driver[] }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5 animate-rise flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-ink-100">{AXIS_LABEL[axis]}</h3>
          <p className="text-xs text-ink-400 mt-0.5">
            {AXIS_HINT[axis]} · {Math.round(AXIS_WEIGHT[axis] * 100)}% of the score
          </p>
        </div>
        <AxisGauge label="" value={value} size={56} />
      </div>
      {drivers.length === 0 ? (
        <div className="text-sm text-steady">Nothing to fix.</div>
      ) : (
        <ul className="flex flex-col divide-y divide-line -my-1">
          {drivers.map((d) => (
            <li key={d.label}>
              <Link href={d.href} className="flex items-center gap-3 py-2 text-sm group">
                <span className={`w-10 shrink-0 tabular font-medium ${d.impact > 0 ? "text-steady" : d.missingData ? "text-ink-400" : "text-alarm"}`}>
                  {d.impact > 0 ? "+" : "−"}
                  {Math.abs(d.impact)}
                </span>
                <span className="flex-1 min-w-0 truncate text-ink-100 group-hover:underline">{d.label}</span>
                <span className="text-xs text-ink-400 tabular shrink-0" title="Points on the angar Score">
                  {d.impact > 0 ? "+" : "−"}
                  {formatPts(Math.abs(d.scoreImpact))} total
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const fmtDay = (day: string) => new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Andamento del punteggio (SVG in linea). Con meno di due giorni non c'è ancora una linea. */
function Trend({ points }: { points: ScorePoint[] }) {
  if (points.length < 2) return <div className="text-xs text-ink-400">Trend starts tomorrow.</div>;
  const W = 480;
  const H = 56;
  const vals = points.map((p) => p.score);
  const lo = Math.max(0, Math.min(...vals) - 5);
  const hi = Math.min(100, Math.max(...vals) + 5);
  const x = (i: number) => (i * W) / (points.length - 1);
  const y = (v: number) => 4 + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - 8);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  return (
    <div className="max-w-xl">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" preserveAspectRatio="none" aria-label="Score trend">
        <defs>
          <linearGradient id="score-trend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF7323" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#FF7323" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#score-trend)" />
        <path d={line} fill="none" stroke="#FF7323" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-xs text-ink-400 tabular mt-1">
        <span>{fmtDay(points[0].day)}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

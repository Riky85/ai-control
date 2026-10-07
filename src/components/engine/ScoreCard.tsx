import Link from "next/link";
import { LEVEL, levelOf } from "./score-level";
import { LEVEL_STYLE, type Axis, type Level, type ScoreConfidence } from "@/lib/engine/score-meta";

/** Barra di un indice (governance, uso, posti…): linea, tratto riempito e punto sul valore. */
export function AxisTrack({ value, className = "" }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const lv = LEVEL[levelOf(v)];
  return (
    <div className={`relative h-3 ${className}`} aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
      {[25, 50, 75].map((t) => (
        <div key={t} className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-line" style={{ left: `${t}%` }} />
      ))}
      <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink-100/20" style={{ width: `${v}%` }} />
      <div className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel ${lv.dot}`} style={{ left: `${Math.max(1.5, Math.min(98.5, v))}%` }} />
    </div>
  );
}

/** Riquadro di un indice (cliccabile): nome, giudizio, valore e barra. Usato da Governance, Usage e altre pagine. */
export function AxisGauge({ label, value, size = 64, href }: { label: string; value: number; size?: number; href?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const lv = LEVEL[levelOf(v)];
  if (!label) return <AxisTrack value={v} className="w-32" />;
  const big = size >= 70;
  const body = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 min-w-0">
        <span className="text-xs font-semibold text-ink-100 min-w-0 max-w-full truncate">{label}</span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${lv.pill}`}>{lv.label}</span>
      </div>
      <div className={`font-display font-semibold tabular text-ink-100 leading-tight mt-1 ${big ? "text-[26px]" : "text-[22px]"}`}>
        {v}
        <span className="text-[11px] font-normal text-ink-400 ml-0.5">/100</span>
      </div>
      <AxisTrack value={v} className="mt-2" />
    </>
  );
  const cls = "block min-w-0 rounded-xl border border-line bg-panel px-3.5 py-3 transition-colors";
  return href ? (
    <Link href={href} className={`${cls} hover:border-ink-400 hover:bg-ink-100/[0.02] group`} aria-label={`${label}: ${v} out of 100, ${lv.label}. See details`}>
      {body}
    </Link>
  ) : (
    <div className={cls} role="group" aria-label={`${label}: ${v} out of 100, ${lv.label}`}>
      {body}
    </div>
  );
}

/** Compatibilità: il vecchio nome. */
export const AxisBar = AxisGauge;

/** Pillola del livello (Excellent / Good / Fair / Needs attention / Not measured yet). */
export function LevelPill({ level, label, className = "" }: { level: Level | null; label: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${LEVEL_STYLE[level ?? "none"].pill} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${LEVEL_STYLE[level ?? "none"].dot}`} aria-hidden />
      {label}
    </span>
  );
}

/** Barra sottile e grigia del punteggio (nessun colore: lo porta la pillola). */
export function ScoreBar({ value, className = "" }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={`h-1 rounded-full bg-ink-100/10 overflow-hidden ${className}`} aria-hidden>
      <div className="h-full rounded-full bg-ink-100/45" style={{ width: `${v}%` }} />
    </div>
  );
}

export interface ScoreCardDim {
  axis: Axis;
  label: string;
  value: number | null;
  level: Level | null;
  levelLabel: string;
}

export interface ScoreCardData {
  score: number;
  level: Level;
  levelLabel: string;
  verdict: string;
  /** Risparmi trovati (stesso totale di Savings). */
  savingsMonthlyEur: number;
  confidence: ScoreConfidence;
  confidenceLabel: string;
  dims: ScoreCardDim[];
  /** Punteggio con tutte le azioni e quante sono. */
  potential: number | null;
  actions: number;
  /** Variazione rispetto alla fotografia più vecchia confrontabile (stesso metodo). */
  delta?: { points: number; since: string } | null;
}

const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");
const fmtDay = (day: string) => new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Frase della card: verdetto + quanto si potrebbe risparmiare. */
export function scoreSentence(d: Pick<ScoreCardData, "verdict" | "savingsMonthlyEur">) {
  return d.savingsMonthlyEur >= 1 ? `${d.verdict} ${eur(d.savingsMonthlyEur)} a month could be saved.` : d.verdict;
}

/** Calibro segmentato: 50 tacche sottili, piene fino al punteggio (neutre: il colore sta solo nel punto del livello). */
function SegmentGauge({ value }: { value: number }) {
  const n = 50;
  const filled = Math.round((Math.max(0, Math.min(100, value)) / 100) * n);
  return (
    <div aria-hidden>
      <div className="flex gap-[3px] h-4">
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className={`flex-1 rounded-[1px] ${i < filled ? "bg-ink-100/85" : "bg-ink-100/[0.08]"}`} />
        ))}
      </div>
      {/* Soglie dei livelli: 40 · 60 · 80. */}
      <div className="relative mt-2 h-4 text-[11px] text-ink-400 tabular">
        <span className="absolute left-0">0</span>
        {[40, 60, 80].map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: `${t}%` }}>
            {t}
          </span>
        ))}
        <span className="absolute right-0">100</span>
      </div>
    </div>
  );
}

/**
 * Card dell'Angar Score per la Overview, in stile analisi finanziaria: numero
 * grande e sottile, calibro segmentato, una frase, le 5 dimensioni come righe
 * minime con barre sottili. "Improve my score" è il pulsante PRINCIPALE della
 * pagina (l'unico arancio). Solo presentazione.
 */
export default function ScoreCard({ data }: { data: ScoreCardData }) {
  const { score, level, levelLabel, confidence, confidenceLabel, dims, delta, potential, actions } = data;
  const gain = potential != null ? Math.round(potential - score) : 0;
  return (
    <section className="rounded-xl border border-line bg-panel animate-rise" aria-labelledby="score-card-title">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Sinistra: punteggio */}
        <div className="flex flex-col min-w-0 p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <h2 id="score-card-title" className="text-[15px] font-bold tracking-[-0.01em] text-ink-100">
              Angar Score
            </h2>
            {confidence !== "measured" && confidence !== "high" && <span className="text-xs text-ink-400 shrink-0">{confidenceLabel}</span>}
          </div>

          <div className="flex items-end gap-4 mt-6">
            <span className="text-[80px] leading-[0.8] font-medium tracking-[-0.05em] tabular text-ink-100">{score}</span>
            <div className="flex flex-col gap-1.5 pb-1">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-100">
                <span className={`h-1.5 w-1.5 rounded-full ${LEVEL_STYLE[level].dot}`} aria-hidden />
                {levelLabel}
              </span>
              <span className="text-xs text-ink-400 tabular">
                out of 100
                {delta && (
                  <>
                    {" · "}
                    <span className={delta.points > 0 ? "text-steady" : delta.points < 0 ? "text-alarm" : ""}>
                      {delta.points > 0 ? "+" : ""}
                      {formatPts(delta.points)}
                    </span>{" "}
                    since {fmtDay(delta.since)}
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="mt-7">
            <SegmentGauge value={score} />
          </div>

          <p className="text-sm leading-relaxed text-ink-400 mt-5 max-w-md">{data.verdict}</p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-auto pt-7">
            <Link href="/score/improve" className="btn btn-primary">
              Improve my score
            </Link>
            {gain > 0 && actions > 0 ? (
              <span className="text-xs text-ink-400 tabular">
                Up to <span className="text-ink-100 font-medium">{Math.round(potential!)}</span> with {actions} action{actions === 1 ? "" : "s"}
              </span>
            ) : (
              <Link href="/score" className="text-sm text-ink-400 hover:text-ink-100 transition-colors">
                See details →
              </Link>
            )}
          </div>
        </div>

        {/* Destra: le 5 dimensioni */}
        <div className="min-w-0 border-t lg:border-t-0 lg:border-l border-line p-6 sm:p-8 flex flex-col">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-bold tracking-[-0.01em] text-ink-100">Breakdown</h3>
            <Link href="/score" className="text-xs text-ink-400 hover:text-ink-100 transition-colors">
              See details →
            </Link>
          </div>
          <ul className="flex flex-col mt-4 flex-1 justify-center" aria-label="Dimensions">
            {dims.map((d) => {
              const v = d.value == null ? null : Math.max(0, Math.min(100, Math.round(d.value)));
              return (
                <li key={d.axis} className="border-b border-line last:border-0">
                  <Link
                    href={`/score#axis-${d.axis}`}
                    className="group grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_2rem_8.75rem] items-center gap-x-5 gap-y-2 py-3.5"
                    aria-label={`${d.label}: ${v ?? "not measured"}${v != null ? " out of 100" : ""}, ${d.levelLabel}`}
                  >
                    <span className="text-sm text-ink-100 truncate group-hover:underline underline-offset-4 decoration-ink-100/30">{d.label}</span>
                    <span className="order-last sm:order-none col-span-2 sm:col-span-1 h-1 rounded-full bg-ink-100/[0.08] overflow-hidden" aria-hidden>
                      {v != null && <span className="block h-full rounded-full bg-ink-100/75 animate-grow" style={{ width: `${Math.max(2, v)}%` }} />}
                    </span>
                    <span className="text-sm font-medium tabular text-ink-100 text-right">{v ?? "—"}</span>
                    <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-ink-400 min-w-0">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_STYLE[d.level ?? "none"].dot}`} aria-hidden />
                      <span className="truncate">{d.levelLabel}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

export const formatPts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

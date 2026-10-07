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

/**
 * Card dell'angar Score per la Overview: numero grande, livello, una frase,
 * le 5 dimensioni in righe compatte e "Improve my score" come pulsante
 * PRINCIPALE della pagina (l'unico arancio). Solo presentazione.
 */
export default function ScoreCard({ data }: { data: ScoreCardData }) {
  const { score, level, levelLabel, confidence, confidenceLabel, dims, delta, potential, actions } = data;
  return (
    <section className="rounded-2xl border border-line bg-panel animate-rise" aria-labelledby="score-card-title">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 lg:gap-10 p-5 sm:p-6">
        <div className="flex flex-col min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="score-card-title" className="text-sm font-bold text-ink-100">
              angar Score <span className="font-normal text-ink-400">· AI spend efficiency</span>
            </h2>
            {confidence !== "measured" && confidence !== "high" && <span className="text-xs text-ink-400 shrink-0">{confidenceLabel}</span>}
          </div>
          <div className="flex items-end gap-3 mt-3">
            <span className="font-display text-[56px] leading-[0.9] font-bold tracking-tight tabular text-ink-100">{score}</span>
            <span className="text-sm text-ink-400 pb-1">/ 100</span>
            <LevelPill level={level} label={levelLabel} className="mb-1.5" />
          </div>
          <ScoreBar value={score} className="mt-4 max-w-sm" />
          <p className="text-sm text-ink-100 mt-4 leading-snug max-w-md">{scoreSentence(data)}</p>
          {(delta || (potential != null && potential > score)) && (
            <p className="text-xs text-ink-400 mt-1.5 tabular">
              {potential != null && potential > score && `${actions} ${actions === 1 ? "action" : "actions"} could take it to ${potential}.`}
              {delta && delta.points !== 0 && ` ${delta.points > 0 ? "▲" : "▼"} ${Math.abs(delta.points)} since ${fmtDay(delta.since)}.`}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-5">
            <Link href="/score/improve" className="btn btn-primary">
              Improve my score
            </Link>
            <Link href="/score" className="btn btn-ghost">
              See details
            </Link>
          </div>
        </div>

        <ul className="flex flex-col divide-y divide-line self-center min-w-0" aria-label="Dimensions">
          {dims.map((d) => (
            <li key={d.axis}>
              <Link href={`/score#axis-${d.axis}`} className="flex items-center justify-between gap-3 py-2.5 group">
                <span className="text-sm text-ink-100 min-w-0 truncate group-hover:underline">{d.label}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-xs tabular text-ink-400 w-6 text-right">{d.value ?? "—"}</span>
                  <LevelPill level={d.level} label={d.levelLabel} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export const formatPts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

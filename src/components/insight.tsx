import Link from "next/link";

/**
 * Blocchi "intelligenti" condivisi dalle pagine elenco: una riga di insight
 * (una frase + un'azione), un mini grafico a barre giornaliero in SVG puro
 * (nessuna libreria) e uno stato vuoto con una sola azione.
 */

const DOT = { accent: "bg-accent", signal: "bg-signal", alarm: "bg-alarm", steady: "bg-steady", muted: "bg-ink-400" } as const;
export type InsightTone = keyof typeof DOT;

/** Una frase che dice qualcosa di utile, con il link per agire. */
export function Insight({ tone = "accent", children, href, cta }: { tone?: InsightTone; children: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3 flex items-center gap-3 text-sm animate-rise">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden />
      <span className="flex-1 min-w-0 text-ink-100">{children}</span>
      {href && (
        <Link href={href} className="shrink-0 text-ink-400 hover:text-ink-100 whitespace-nowrap">
          {cta ?? "Open"} →
        </Link>
      )}
    </div>
  );
}

/** Stato vuoto: una riga di spiegazione e l'unica azione che lo riempie. */
export function EmptyState({ title, text, href, cta }: { title: string; text?: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-panel p-8 text-center animate-rise">
      <h2 className="text-base font-semibold text-ink-100">{title}</h2>
      {text && <p className="text-sm text-ink-400 mt-1 max-w-lg mx-auto">{text}</p>}
      {href && cta && (
        <Link href={href} className="btn btn-primary btn-sm mt-4">
          {cta}
        </Link>
      )}
    </div>
  );
}

/**
 * Barre giornaliere (dal più vecchio al più recente), SVG scritto a mano:
 * l'ultima barra in arancio pieno, le altre attenuate; tooltip nativo per barra.
 */
export function DayBars({ values, labels, height = 44, unit = "" }: { values: number[]; labels?: string[]; height?: number; unit?: string }) {
  const n = values.length;
  if (!n) return null;
  const max = Math.max(1, ...values);
  const W = n * 10;
  const total = values.reduce((t, v) => t + v, 0);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label={`${total}${unit} in the last ${n} days`}>
      {values.map((v, i) => {
        const h = v > 0 ? Math.max(2, (v / max) * (height - 2)) : 1;
        return (
          <rect key={i} x={i * 10 + 1} y={height - h} width={8} height={h} rx={1.5} className={v > 0 ? "fill-accent" : "fill-ink-400"} fillOpacity={v > 0 ? (i === n - 1 ? 1 : 0.55) : 0.25}>
            <title>{`${labels?.[i] ?? ""}${labels?.[i] ? ": " : ""}${v}${unit}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Pannello compatto con titolo a sinistra, nota a destra e le barre giornaliere. */
export function TrendPanel({ title, note, values, labels, unit }: { title: string; note?: React.ReactNode; values: number[]; labels?: string[]; unit?: string }) {
  return (
    <section className="rounded-xl border border-line bg-panel flex flex-col animate-rise">
      <div className="bg-ink border-b border-line rounded-t-xl px-5 py-3 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-ink-100">{title}</span>
        {note && <span className="text-xs text-ink-400 truncate">{note}</span>}
      </div>
      <div className="px-5 py-4">
        <DayBars values={values} labels={labels} unit={unit} />
      </div>
    </section>
  );
}

const DAY = 86400000;

/**
 * Conteggi giornalieri degli ultimi `days` giorni (UTC), dal più vecchio; con le etichette "12 Sep".
 * Con `weight` ogni data pesa quanto indicato (es. visite di un evento) invece di 1.
 */
export function dailySeries<T = Date>(items: T[], days = 30, pick: (x: T) => Date = (x) => x as unknown as Date, weight: (x: T) => number = () => 1, now = new Date()) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = end - (days - 1) * DAY;
  const values = new Array<number>(days).fill(0);
  for (const x of items) {
    const d = pick(x);
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const i = Math.round((t - start) / DAY);
    if (i >= 0 && i < days) values[i] += weight(x);
  }
  const labels = values.map((_, i) => new Date(start + i * DAY).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }));
  return { values, labels };
}

/** Variazione % tra due periodi; null se il periodo precedente è vuoto. */
export function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** "up 40%" / "down 12%" / "flat". */
export function trendWord(pct: number) {
  return pct === 0 ? "flat" : pct > 0 ? `up ${pct}%` : `down ${Math.abs(pct)}%`;
}

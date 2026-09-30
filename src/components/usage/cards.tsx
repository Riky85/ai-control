import Link from "next/link";
import { VendorBadge } from "@/components/VendorIcon";
import { AxisTrack } from "@/components/engine/ScoreCard";
import { fmtEur } from "@/lib/format";
import { Pill, Section, NextStep } from "@/components/governance/parts";

/**
 * Blocchi di presentazione della pagina Usage: solo dati serializzabili in
 * ingresso (conteggi già mascherati dalla pagina secondo la privacy).
 */

const eur = (n: number) => fmtEur(Math.round(n));
const pct = (used: number, paid: number) => (paid > 0 ? Math.round((used / paid) * 100) : 0);

/** Barra dei posti: usati su pagati, stesso linguaggio degli assi dell'angar Score. */
export function SeatTrack({ used, paid, className = "" }: { used: number; paid: number; className?: string }) {
  const p = pct(used, paid);
  return (
    <div className={className} role="img" aria-label={`${used} of ${paid} paid seats used (${p}%)`} title={`${used} of ${paid} seats used`}>
      <AxisTrack value={p} />
    </div>
  );
}

export interface UsageSummaryData {
  /** Già mascherato (es. "<5") fuori dalla modalità per persona. */
  people: string;
  peopleHref: string;
  aiInUse: number;
  /** Posti pagati su AI di cui si sa chi le usa (altrimenti null). */
  seatsPaid: number | null;
  seatsUsed: number | null;
  unusedSeats: number;
  seatsHref: string;
  unusedEur: number;
}

/** Una sola riga di numeri: persone attive, AI in uso, posti usati/pagati, posti non usati in €. */
export function UsageSummary({ d }: { d: UsageSummaryData }) {
  const cell = "bg-panel px-5 py-4 flex flex-col gap-1 min-w-0";
  const link = `${cell} hover:bg-ink-100/[0.02] transition-colors`;
  const big = "font-display text-[26px] leading-tight font-semibold tracking-tight tabular";
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-2xl border border-line bg-line animate-rise" aria-label="Usage summary">
      <Link href={d.peopleHref} className={link}>
        <span className="text-xs text-ink-400">Active people · 30 days</span>
        <span className={`${big} text-ink-100`}>{d.people}</span>
        <span className="text-xs text-ink-400 truncate">Used any AI</span>
      </Link>
      <div className={cell}>
        <span className="text-xs text-ink-400">AI in use</span>
        <span className={`${big} text-ink-100`}>{d.aiInUse}</span>
        <span className="text-xs text-ink-400 truncate">In the last 30 days</span>
      </div>
      <Link href={d.seatsHref} className={link}>
        <span className="flex items-center justify-between gap-2 text-xs text-ink-400">
          Seats used
          {d.seatsPaid ? <span className="tabular">{pct(d.seatsUsed ?? 0, d.seatsPaid)}%</span> : null}
        </span>
        <span className={`${big} text-ink-100`}>
          {d.seatsPaid ? (
            <>
              {d.seatsUsed}
              <span className="text-sm font-normal text-ink-400"> / {d.seatsPaid}</span>
            </>
          ) : (
            "—"
          )}
        </span>
        {d.seatsPaid ? <SeatTrack used={d.seatsUsed ?? 0} paid={d.seatsPaid} /> : <span className="text-xs text-ink-400">No seat plans with known users</span>}
      </Link>
      <Link href="/savings?kind=seats" className={link}>
        <span className="flex items-center justify-between gap-2 text-xs text-ink-400">
          Unused seats
          {d.unusedSeats > 0 && <Pill tone="signal">{d.unusedSeats}</Pill>}
        </span>
        <span className={`${big} ${d.unusedEur >= 1 ? "text-accent" : "text-ink-100"}`}>{d.unusedEur >= 1 ? eur(d.unusedEur) : "—"}</span>
        <span className="text-xs text-ink-400 truncate">{d.unusedEur >= 1 ? `a month · ${eur(d.unusedEur * 12)} a year` : d.unusedSeats ? "No seat price" : "Every paid seat is used"}</span>
      </Link>
    </section>
  );
}

export interface AiUsageRow {
  id: string;
  name: string;
  vendor: string | null;
  /** Persone attive, già mascherate. */
  people: string;
  visits: number;
  seats: number | null;
  /** true se si sa chi usa i posti (almeno una persona nota). */
  measured: boolean;
  idle: number;
  save: number;
  cleanupHref: string;
}

/** "By AI": persone, barra dei posti usati e pillola con i posti non usati in € al mese. */
export function ByAiList({ rows }: { rows: AiUsageRow[] }) {
  const idleTotal = rows.reduce((t, r) => t + r.idle, 0);
  const top = rows.find((r) => r.idle > 0);
  return (
    <Section
      id="by-ai"
      title="By AI"
      meta={rows.length ? `${rows.length} AI · seats used in the last 30 days` : "No usage yet"}
      footer={top ? <NextStep href={top.cleanupHref} label={`Clean up ${idleTotal} unused seat${idleTotal === 1 ? "" : "s"}, starting with ${top.name}`} /> : rows.length ? <NextStep done label="No unused paid seats" /> : undefined}
    >
      {rows.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {rows.map((r) => {
            const used = r.seats != null ? r.seats - r.idle : null;
            return (
              <li key={r.id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,13rem)_16.5rem] items-center gap-x-5 gap-y-2 px-5 py-3">
                <Link href={`/assets/${r.id}?tab=people`} className="flex items-center gap-3 min-w-0 group">
                  <VendorBadge vendor={r.vendor ?? ""} name={r.name} size={30} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink-100 truncate group-hover:underline">{r.name}</span>
                    <span className="block text-xs text-ink-400 tabular truncate">
                      <b className="font-medium text-ink-100">{r.people}</b> {r.people === "1" ? "person" : "people"}
                      {r.visits ? ` · ${r.visits.toLocaleString("en-GB")} visits` : ""}
                    </span>
                  </span>
                </Link>
                <div className="hidden sm:block min-w-0">
                  {r.seats && r.measured && used != null ? (
                    <>
                      <div className="text-xs text-ink-400 tabular mb-0.5">
                        <b className="font-medium text-ink-100">{used}</b> of {r.seats} seats used
                      </div>
                      <SeatTrack used={used} paid={r.seats} />
                    </>
                  ) : (
                    <div className="text-xs text-ink-400">{r.seats ? `${r.seats} seats · users unknown` : "No seat plan"}</div>
                  )}
                </div>
                <div className="flex items-center sm:justify-end gap-2 empty:hidden">
                  {r.idle > 0 ? (
                    <Pill tone="signal">
                      {r.idle} unused seat{r.idle === 1 ? "" : "s"}
                      {r.save >= 1 ? ` · ${eur(r.save)} a month` : ""}
                    </Pill>
                  ) : r.seats && r.measured ? (
                    <Pill tone="steady">All seats used</Pill>
                  ) : null}
                  {r.idle > 0 && (
                    <Link href={r.cleanupHref} className="btn btn-secondary btn-sm">
                      Clean up
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

export interface RankRow {
  key: string;
  label: string;
  sub?: string;
  /** Valore della barra (es. giorni attivi) e il suo massimo. */
  bar: number;
  barMax: number;
  barLabel: string;
  right: string;
}

/** Classifica compatta (per persona o per reparto) con barra neutra e link alla vista completa. */
export function RankList({ id, title, meta, rows, href, cta, empty }: { id: string; title: string; meta?: string; rows: RankRow[]; href: string; cta: string; empty: string }) {
  return (
    <Section
      id={id}
      title={title}
      meta={meta}
      action={
        <Link href={href} className="text-sm text-ink-400 hover:text-ink-100">
          {cta} →
        </Link>
      }
    >
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_8rem] items-center gap-x-5 gap-y-1 px-5 py-2.5">
              <div className="min-w-0">
                <div className="text-sm text-ink-100 truncate">{r.label}</div>
                {r.sub && <div className="text-xs text-ink-400 truncate">{r.sub}</div>}
              </div>
              <div className="hidden sm:flex items-center gap-3 min-w-0" title={r.barLabel}>
                <div className="relative h-3 flex-1" aria-hidden>
                  <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
                  <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent/40" style={{ width: `${Math.max(2, Math.min(100, (r.bar / Math.max(1, r.barMax)) * 100))}%` }} />
                </div>
                <span className="text-xs text-ink-400 tabular shrink-0 w-20 text-right whitespace-nowrap">{r.barLabel}</span>
              </div>
              <span className="text-xs text-ink-400 tabular text-right">{r.right}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Viste della pagina (?view=): schede leggere, sottolineate quando attive. */
export function ViewNav({ items, active }: { items: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav className="flex gap-5 border-b border-line overflow-x-auto" aria-label="Usage views">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={`shrink-0 -mb-px border-b-2 pb-2 text-sm transition-colors ${active === t.key ? "border-accent text-ink-100 font-medium" : "border-transparent text-ink-400 hover:text-ink-100"}`}
        >
          {t.label}
          {t.count ? <span className="ml-1.5 text-ink-400 tabular font-normal">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

import Link from "next/link";
import { priceIndexFor, type PriceIndexRow, type Verdict, type PriceSource } from "@/lib/engine/price-index";
import { fmtEur } from "@/lib/format";
import { BlockHead } from "@/components/ui";

/** Riga dell'indice come la usa l'interfaccia (solo dati serializzabili). */
export type PriceRow = Pick<
  PriceIndexRow,
  "serviceId" | "name" | "vendor" | "assetIds" | "planName" | "seats" | "yourSeatEur" | "peers" | "listSeatEur" | "source" | "yourUtilisation" | "peerUtilisation" | "verdict" | "deltaPct"
>;

export interface PriceIndexCardProps {
  rows: PriceRow[];
  /** Aziende nell'indice (null sotto la soglia: si mostrano i listini). */
  networkCompanies: number | null;
  minCompanies: number;
}

const MAX_ROWS = 6;

/** Dati della card: indice prezzi dell'azienda, righe con un prezzo confrontabile prima. */
export async function loadPriceIndexCard(orgId: string): Promise<PriceIndexCardProps> {
  const idx = await priceIndexFor(orgId);
  const rows = idx.rows.map(pickRow);
  return { rows, networkCompanies: idx.networkCompanies, minCompanies: idx.minCompanies };
}

export function pickRow(r: PriceIndexRow): PriceRow {
  const { serviceId, name, vendor, assetIds, planName, seats, yourSeatEur, peers, listSeatEur, source, yourUtilisation, peerUtilisation, verdict, deltaPct } = r;
  return { serviceId, name, vendor, assetIds, planName, seats, yourSeatEur, peers, listSeatEur, source, yourUtilisation, peerUtilisation, verdict, deltaPct };
}

const seat = (n: number) => fmtEur(n, { decimals: n < 100 });
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Pillola del verdetto: colore + testo (mai solo colore). */
export function VerdictPill({ verdict, source, deltaPct }: { verdict: Verdict; source: PriceSource; deltaPct: number | null }) {
  const ref = source === "list" ? "list" : "market";
  const d = deltaPct != null && Math.abs(deltaPct) >= 1 ? ` ${deltaPct > 0 ? "+" : "−"}${Math.abs(deltaPct)}%` : "";
  const map: Record<Verdict, { label: string; cls: string }> = {
    above: { label: `Above ${ref}${d}`, cls: "text-accent bg-accent/10" },
    fair: { label: source === "list" ? "At list" : "Fair", cls: "text-ink-400 bg-ink-100/[0.06]" },
    below: { label: `Below ${ref}${d}`, cls: "text-steady bg-steady/10" },
    unknown: { label: "No seat price", cls: "text-ink-400 bg-ink-100/[0.06]" },
  };
  const v = map[verdict];
  return <span className={`inline-flex items-center rounded-[2px] px-1.5 py-0.5 font-mono uppercase tracking-[0.05em] text-[10px] tabular whitespace-nowrap ${v.cls}`}>{v.label}</span>;
}

/**
 * Barretta p25–p75 (fascia), tacca sulla mediana, punto per "tu".
 * Con il solo listino: tacca sul listino e punto per "tu".
 */
export function PriceRangeBar({ row, className = "" }: { row: Pick<PriceRow, "peers" | "listSeatEur" | "yourSeatEur" | "verdict">; className?: string }) {
  const p = row.peers;
  const ref = p ? p.median : row.listSeatEur;
  if (ref == null) return <div className={className} />;
  const vals = [ref, ...(p ? [p.p25, p.p75] : []), ...(row.yourSeatEur != null ? [row.yourSeatEur] : [])];
  const lo = Math.min(...vals) * 0.8;
  const hi = Math.max(...vals) * 1.15;
  const x = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo || 1)) * 100))}%`;
  const dot = row.verdict === "above" ? "bg-accent" : row.verdict === "below" ? "bg-steady" : "bg-ink-100";
  const label = p
    ? `Market ${seat(p.p25)} to ${seat(p.p75)}, median ${seat(p.median)}${row.yourSeatEur != null ? `; you ${seat(row.yourSeatEur)}` : ""}`
    : `List ${seat(ref)}${row.yourSeatEur != null ? `; you ${seat(row.yourSeatEur)}` : ""}`;
  return (
    <div className={`relative h-3 ${className}`} role="img" aria-label={label} title={label}>
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink-100/[0.08]" />
      {p && <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink-100/30" style={{ left: x(p.p25), width: `calc(${x(p.p75)} - ${x(p.p25)})` }} />}
      <div className={`absolute top-0 h-3 w-px ${p ? "bg-ink-100" : "bg-ink-400"}`} style={{ left: x(ref) }} />
      {row.yourSeatEur != null && (
        <div className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel ${dot}`} style={{ left: x(row.yourSeatEur) }} />
      )}
    </div>
  );
}

/** "What you pay vs the market": prezzo di un posto per ogni AI contro mediana di mercato o listino. */
export default function PriceIndexCard({ rows, networkCompanies, minCompanies }: PriceIndexCardProps) {
  const shown = rows.slice(0, MAX_ROWS);
  return (
    <section className="rounded-xl border border-line bg-panel animate-rise" aria-labelledby="price-index-title">
      <BlockHead
        id="price-index-title"
        rounded="rounded-t-xl"
        title="Seat price vs market"
        action={
          <span className="flex items-center gap-3 eyebrow shrink-0" aria-hidden>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ink-100" />You</span>
            <span className="flex items-center gap-1.5"><span className="h-1 w-3 rounded-full bg-ink-100/30" />{networkCompanies ? "Middle 50%" : "List"}</span>
          </span>
        }
      />

      {shown.length === 0 ? (
        <p className="p-5 text-sm text-ink-400">No seat prices yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((r) => (
            <li key={r.serviceId} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 px-5 py-3">
              <div className="min-w-0">
                <Link href={`/estate/${r.assetIds[0]}`} className="text-sm text-ink-100 hover:underline truncate block">{r.name}</Link>
                <div className="eyebrow mt-0.5 flex flex-wrap gap-x-3 tabular">
                  <span>
                    You <b className={`font-normal ${r.verdict === "above" ? "text-accent" : "text-ink-100"}`}>{r.yourSeatEur != null ? seat(r.yourSeatEur) : "—"}</b>
                  </span>
                  <span>
                    {r.source === "peers" && r.peers ? "Market" : "List"}{" "}
                    <b className="font-normal text-ink-100">{r.source === "peers" && r.peers ? seat(r.peers.median) : r.listSeatEur != null ? seat(r.listSeatEur) : "—"}</b>
                  </span>
                  {r.yourUtilisation != null && (
                    <span title="Seats used in the last 30 days">
                      {pct(r.yourUtilisation)} used{r.peerUtilisation ? ` · peers ${pct(r.peerUtilisation.median)}` : ""}
                    </span>
                  )}
                </div>
              </div>
              <PriceRangeBar row={r} className="hidden sm:block" />
              <VerdictPill verdict={r.verdict} source={r.source} deltaPct={r.deltaPct} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3 bg-ink border-t border-line rounded-b-xl px-5 py-3 eyebrow bar-foot">
        <span title={networkCompanies ? "Anonymous" : `Market data unlocks at ${minCompanies} similar companies`}>{networkCompanies ? `${networkCompanies} companies` : "List prices"}</span>
        {rows.length > MAX_ROWS && <span className="tabular shrink-0">+{rows.length - MAX_ROWS} more</span>}
      </div>
    </section>
  );
}

/** Blocco compatto per la pagina di un'AI: prezzo di un posto vs mercato o listino, verdetto. */
export function MarketPriceStrip({ row }: { row: PriceRow }) {
  const market = row.source === "peers" && row.peers;
  return (
    <section className="rounded-xl border border-line bg-panel px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 animate-rise" aria-label="Market price">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink-100">Market price</span>
          <VerdictPill verdict={row.verdict} source={row.source} deltaPct={row.deltaPct} />
        </div>
        <div className="text-xs text-ink-400 mt-1 tabular">
          One seat: you <b className={`font-normal ${row.verdict === "above" ? "text-accent" : "text-ink-100"}`}>{row.yourSeatEur != null ? seat(row.yourSeatEur) : "—"}</b>
          {" · "}
          {market ? (
            <>
              market median <b className="font-normal text-ink-100">{seat(market.median)}</b> ({market.count} companies)
            </>
          ) : row.listSeatEur != null ? (
            <>
              list <b className="font-normal text-ink-100">{seat(row.listSeatEur)}</b>
              {row.planName ? ` (${row.planName})` : ""}
            </>
          ) : (
            "no reference price"
          )}
        </div>
      </div>
      <PriceRangeBar row={row} className="w-full sm:w-48 shrink-0" />
    </section>
  );
}

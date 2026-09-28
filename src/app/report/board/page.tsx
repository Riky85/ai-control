import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { buildBoardPack, type QuarterBar } from "@/lib/board-pack";
import { scopeLabel } from "@/lib/benchmark";
import { Wordmark } from "@/components/Logo";
import PrintButton from "@/components/PrintButton";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";

export const dynamic = "force-dynamic";

const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");
const eur2 = (n: number) => "€" + n.toLocaleString("en-GB", { minimumFractionDigits: n < 100 ? 2 : 0, maximumFractionDigits: n < 100 ? 2 : 0 });
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
const longDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });

/**
 * Board / CFO pack trimestrale: documento A4 su carta bianca (anche a
 * schermo), "Download PDF" = stampa del browser con gli stili di stampa.
 */
export default async function BoardPackPage({ searchParams }: { searchParams: { q?: string } }) {
  const p = await buildBoardPack(currentOrgId(), searchParams.q);
  const s = p.spend;
  const qLabel = `Q${p.selected.q} ${p.selected.year}`;
  const toDate = p.selected.key === p.current.key;
  const quarterSpend = s.selectedActual;
  const qoq = quarterSpend != null && s.prevActual ? pct(quarterSpend, s.prevActual) : null;
  const yoy = quarterSpend != null && s.yearAgo ? pct(quarterSpend, s.yearAgo) : null;
  const b = p.perEmployee;
  const benchDiff = b.peers && b.yours != null && b.peers.median > 0 ? Math.round(((b.yours - b.peers.median) / b.peers.median) * 100) : null;
  const saved = p.savings.realisedMonthly + p.savings.doneMonthly;

  return (
    <div className="board-wrap">
      <style>{PRINT_CSS}</style>
      <div className="no-print max-w-[820px] mx-auto mb-4 flex items-center justify-between gap-3">
        <Link href="/report" className="text-sm text-ink-400 hover:text-ink-100">← Monthly report</Link>
        <div className="flex items-center gap-2">
          <form method="get" className="flex items-center">
            <AutoSubmitSelect name="q" defaultValue={p.selected.key} className="field py-1.5" aria-label="Quarter">
              {p.quarters.map((q) => (
                <option key={q.key} value={q.key}>
                  Q{q.q} {q.year}
                  {q.key === p.current.key ? " (to date)" : ""}
                </option>
              ))}
            </AutoSubmitSelect>
          </form>
          <PrintButton label="Download PDF" />
        </div>
      </div>

      <article className="board-paper max-w-[820px] mx-auto bg-white text-[#141418] rounded-xl shadow-card px-14 py-12">
        <header className="flex items-start justify-between border-b-2 border-[#141418] pb-5">
          <div className="text-[#141418]"><Wordmark size={22} /></div>
          <div className="text-right text-xs text-[#5F5F69] leading-relaxed">
            <div className="font-semibold uppercase tracking-wider text-[#141418]">AI board pack · {qLabel}</div>
            <div>{p.org?.name}</div>
            <div>Prepared {longDate(p.now)}</div>
          </div>
        </header>

        <section className="pt-8">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#FF7323]">Summary</div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight mt-2">
            {p.aiCount} AI tools in use, costing {eur(s.monthlyRunRate)} a month ({eur(s.annualRunRate)} a year at the current rate).
            {saved > 0 ? ` ${eur(saved)} a month already saved.` : p.savings.identifiedMonthly > 0 ? ` ${eur(p.savings.identifiedMonthly)} a month could be saved.` : ""}
          </h1>
          <p className="text-sm text-[#5F5F69] mt-3 max-w-[640px]">
            {quarterSpend != null
              ? `${toDate ? `${qLabel} so far` : qLabel}: ${eur(quarterSpend)} of AI charges${qoq != null && !toDate ? `, ${qoq >= 0 ? "+" : ""}${qoq}% on the previous quarter` : ""}${yoy != null && !toDate ? `, ${yoy >= 0 ? "+" : ""}${yoy}% year on year` : ""}. `
              : "No bank or invoice charges imported yet — figures use the current monthly cost of each AI. "}
            AI Act readiness is {p.aiAct.score}%{p.shadow.toReview ? `, with ${p.shadow.toReview} AI found that nobody has reviewed yet` : ""}.
          </p>
        </section>

        <section className="grid grid-cols-4 mt-8 border border-[#DCDCE1] rounded-lg overflow-hidden">
          <Kpi label={toDate ? `${qLabel} to date` : `${qLabel} spend`} value={quarterSpend != null ? eur(quarterSpend) : eur(s.monthlyRunRate * 3)} hint={quarterSpend != null ? "From charges" : "Current cost × 3"} />
          <Kpi label="Annual run rate" value={eur(s.annualRunRate)} hint={`${eur(s.monthlyRunRate)} per month`} border />
          <Kpi label="Per employee / month" value={b.yours != null ? eur2(b.yours) : "—"} hint={b.peers ? `Median ${eur2(b.peers.median)}` : b.employeesSet ? "Benchmark not ready" : "Set employee count"} border />
          <Kpi label="Savings realised / month" value={eur(saved)} hint={p.savings.realisedMonthly > 0 ? `${eur(p.savings.realisedMonthly)} verified on charges` : "Verified on the next charge"} border accent />
        </section>

        <section className="mt-10 avoid-break">
          <H2 n={1}>Spend trend and outlook</H2>
          <TrendChart bars={[...s.bars, ...s.forecastBars]} />
          <p className="text-xs text-[#5F5F69] mt-2">
            <span className="inline-block h-2.5 w-2.5 bg-[#141418] align-middle mr-1" /> Charges (bank and invoices)
            <span className="inline-block h-2.5 w-2.5 bg-[#FF7323]/40 border border-dashed border-[#FF7323] align-middle ml-4 mr-1" /> <b>Estimate</b> —{" "}
            {s.method === "regression"
              ? `linear trend on the last ${s.fittedMonths} months of charges (${s.slopePerMonth >= 0 ? "+" : "−"}${eur(Math.abs(s.slopePerMonth))} per month).`
              : "current monthly cost of each AI; a trend needs at least 3 months of charges."}{" "}
            Next 4 quarters ≈ {eur(s.nextYearEstimate)}. Estimates are indicative, not a budget.
          </p>
        </section>

        <section className="mt-10 avoid-break">
          <H2 n={2}>Spend per employee vs similar companies</H2>
          <p className="text-sm mt-3">
            {b.yours == null
              ? "Add the number of employees in Settings to compare AI spend per employee."
              : b.peers
                ? <>You spend <b>{eur2(b.yours)}</b> per employee per month. The median for {scopeLabel(b)} is <b>{eur2(b.peers.median)}</b> (middle 50%: {eur2(b.peers.p25)}–{eur2(b.peers.p75)}){benchDiff != null && Math.abs(benchDiff) >= 5 ? <> — you are <b>{Math.abs(benchDiff)}% {benchDiff > 0 ? "above" : "below"}</b> the median</> : null}.</>
                : <>You spend <b>{eur2(b.yours)}</b> per employee per month. The benchmark appears when {b.minCompanies}+ comparable companies use angar.</>}
          </p>
          <p className="text-xs text-[#5F5F69] mt-1">Anonymous and aggregated across angar customers.</p>
        </section>

        <section className="mt-10 avoid-break">
          <H2 n={3}>Savings</H2>
          <table className="w-full text-sm mt-3">
            <tbody>
              <Line label="Verified on the charges after the change" value={`${eur(p.savings.realisedMonthly)}/mo`} />
              <Line label="Done, waiting for the next charge to confirm" value={`${eur(p.savings.doneMonthly)}/mo`} />
              <Line label="Accepted, not done yet" value={`${eur(p.savings.acceptedMonthly)}/mo`} />
              <Line label="Found, not yet acted on" value={`${eur(p.savings.identifiedMonthly)}/mo`} />
            </tbody>
          </table>
          {p.savings.top.length > 0 && (
            <ol className="mt-4 flex flex-col gap-2">
              {p.savings.top.map((x, i) => (
                <li key={x.title} className="flex items-start gap-4 border-l-4 border-[#FF7323] bg-[#FAFAFB] px-4 py-2.5 rounded-r-md text-sm">
                  <span className="font-semibold text-[#FF7323] tabular">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex-1">{x.title}</span>
                  <span className="tabular font-semibold">{eur(x.monthlyEur)}/mo</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="mt-10 avoid-break">
          <H2 n={4}>Top AI tools by cost</H2>
          <table className="w-full text-sm mt-3">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[#5F5F69] border-b border-[#141418]">
                <th className="py-2 font-semibold">AI tool</th>
                <th className="py-2 font-semibold text-right">Per month</th>
                <th className="py-2 font-semibold text-right">Per year</th>
                <th className="py-2 font-semibold text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {p.topTools.map((t) => (
                <tr key={t.name} className="border-b border-[#EBEBEF]">
                  <td className="py-2 font-medium">{t.name}{t.vendor && t.vendor !== t.name ? <span className="text-[#5F5F69] font-normal"> · {t.vendor}</span> : null}</td>
                  <td className="py-2 text-right tabular">{t.estimated ? "≈ " : ""}{eur(t.monthlyEur)}</td>
                  <td className="py-2 text-right tabular">{eur(t.monthlyEur * 12)}</td>
                  <td className="py-2 text-right tabular text-[#5F5F69]">{s.monthlyRunRate > 0 ? `${Math.round((t.monthlyEur / s.monthlyRunRate) * 100)}%` : "—"}</td>
                </tr>
              ))}
              {p.topTools.length === 0 && (
                <tr><td colSpan={4} className="py-3 text-[#5F5F69]">No costs recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-10 avoid-break">
          <H2 n={5}>Risk and governance</H2>
          <div className="grid grid-cols-3 mt-3 border border-[#DCDCE1] rounded-lg overflow-hidden">
            <Kpi label="Shadow AI to review" value={String(p.shadow.toReview)} hint={`${p.shadow.newInQuarter} new in ${qLabel} · ${p.shadow.blockedInUse} not allowed but used`} />
            <Kpi label="AI Act readiness" value={`${p.aiAct.score}%`} hint={`${p.aiAct.classified} of ${p.aiAct.total} classified · ${p.aiAct.highRisk} high-risk`} border />
            <Kpi
              label="angar Edge coverage"
              value={p.edge.sensors ? `${p.edge.online}/${p.edge.sensors}` : "Off"}
              hint={p.edge.sensors ? `sensors online · ${p.edge.devices7d} devices, ${p.edge.queries7d.toLocaleString("en-GB")} AI requests in 7 days` : "No network sensor yet"}
              border
            />
          </div>
          <table className="w-full text-sm mt-4">
            <tbody>
              {p.aiAct.checks.map((c) => (
                <tr key={c.key} className="border-b border-[#EBEBEF]">
                  <td className="py-2 pr-3 w-5">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${c.fraction >= 1 ? "bg-[#1F9D55]" : c.fraction > 0 ? "bg-[#E0A100]" : "bg-[#D64545]"}`} />
                  </td>
                  <td className="py-2 font-medium">{c.label}</td>
                  <td className="py-2 text-[#5F5F69]">{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="mt-10 pt-4 border-t border-[#DCDCE1] flex justify-between gap-6 text-[11px] text-[#5F5F69] leading-relaxed">
          <span>Spend from imported bank and invoice charges and connected providers; &ldquo;≈&rdquo; marks costs estimated from list prices. Forecasts are statistical estimates.</span>
          <span className="shrink-0">angar · AI spend & governance</span>
        </footer>
      </article>
    </div>
  );
}

function TrendChart({ bars }: { bars: QuarterBar[] }) {
  const W = 700;
  const H = 190;
  const top = 18;
  const base = H - 28;
  const max = Math.max(1, ...bars.map((b) => b.eur));
  const slot = W / bars.length;
  const bw = Math.min(56, slot * 0.6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-4" role="img" aria-label="AI spend per quarter, with estimate">
      <line x1={0} x2={W} y1={base} y2={base} stroke="#DCDCE1" />
      {bars.map((b, i) => {
        const h = ((base - top) * b.eur) / max;
        const x = i * slot + (slot - bw) / 2;
        const est = b.kind === "estimate";
        return (
          <g key={b.key}>
            <rect
              x={x}
              y={base - h}
              width={bw}
              height={Math.max(0, h)}
              rx={3}
              fill={est ? "rgba(255,115,35,0.35)" : b.kind === "to-date" ? "rgba(20,20,24,0.55)" : "#141418"}
              stroke={est ? "#FF7323" : "none"}
              strokeDasharray={est ? "4 3" : undefined}
            />
            <text x={x + bw / 2} y={base - h - 5} textAnchor="middle" fontSize="11" fill="#141418">{b.eur > 0 ? eur(b.eur) : "—"}</text>
            <text x={x + bw / 2} y={base + 16} textAnchor="middle" fontSize="11" fill="#5F5F69">{b.label}{b.kind === "to-date" ? "*" : ""}</text>
          </g>
        );
      })}
      {bars.some((b) => b.kind === "to-date") && (
        <text x={W} y={H - 1} textAnchor="end" fontSize="10" fill="#5F5F69">* quarter to date</text>
      )}
    </svg>
  );
}

function Kpi({ label, value, hint, border, accent }: { label: string; value: string; hint?: string; border?: boolean; accent?: boolean }) {
  return (
    <div className={`px-4 py-4 ${border ? "border-l border-[#DCDCE1]" : ""}`}>
      <div className="text-[11px] uppercase tracking-wider text-[#5F5F69]">{label}</div>
      <div className={`text-[24px] font-semibold tracking-tight tabular mt-1 ${accent ? "text-[#FF7323]" : ""}`}>{value}</div>
      {hint && <div className="text-xs text-[#5F5F69]">{hint}</div>}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-[#EBEBEF]">
      <td className="py-2">{label}</td>
      <td className="py-2 text-right tabular font-medium">{value}</td>
    </tr>
  );
}

function H2({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-baseline gap-3 text-lg font-semibold">
      <span className="text-xs font-semibold text-[#FF7323] tabular">{String(n).padStart(2, "0")}</span>
      {children}
    </h2>
  );
}

// Stampa A4: solo il foglio, colori conservati, niente ombre né controlli.
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  html, body { background: #fff !important; color: #141418 !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print, aside { display: none !important; }
  .board-wrap { padding: 0 !important; }
  .board-paper { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; max-width: none !important; }
  .avoid-break, tr { break-inside: avoid; }
  a { text-decoration: none; }
}
`;

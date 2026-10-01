"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Logo";
import { loadSnapshot, type CheckSnapshot } from "./report-data";

const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");
const longDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * Report dell'AI Spend Check, impaginato come un documento di consulenza:
 * carta bianca anche a schermo, pronto per "Salva come PDF".
 */
export default function CheckReport() {
  const [snap, setSnap] = useState<CheckSnapshot | null | undefined>(undefined);
  useEffect(() => {
    setSnap(loadSnapshot());
  }, []);

  if (snap === undefined) return <div className="min-h-[60vh]" />;
  if (!snap)
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center flex flex-col items-center gap-4">
        <h1 className="text-2xl font-semibold text-ink-100">No report to show yet</h1>
        <p className="text-sm text-ink-400">Run the free AI Spend Check first — the report is built in your browser from the results and nothing is stored.</p>
        <a href="/check" className="btn btn-primary">Run the AI Spend Check</a>
      </div>
    );

  const date = new Date(snap.createdAt);
  const top = snap.savings.slice(0, 5);
  const lines = [...snap.lines].sort((a, b) => b.monthlyEur - a.monthlyEur);
  const share = snap.spend > 0 ? Math.round((snap.save / snap.spend) * 100) : 0;

  return (
    <div className="check-report-wrap min-h-screen py-10 px-4">
      <style>{PRINT_CSS}</style>
      <div className="no-print max-w-[820px] mx-auto mb-4 flex flex-wrap items-center justify-between gap-3">
        <a href="/check" className="text-sm text-ink-400 hover:text-ink-100">← Back to the check</a>
        <div className="flex items-center gap-2">
          <a href="/signup" className="btn btn-secondary btn-sm">Create free account</a>
          <button type="button" onClick={() => window.print()} className="btn btn-primary btn-sm">Save as PDF</button>
        </div>
      </div>

      <article className="report-paper max-w-[820px] mx-auto bg-white text-[#141418] rounded-xl shadow-card px-5 py-8 sm:px-14 sm:py-12">
        {/* Intestazione */}
        <header className="flex items-start justify-between gap-4 border-b-2 border-[#141418] pb-5">
          <div className="text-[#141418]"><Wordmark size={22} /></div>
          <div className="text-right text-xs text-[#5F5F69] leading-relaxed">
            <div className="font-semibold uppercase tracking-wider text-[#141418]">AI Spend Report</div>
            <div>{longDate(date)}</div>
            <div>Based on {snap.months} month{snap.months === 1 ? "" : "s"} of statements</div>
          </div>
        </header>

        <section className="pt-8">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#FF7323]">Executive summary</div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight mt-2">
            Your company pays for {snap.lines.length} AI service{snap.lines.length === 1 ? "" : "s"} — {eur(snap.spend * 12)} a year.
            {snap.save > 0 && <> About {eur(snap.save * 12)} of it could be saved.</>}
          </h1>
          <p className="text-sm text-[#5F5F69] mt-3 max-w-[620px]">
            We read the AI lines in your bank or card statement, matched each charge to a known AI provider and plan, and compared it with list prices.
            {snap.save > 0 ? ` The savings below (${share}% of your AI spend) need no new tools — only plan and billing changes.` : " We found no obvious overpayment in the statement alone."}
          </p>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-0 mt-8 border border-[#DCDCE1] rounded-lg overflow-hidden">
          <Kpi label="AI services found" value={String(snap.lines.length)} />
          <Kpi label="AI spend a year" value={eur(snap.spend * 12)} hint={`${eur(snap.spend)} a month`} border />
          <Kpi label="Possible savings a year" value={eur(snap.save * 12)} hint={`${eur(snap.save)} a month`} border accent />
        </section>

        <section className="mt-10">
          <H2 n={1}>The AI you pay for</H2>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] print:min-w-0 text-sm mt-3">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[#5F5F69] border-b border-[#141418]">
                <th className="py-2 font-semibold">AI service</th>
                <th className="py-2 font-semibold">Category</th>
                <th className="py-2 font-semibold">Plan</th>
                <th className="py-2 font-semibold text-right">Seats</th>
                <th className="py-2 font-semibold text-right">Monthly</th>
                <th className="py-2 font-semibold text-right">Yearly</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.service} className="border-b border-[#EBEBEF]">
                  <td className="py-2.5 font-medium">{l.name}{l.vendor && l.vendor !== l.name ? <span className="text-[#5F5F69] font-normal"> · {l.vendor}</span> : null}</td>
                  <td className="py-2.5 text-[#5F5F69]">{l.category}</td>
                  <td className="py-2.5 text-[#5F5F69]">{l.plan ?? "Usage-based"}</td>
                  <td className="py-2.5 text-right tabular text-[#5F5F69]">{l.seats ?? "—"}</td>
                  <td className="py-2.5 text-right tabular">{eur(l.monthlyEur)}</td>
                  <td className="py-2.5 text-right tabular">{eur(l.monthlyEur * 12)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-3" colSpan={4}>Total</td>
                <td className="py-3 text-right tabular">{eur(snap.spend)}</td>
                <td className="py-3 text-right tabular">{eur(snap.spend * 12)}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </section>

        <section className="mt-10 avoid-break">
          <H2 n={2}>Where you could save</H2>
          {top.length ? (
            <ol className="mt-3 flex flex-col gap-3">
              {top.map((s, i) => (
                <li key={s.title} className="flex items-start gap-4 border-l-4 border-[#FF7323] bg-[#FAFAFB] px-4 py-3 rounded-r-md">
                  <span className="text-sm font-semibold text-[#FF7323] tabular">{String(i + 1).padStart(2, "0")}</span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{s.title}</div>
                    <div className="text-sm text-[#5F5F69]">{s.detail}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular">{eur(s.monthlyEur)}/mo</div>
                    <div className="text-xs text-[#5F5F69] tabular">{eur(s.monthlyEur * 12)}/yr</div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-[#5F5F69] mt-3">No savings are visible from the statement alone. Unused seats and AI used without being paid for only show up once usage is measured — see below.</p>
          )}
        </section>

        <section className="mt-10 avoid-break">
          <H2 n={3}>What to do next</H2>
          <ol className="mt-3 flex flex-col gap-2 text-sm list-decimal pl-5 marker:text-[#5F5F69]">
            <li><b>Act on the top saving this month.</b> Billing and plan changes take minutes and pay back immediately.</li>
            <li><b>Check seats against real users.</b> Most companies pay for 20–30% more AI seats than people actually use.</li>
            <li><b>Find the AI you don&apos;t pay for.</b> Free and personal accounts carry data-protection and EU AI Act obligations that a statement can&apos;t show.</li>
            <li><b>Keep an owner for every AI.</b> Renewals, price changes and new models happen every month.</li>
          </ol>
          <div className="mt-6 rounded-lg bg-[#141418] text-white px-6 py-5 flex flex-col sm:flex-row print:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="flex-1">
              <div className="font-semibold">Keep this report up to date — automatically</div>
              <div className="text-sm text-white/70 mt-0.5">Create a free angar account: connect your bank or invoices, see real usage for each person and get alerts before renewals.</div>
            </div>
            <a href="/signup" className="shrink-0 rounded-lg bg-[#FF7323] px-4 py-2.5 text-sm font-semibold text-white">Create a free account →</a>
          </div>
        </section>

        <footer className="mt-10 pt-4 border-t border-[#DCDCE1] flex flex-col sm:flex-row print:flex-row justify-between gap-2 sm:gap-6 text-[11px] text-[#5F5F69] leading-relaxed">
          <span>Plans and seats are inferred from list prices and charge amounts; check before changing anything. The statement was read in memory and never stored.</span>
          <span className="shrink-0">angar · AI spend & usage for EU companies</span>
        </footer>
      </article>
    </div>
  );
}

function Kpi({ label, value, hint, border, accent }: { label: string; value: string; hint?: string; border?: boolean; accent?: boolean }) {
  return (
    <div className={`px-5 py-4 ${border ? "border-t sm:border-t-0 sm:border-l print:border-t-0 print:border-l border-[#DCDCE1]" : ""}`}>
      <div className="text-[11px] uppercase tracking-wider text-[#5F5F69]">{label}</div>
      <div className={`text-[28px] font-semibold tracking-tight tabular mt-1 ${accent ? "text-[#FF7323]" : ""}`}>{value}</div>
      {hint && <div className="text-xs text-[#5F5F69] tabular">{hint}</div>}
    </div>
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

// Stampa: solo il foglio, bianco su nero, colori conservati, niente ombre.
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  html, body { background: #fff !important; color: #141418 !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print, aside, header.app-header { display: none !important; }
  /* Da loggati la pagina sta nel layout dell'app: si stampa solo il foglio. */
  main > *:not(.check-report-wrap), #app-scroll > *:not(main) { display: none !important; }
  .report-paper { break-inside: auto !important; }
  .check-report-wrap { padding: 0 !important; min-height: 0 !important; background: #fff !important; }
  .report-paper { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; max-width: none !important; }
  .avoid-break, tr { break-inside: avoid; }
  a { text-decoration: none; }
}
`;

import PublicHeader from "@/components/PublicHeader";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PricingCards, { BillingToggle } from "@/components/PricingCards";
import { currentSession } from "@/lib/auth";
import { EDGE, partnerPrice } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Pricing — angar",
  description: "Discover, Save and Govern: see what you spend on AI and where to save. Free to start, savings verified on your next bills, with a savings guarantee.",
};

const FAQ = [
  ["How does angar find our AI?", "From your bank statements and e-invoices (costs), Microsoft 365 or Google Workspace (who uses what), the angar desktop app (who uses which AI and for how long, even AI nobody pays for)."],
  ["Do we need to install anything?", "No, to start. Drop a bank statement and you see results in seconds. The desktop app (one-minute install, no admin rights) is optional, for real usage for each person."],
  ["What does 'employees' mean?", "The size of the company using angar. You can change plan at any time; limits never lock your data."],
  ["Where is our data?", "In the EU (Railway, europe-west4). Only AI charges are kept from statements; keys are encrypted; access is read-only."],
];

// Pagina prezzi pubblica.
export default function PricingPage({ searchParams }: { searchParams: { billing?: string } }) {
  const annual = searchParams.billing === "annual";
  // Da dentro l'app i pulsanti pubblici ("Start free" → /signup) finirebbero in un vicolo cieco:
  // stessa scelta dei piani, con i pulsanti giusti, su /billing.
  if (currentSession()) redirect(annual ? "/billing?billing=annual" : "/billing");
  return (
    <div className="min-h-screen bg-panel">
      <PublicHeader active="pricing" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-14 flex flex-col gap-10">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="font-display text-[30px] sm:text-[38px] leading-tight font-semibold tracking-tight text-ink-100">Pay less for AI. angar pays for itself.</h1>
          <p className="text-base text-ink-400 mt-3">Every AI your company uses, what it really costs, who uses it and where to save — automatically. Start free, upgrade when you want the full picture.</p>
        </div>
        <div className="flex justify-center -mt-4">
          <BillingToggle basePath="/pricing" annual={annual} />
        </div>
        <PricingCards mode="public" annual={annual} salesEmail={process.env.SALES_EMAIL} />
        <section id="edge" className="rounded-xl border border-line bg-panel p-6 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 lg:gap-8 scroll-mt-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-ink-100">{EDGE.name}</h2>
              <span className="text-[11px] font-medium text-ink-400 border border-line rounded-full px-2 py-0.5">Optional</span>
            </div>
            <p className="text-sm text-ink-400 mt-1 max-w-2xl">{EDGE.tagline}</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-ink-100 mt-4">
              {EDGE.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5 text-accent" aria-hidden>
                    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3 lg:border-l border-line lg:pl-8">
            <div>
              <div className="text-xs text-ink-400">Software & cloud logs</div>
              <div className="text-sm font-semibold text-ink-100">Included in Save and above</div>
            </div>
            <div className="font-display text-ink-100">
              <div className="text-xs text-ink-400 font-body">angar device</div>
              <span className="text-[26px] font-semibold tracking-tight tabular">€{EDGE.pricePerDevice}</span>
              <span className="text-sm text-ink-400"> a month for each device</span>
              <div className="text-xs text-ink-400 mt-1 font-body">Any plan · {EDGE.minMonths}-month minimum · hardware, shipping and replacement included</div>
            </div>
            <div className="text-xs text-ink-400">Partners: €{partnerPrice(EDGE.pricePerDevice).toFixed(2)} for each device ({EDGE.partnerDiscountPct}% off).</div>
            <a href="/signup" className="btn btn-secondary mt-auto">Start free</a>
          </div>
        </section>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FAQ.map(([q, a]) => (
            <div key={q} className="rounded-xl border border-line bg-panel p-5">
              <h3 className="text-sm font-bold text-ink-100">{q}</h3>
              <p className="text-sm text-ink-400 mt-1">{a}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

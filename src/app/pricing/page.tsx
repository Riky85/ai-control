import type { Metadata } from "next";
import PricingCards from "@/components/PricingCards";
import { currentSession } from "@/lib/auth";
import { EDGE } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Pricing — angar",
  description: "Find every AI your company pays for and where to save. Free for freelancers, from €79/month for companies, with a savings guarantee.",
};

const FAQ = [
  ["How does angar find our AI?", "From your bank statements and e-invoices (costs), Microsoft 365 or Google Workspace (who uses what), a browser extension and network scans (AI nobody pays for)."],
  ["Do we need to install anything?", "No, to start. Drop a bank statement and you see results in seconds. The extension and angar Edge are optional, for real usage per person."],
  ["What does 'employees' mean?", "The size of the company using angar. You can change plan at any time; limits never lock your data."],
  ["Where is our data?", "In the EU (Railway, europe-west4). Only AI charges are kept from statements; keys are encrypted; access is read-only."],
];

// Pagina prezzi pubblica.
export default function PricingPage() {
  const signedIn = Boolean(currentSession());
  return (
    <div className={signedIn ? "" : "min-h-screen bg-panel"}>
      {!signedIn && (
        <header className="max-w-6xl mx-auto px-6 pt-8 flex items-center justify-between">
          <a href="/check" className="font-brand text-[20px] tracking-tight text-ink-100">angar</a>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/check" className="text-ink-400 hover:text-ink-100">Free AI Spend Check</a>
            <a href="/login" className="text-ink-400 hover:text-ink-100">Sign in</a>
            <a href="/signup" className="btn btn-primary btn-sm">Start free</a>
          </nav>
        </header>
      )}
      <main className={`${signedIn ? "" : "max-w-6xl mx-auto px-6 py-14"} flex flex-col gap-10`}>
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="font-display text-[38px] leading-tight font-semibold tracking-tight text-ink-100">Pay less for AI. angar pays for itself.</h1>
          <p className="text-base text-ink-400 mt-3">Every AI your company uses, what it really costs, who uses it and where to save — automatically. Start free, upgrade when you want the full picture.</p>
        </div>
        <PricingCards mode="public" salesEmail={process.env.SALES_EMAIL} />
        <div className="rounded-xl border border-line bg-panel p-6 grid grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-ink-100">{EDGE.name}</h2>
              <span className="text-[11px] font-medium text-ink-400 border border-line rounded-full px-2 py-0.5">Optional</span>
            </div>
            <p className="text-sm text-ink-400 mt-1 max-w-2xl">
              Always-on discovery for a whole office or plant network. Runs as software on any always-on computer (Docker), or as a small pre-configured device on loan for sites without IT. Included in Growth and above as software; device €{EDGE.pricePerDevice}/month per site.
            </p>
          </div>
          <a href={signedIn ? "/discover" : "/signup"} className="btn btn-secondary">Learn more</a>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {FAQ.map(([q, a]) => (
            <div key={q} className="rounded-xl border border-line bg-panel p-5">
              <h3 className="text-sm font-semibold text-ink-100">{q}</h3>
              <p className="text-sm text-ink-400 mt-1">{a}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

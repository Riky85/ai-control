import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { currentSession } from "@/lib/auth";
import { networkStats } from "@/lib/engine/price-index";
import ScoreRing from "@/components/engine/ScoreRing";
import { AxisBar } from "@/components/engine/ScoreCard";
import ForecastCard, { type ForecastCardProps } from "@/components/engine/ForecastCard";
import PriceIndexCard, { type PriceRow } from "@/components/engine/PriceIndexCard";
import { fmtEur } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "angar Engine — the intelligence layer for company AI",
  description: "angar Score, AI Price Index, spend forecasts and a savings Autopilot proven on real bills. Built in the EU, anonymous by design.",
};

// Esempi illustrativi (mai dati di clienti): servono a mostrare le card vere dell'Engine.
const DEMO_FORECAST: ForecastCardProps = (() => {
  const now = new Date();
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const add = (m: number) => new Date(now.getFullYear(), now.getMonth() + m, 1);
  const base = [3120, 3190, 3240, 3410, 3380, 3560, 3690, 3720, 3890, 4010, 4120, 4260];
  const history = base.map((eur, i) => ({ month: key(add(i - 12)), eur }));
  const projection = Array.from({ length: 12 }, (_, k) => {
    const eur = Math.round(4330 * Math.pow(1.021, k) + (k === 5 ? 2400 : 0));
    const spread = 0.06 * Math.sqrt(k + 1);
    return { month: key(add(k)), eur, low: Math.round(eur * (1 - spread)), high: Math.round(eur * (1 + spread)) };
  });
  return {
    history,
    projection,
    next12Eur: projection.reduce((s, p) => s + p.eur, 0),
    growthPct: 27,
    runRateEur: 4330,
    drivers: ["Spend grows about 2% a month", "ChatGPT Business renews in March: €2,400", "3 new AI tools in the last 90 days"],
  };
})();

const DEMO_PRICES: PriceRow[] = [
  { serviceId: "chatgpt", name: "ChatGPT", vendor: "OpenAI", assetIds: [], planName: "Business", seats: 40, yourSeatEur: 31.5, peers: { median: 26, p25: 24, p75: 28.5, count: 38 }, listSeatEur: 27.6, source: "peers", yourUtilisation: 0.46, peerUtilisation: { median: 0.61, p25: 0.5, p75: 0.74, count: 38 }, verdict: "above", deltaPct: 21 },
  { serviceId: "claude", name: "Claude", vendor: "Anthropic", assetIds: [], planName: "Team", seats: 15, yourSeatEur: 27.6, peers: { median: 27.6, p25: 25.8, p75: 29.4, count: 22 }, listSeatEur: 27.6, source: "peers", yourUtilisation: 0.8, peerUtilisation: { median: 0.72, p25: 0.6, p75: 0.85, count: 22 }, verdict: "fair", deltaPct: 0 },
  { serviceId: "copilot", name: "GitHub Copilot", vendor: "GitHub", assetIds: [], planName: "Business", seats: 25, yourSeatEur: 16.1, peers: { median: 17.5, p25: 17, p75: 18.4, count: 31 }, listSeatEur: 17.5, source: "peers", yourUtilisation: 0.88, peerUtilisation: { median: 0.79, p25: 0.66, p75: 0.9, count: 31 }, verdict: "below", deltaPct: -8 },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;

// Pagina pubblica dell'angar Engine per investitori, aziende e partner.
// Numeri della rete solo aggregati e anonimi (null sotto le 5 aziende: non si mostrano).
export default async function EnginePage() {
  const signedIn = Boolean(currentSession());
  const net = await networkStats().catch(() => null);

  const facts: { value: string; label: string }[] = [
    ...(net?.companies ? [{ value: String(net.companies), label: "companies in the index" }] : []),
    ...(net?.monthlySpendEur ? [{ value: fmtEur(net.monthlySpendEur), label: "AI spend analysed each month" }] : []),
    ...(net?.medianSeatUtilisation != null ? [{ value: pct(net.medianSeatUtilisation), label: "of paid AI seats really used (median)" }] : []),
    ...(net?.medianWasteShare != null ? [{ value: pct(net.medianWasteShare), label: "of AI spend wasted (median)" }] : []),
    ...(net ? [{ value: String(net.catalog.aiServices), label: "AI services recognised" }, { value: String(net.catalog.pricedPlans), label: "priced plans tracked" }, { value: String(net.catalog.apiModels), label: "API models priced" }] : []),
  ].slice(0, 4);

  return (
    <div className={signedIn ? "" : "min-h-screen bg-panel"}>
      {!signedIn && (
        <header className="max-w-6xl mx-auto px-6 pt-8 flex items-center justify-between">
          <a href="/check" className="text-ink-100" aria-label="angar">
            <Wordmark size={20} />
          </a>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/pricing" className="text-ink-400 hover:text-ink-100 hidden sm:inline">Pricing</a>
            <a href="/login" className="text-ink-400 hover:text-ink-100">Sign in</a>
            <a href="/signup" className="btn btn-primary btn-sm">Start free</a>
          </nav>
        </header>
      )}

      <main className={`${signedIn ? "" : "max-w-6xl mx-auto px-6 py-14"} flex flex-col gap-14`}>
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-line bg-panel px-6 py-12 md:px-12 md:py-16 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -left-32 bottom-0 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative flex flex-col gap-5">
            <span className="self-start text-[11px] font-medium text-accent border border-accent/40 rounded-full px-2.5 py-0.5">angar Engine</span>
            <h1 className="font-display text-[40px] md:text-[48px] leading-[1.05] font-semibold tracking-tight text-ink-100">The intelligence layer for company AI.</h1>
            <p className="text-base text-ink-400 max-w-lg">
              One engine turns bank charges, company accounts, computers and network traffic into a rating, a market price, a forecast — and savings it carries out and proves on the next bill.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={signedIn ? "/score" : "/signup"} className="btn btn-primary">{signedIn ? "See your angar Score" : "Get your angar Score"}</Link>
              <a href={`mailto:${process.env.SALES_EMAIL ?? ""}?subject=${encodeURIComponent("angar Engine — partnership")}`} className="btn btn-secondary">Partner with us</a>
            </div>
          </div>
          <div className="relative flex flex-col items-center gap-4">
            <ScoreRing score={72} grade="B" size={220} />
            <div className="w-full max-w-xs flex flex-col gap-2">
              <AxisBar label="Efficiency" value={58} />
              <AxisBar label="Governance" value={81} />
              <AxisBar label="Risk" value={77} />
              <AxisBar label="Adoption" value={74} />
            </div>
            <span className="text-[11px] text-ink-400">Example company</span>
          </div>
        </section>

        {/* Numeri della rete: solo aggregati anonimi */}
        {facts.length > 0 && (
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {facts.map((f) => (
              <div key={f.label} className="rounded-xl border border-line bg-panel px-5 py-4">
                <div className="font-display text-[28px] font-semibold tabular text-ink-100 leading-tight">{f.value}</div>
                <div className="text-xs text-ink-400 mt-1">{f.label}</div>
              </div>
            ))}
          </section>
        )}

        {/* I quattro motori */}
        <section className="flex flex-col gap-6">
          <Heading kicker="Four engines, one model of your AI estate" title="From raw charges to decisions — automatically." />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Engine n="01" title="angar Score" text="A 0–100 rating of how well a company runs AI: efficiency, governance, risk and adoption. Every point is explained and linked to the fix — board-ready in five seconds." />
            <Engine n="02" title="AI Price Index" text="What companies really pay for each AI seat and how many seats they use, from real bills across the network. Anonymous: shown only when 5+ companies contribute." />
            <Engine n="03" title="Forecast & anomalies" text="Next 12 months of AI spend with a confidence band, plus alerts for price rises, seat creep, spend spikes and shadow AI that suddenly grows." />
            <Engine n="04" title="Savings Autopilot" text="Each saving becomes a plan. angar asks inactive people, removes unused seats through the provider's API, reminds before renewals — then checks the next bills to prove it." />
          </div>
        </section>

        {/* Esempi dal prodotto */}
        <section className="flex flex-col gap-6">
          <Heading kicker="Inside the product" title="What a finance or IT lead sees." />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ForecastCard {...DEMO_FORECAST} />
            <PriceIndexCard rows={DEMO_PRICES} networkCompanies={38} minCompanies={5} />
          </div>
          <p className="text-xs text-ink-400">Illustrative example — not customer data.</p>
        </section>

        {/* Perché è difendibile */}
        <section className="rounded-2xl border border-line bg-panel p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Why title="It compounds" text="Every company that joins sharpens the Price Index and the benchmarks for everyone else. The data set can't be bought or scraped." />
          <Why title="Proof, not promises" text="Savings are confirmed on the following bank charges, not estimated. That's what makes a guarantee possible." />
          <Why title="EU and private by design" text="Hosted in the EU, anonymous aggregates only, never prompts or messages — and a fully on-premises edition for regulated companies." />
        </section>

        {/* Per chi */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Audience title="Companies" text="Know what AI you run, what it costs and where to save — in minutes." href={signedIn ? "/" : "/signup"} cta="Start free" />
          <Audience title="Partners & MSPs" text="One console for all your clients, their scores and savings — with partner pricing." href="/partner" cta="Partner console" />
          <Audience title="Investors" text="A proprietary, compounding data asset on the fastest-growing line of company spend." href={`mailto:${process.env.SALES_EMAIL ?? ""}?subject=${encodeURIComponent("angar — investor enquiry")}`} cta="Get in touch" />
        </section>
      </main>
    </div>
  );
}

function Heading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-accent">{kicker}</div>
      <h2 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink-100 mt-1">{title}</h2>
    </div>
  );
}

function Engine({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-panel p-6 flex flex-col gap-2">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />
      <span className="font-display text-sm font-semibold text-accent tabular">{n}</span>
      <h3 className="text-lg font-semibold text-ink-100">{title}</h3>
      <p className="text-sm text-ink-400 leading-relaxed">{text}</p>
    </div>
  );
}

function Why({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-ink-100">{title}</h3>
      <p className="text-sm text-ink-400 mt-1 leading-relaxed">{text}</p>
    </div>
  );
}

function Audience({ title, text, href, cta }: { title: string; text: string; href: string; cta: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-3">
      <h3 className="text-base font-semibold text-ink-100">{title}</h3>
      <p className="text-sm text-ink-400 flex-1">{text}</p>
      <a href={href} className="btn btn-secondary btn-sm self-start">{cta} →</a>
    </div>
  );
}

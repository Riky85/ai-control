import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import PublicHeader from "@/components/PublicHeader";
import { currentSession } from "@/lib/auth";
import { networkStats } from "@/lib/engine/price-index";
import ScoreMock from "@/components/engine/marketing/ScoreMock";
import ForecastCard, { type ForecastCardProps } from "@/components/engine/ForecastCard";
import PriceIndexCard, { PriceRangeBar, VerdictPill, type PriceRow } from "@/components/engine/PriceIndexCard";
import ProductShot from "@/components/engine/marketing/ProductShot";
import FlowDiagram from "@/components/engine/marketing/FlowDiagram";
import MiniForecast from "@/components/engine/marketing/MiniForecast";
import StepTrackerMock from "@/components/engine/marketing/StepTrackerMock";
import { IconEu, IconLayers, IconReceipt } from "@/components/engine/marketing/icons";
import { fmtEur } from "@/lib/format";
import { AI_SERVICES } from "@/lib/discovery/catalog";
import { API_MODELS, PLANS, PRICES_AS_OF } from "@/lib/pricing/catalog";

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
const mailto = (subject: string) => `mailto:${process.env.SALES_EMAIL ?? ""}?subject=${encodeURIComponent(subject)}`;

// Pagina pubblica dell'angar Engine per investitori, aziende e partner.
// Numeri della rete solo aggregati e anonimi (null sotto le 5 aziende: non si mostrano).
export default async function EnginePage() {
  const signedIn = Boolean(currentSession());
  const net = await networkStats().catch(() => null);
  // Fatti del catalogo: dal codice, anche se la rete non risponde.
  const catalog = net?.catalog ?? { aiServices: AI_SERVICES.length, pricedPlans: PLANS.length, pricedServices: new Set(PLANS.map((p) => p.service)).size, apiModels: API_MODELS.length, pricesAsOf: PRICES_AS_OF };

  const facts: { value: string; label: string }[] = [
    ...(net?.companies ? [{ value: String(net.companies), label: "companies in the index" }] : []),
    ...(net?.monthlySpendEur ? [{ value: fmtEur(net.monthlySpendEur), label: "AI spend analysed each month" }] : []),
    ...(net?.medianSeatUtilisation != null ? [{ value: pct(net.medianSeatUtilisation), label: "of paid AI seats really used (median)" }] : []),
    ...(net?.medianWasteShare != null ? [{ value: pct(net.medianWasteShare), label: "of AI spend wasted (median)" }] : []),
    { value: String(catalog.aiServices), label: "AI services recognised" },
    { value: String(catalog.pricedPlans), label: "priced plans tracked" },
    { value: String(catalog.apiModels), label: "API models priced" },
    { value: String(catalog.pricedServices), label: "AI services with tracked list prices" },
  ].slice(0, 4);

  return (
    <div className={signedIn ? "" : "min-h-screen bg-panel overflow-x-clip"}>
      {!signedIn && (
        <PublicHeader active="engine" />
      )}

      <main className={`${signedIn ? "" : "max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-20"} flex flex-col gap-20 sm:gap-24`}>
        {/* Hero */}
        <section className="relative grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-10 items-center">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-6 -top-10 -bottom-6 opacity-70"
            style={{
              backgroundImage: "linear-gradient(to right, rgb(var(--c-line) / 0.6) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--c-line) / 0.6) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage: "radial-gradient(ellipse 60% 70% at 72% 45%, black, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse 60% 70% at 72% 45%, black, transparent 75%)",
            }}
          />
          <div className="relative flex flex-col gap-6">
            <span className="self-start inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-ink-400">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              angar Engine
            </span>
            <h1 className="font-display text-[38px] sm:text-[48px] lg:text-[52px] leading-[1.02] font-semibold tracking-[-0.025em] text-ink-100">
              The intelligence layer for company AI.
            </h1>
            <p className="text-base sm:text-lg text-ink-400 max-w-[34rem] leading-relaxed">
              A score, a market price, a forecast and savings proven on the next bill — from the AI data your company already has.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={signedIn ? "/score" : "/signup"} className="btn btn-primary h-10 px-4">
                {signedIn ? "See your angar Score" : "Get your angar Score"}
              </Link>
              <a href={mailto("angar Engine — partnership")} className="btn btn-secondary h-10 px-4">
                Talk to us
              </a>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-400">
              {["Hosted in the EU", "Anonymous by design", "On-premises edition"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-steady" aria-hidden>
                    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <ProductShot />
            <p className="mt-3 text-center text-[11px] text-ink-400">Example company</p>
          </div>
        </section>

        {/* Numeri della rete: solo aggregati anonimi e fatti del catalogo */}
        {facts.length > 0 && (
          <section aria-label="angar network" className="-mt-6 sm:-mt-8">
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-2xl border border-line bg-line">
              {facts.map((f) => (
                <div key={f.label} className="bg-panel px-5 py-5">
                  <dd className="font-display text-[28px] sm:text-[32px] font-semibold tracking-tight tabular text-ink-100 leading-none">{f.value}</dd>
                  <dt className="text-xs text-ink-400 mt-2">{f.label}</dt>
                </div>
              ))}
            </dl>
            <p className="text-[11px] text-ink-400 mt-2.5">
              Network figures are anonymous aggregates, shown once {net?.minCompanies ?? 5}+ companies contribute · list prices as of {catalog.pricesAsOf}.
            </p>
          </section>
        )}

        {/* Come funziona */}
        <section id="how" className="flex flex-col gap-8 scroll-mt-8">
          <Heading kicker="How it works" title="Every signal in, four answers out." text="angar reads what your company already has — no agents to configure, nothing to tag — and keeps one model of every AI you run." />
          <FlowDiagram aiServices={catalog.aiServices} pricedPlans={catalog.pricedPlans} />
        </section>

        {/* I quattro motori, ciascuno con una vista vera */}
        <section className="flex flex-col gap-8">
          <Heading kicker="Four engines" title="From raw charges to decisions." />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <EngineCard id="engine-score" n="01" name="angar Score" title="One number for AI spend efficiency." text="0–100 across five dimensions: spend visibility, license utilization, tool efficiency, consumption efficiency and savings opportunity. Ratios only — spending less never scores higher. Every point is explained, and each fix shows the points it gains.">
              <ScoreMock compact />
            </EngineCard>

            <EngineCard id="engine-price" n="02" name="AI Price Index" title="What everyone else really pays." text="Seat prices and seat use from real bills across the network — anonymous, and shown only when 5+ companies contribute.">
              <ul className="flex flex-col divide-y divide-line">
                {[DEMO_PRICES[0], DEMO_PRICES[2]].map((r) => (
                  <li key={r.serviceId} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-ink-100 truncate">
                        {r.name} <span className="font-normal text-ink-400">{r.planName}</span>
                      </span>
                      <VerdictPill verdict={r.verdict} source={r.source} deltaPct={r.deltaPct} />
                    </div>
                    <div className="text-xs text-ink-400 mt-1 tabular">
                      One seat: you <b className="font-medium text-ink-100">{fmtEur(r.yourSeatEur ?? 0, { decimals: true })}</b> · market median <b className="font-medium text-ink-100">{fmtEur(r.peers?.median ?? 0, { decimals: true })}</b> ({r.peers?.count} companies)
                    </div>
                    <PriceRangeBar row={r} className="mt-2.5" />
                  </li>
                ))}
              </ul>
            </EngineCard>

            <EngineCard id="engine-forecast" n="03" name="Forecast & anomalies" title="Next year's AI bill, before it lands." text="12 months of spend with a likely range, plus alerts for price rises, seat creep, spend spikes and shadow AI.">
              <div className="flex flex-col gap-3">
                <MiniForecast history={DEMO_FORECAST.history} projection={DEMO_FORECAST.projection} next12Eur={DEMO_FORECAST.next12Eur} growthPct={DEMO_FORECAST.growthPct} />
                <div className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-signal" aria-hidden />
                  <span className="flex-1 min-w-0 text-xs text-ink-100">Claude Team price up 9% this month</span>
                  <span className="text-[11px] text-ink-400 border border-line rounded-full px-2 py-0.5 shrink-0">Price</span>
                </div>
              </div>
            </EngineCard>

            <EngineCard id="engine-autopilot" n="04" name="Savings Autopilot" title="Savings it carries out — and proves." text="Each saving becomes a plan: angar asks inactive people, removes seats through the provider's API, then checks the next bills.">
              <StepTrackerMock />
            </EngineCard>
          </div>
        </section>

        {/* Esempi dal prodotto */}
        <section className="flex flex-col gap-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Heading kicker="Inside the product" title="What a finance or IT lead sees." />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100/[0.05] px-2.5 py-1 text-[11px] text-ink-400">
              <span className="h-1.5 w-1.5 rounded-full bg-ink-400" aria-hidden />
              Illustrative example — not customer data
            </span>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            <ForecastCard {...DEMO_FORECAST} />
            {/* Esempio: i link alle singole AI non portano da nessuna parte */}
            <div className="[&_a]:pointer-events-none">
              <PriceIndexCard rows={DEMO_PRICES} networkCompanies={38} minCompanies={5} />
            </div>
          </div>
        </section>

        {/* Perché è difendibile */}
        <section className="flex flex-col gap-8">
          <Heading kicker="Why it's defensible" title="A moat that grows with every company." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
            <Why icon={<IconLayers />} title="Data that compounds" text="Every company that joins sharpens the Price Index and benchmarks for all the others. It can't be bought or scraped." />
            <Why icon={<IconReceipt />} title="Proof on the bills" text="Savings are confirmed on the following bank charges, not estimated. That is what makes a guarantee possible." />
            <Why icon={<IconEu />} title="EU and private by design" text="Hosted in the EU, anonymous aggregates only, never prompts or messages — and a full on-premises edition." />
          </div>
        </section>

        {/* Per chi */}
        <section className="flex flex-col gap-8">
          <Heading kicker="Who it's for" title="Built for the people who pay for AI." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Audience title="Companies" text="Know what AI you run, what it costs and where to save — in minutes, from one bank statement." href={signedIn ? "/" : "/signup"} cta="Start free" primary />
            <Audience title="Partners & MSPs" text="One console for every client: scores, savings and renewals — with partner pricing." href="/partner" cta="Partner console" />
            <Audience title="Investors" text="A proprietary, compounding data asset on the fastest-growing line of company spend." href={mailto("angar — investor enquiry")} cta="Get in touch" />
          </div>
        </section>

        {/* Chiusura */}
        <section className="relative overflow-hidden rounded-2xl border border-line px-6 py-12 sm:py-14 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              backgroundImage: "linear-gradient(to right, rgb(var(--c-line) / 0.6) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--c-line) / 0.6) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage: "radial-gradient(ellipse 55% 80% at 50% 50%, black, transparent 80%)",
              WebkitMaskImage: "radial-gradient(ellipse 55% 80% at 50% 50%, black, transparent 80%)",
            }}
          />
          <div className="relative flex flex-col items-center gap-5">
            <h2 className="font-display text-[28px] sm:text-[34px] leading-tight font-semibold tracking-tight text-ink-100 max-w-2xl">See your angar Score in minutes.</h2>
            <p className="text-sm sm:text-base text-ink-400 max-w-md">Drop one bank statement — nothing to install.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href={signedIn ? "/score" : "/signup"} className="btn btn-primary h-10 px-4">
                {signedIn ? "See your angar Score" : "Get your angar Score"}
              </Link>
              <a href={mailto("angar Engine — partnership")} className="btn btn-secondary h-10 px-4">
                Partner with us
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Heading({ kicker, title, text }: { kicker: string; title: string; text?: string }) {
  return (
    <div className="max-w-2xl">
      <div className="text-xs font-medium text-accent">{kicker}</div>
      <h2 className="font-display text-[28px] sm:text-[32px] leading-tight font-semibold tracking-tight text-ink-100 mt-1.5">{title}</h2>
      {text && <p className="text-sm sm:text-base text-ink-400 mt-2 leading-relaxed">{text}</p>}
    </div>
  );
}

function EngineCard({ id, n, name, title, text, children }: { id: string; n: string; name: string; title: string; text: string; children: ReactNode }) {
  return (
    <article id={id} className="scroll-mt-8 rounded-2xl border border-line bg-panel p-5 sm:p-6 flex flex-col gap-5 min-w-0">
      <div>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-display font-semibold tabular text-accent">{n}</span>
          <span className="text-ink-400">{name}</span>
        </div>
        <h3 className="text-lg font-bold text-ink-100 mt-2 leading-snug">{title}</h3>
        <p className="text-sm text-ink-400 mt-1 leading-relaxed">{text}</p>
      </div>
      <div className="flex-1 flex flex-col justify-center rounded-xl border border-line bg-ink-100/[0.02] p-3.5 sm:p-4 min-w-0">{children}</div>
    </article>
  );
}

function Why({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="bg-panel p-6">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">{icon}</span>
      <h3 className="text-base font-bold text-ink-100 mt-4">{title}</h3>
      <p className="text-sm text-ink-400 mt-1 leading-relaxed">{text}</p>
    </div>
  );
}

function Audience({ title, text, href, cta, primary }: { title: string; text: string; href: string; cta: string; primary?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-6 flex flex-col gap-3">
      <h3 className="text-base font-bold text-ink-100">{title}</h3>
      <p className="text-sm text-ink-400 flex-1 leading-relaxed">{text}</p>
      <a href={href} className={`${primary ? "text-accent" : "text-ink-100"} text-sm font-medium self-start hover:underline underline-offset-4`}>
        {cta} →
      </a>
    </div>
  );
}

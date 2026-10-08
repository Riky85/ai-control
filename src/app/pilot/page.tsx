import type { Metadata } from "next";
import PublicHeader from "@/components/PublicHeader";
import LeadForm from "@/components/LeadForm";
import { LangSwitch, Eyebrow, HeroGrid, SectionTitle, FeatureCard, Steps, TrustStrip } from "@/components/PublicBits";
import { currentSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { COMMON, PILOT, countryOptions, pickLang } from "@/lib/i18n-partners";

type Props = { searchParams: { lang?: string } };

export function generateMetadata({ searchParams }: Props): Metadata {
  const t = PILOT[pickLang(searchParams.lang)];
  // Pagina marketing con dati di esempio: fuori dall'indice (potrà passare al sito).
  return { title: `${t.metaTitle} — angar`, description: t.metaDesc, robots: { index: false } };
}

// Programma pilota per aziende: prime 10, 60 giorni gratis sul piano Save,
// chiamata di avvio di 30 minuti; in cambio feedback e un breve caso studio.
export default function PilotPage({ searchParams }: Props) {
  // Solo pubblica: dentro l'app (dati di esempio) non si mostra, si torna all'Overview.
  if (currentSession()) redirect("/");
  const lang = pickLang(searchParams.lang);
  const c = COMMON[lang];
  const t = PILOT[lang];
  const signedIn = Boolean(currentSession());
  const partnersHref = lang === "en" ? "/partners" : `/partners?lang=${lang}`;

  return (
    <div lang={lang} className={signedIn ? "" : "min-h-screen bg-panel overflow-x-clip"}>
      {!signedIn && <PublicHeader labels={c.nav} />}

      <main className={`${signedIn ? "" : "max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-20"} flex flex-col gap-16 sm:gap-20`}>
        {/* Hero */}
        <section className="relative grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-10 lg:gap-12 items-center">
          <HeroGrid />
          <div className="relative flex flex-col gap-6 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Eyebrow>{t.eyebrow}</Eyebrow>
              <LangSwitch path="/pilot" lang={lang} label={c.langLabel} />
            </div>
            <h1 className="font-display text-[32px] sm:text-[44px] leading-[1.05] font-semibold tracking-[-0.02em] text-ink-100 text-balance">{t.h1}</h1>
            <p className="text-base sm:text-lg text-ink-400 leading-relaxed max-w-[36rem]">{t.sub}</p>
            <div className="flex flex-wrap gap-3">
              <a href="#apply" className="btn btn-primary h-10 px-4">{t.cta}</a>
              <a href="/check" className="btn btn-secondary h-10 px-4">{t.ctaSecondary}</a>
            </div>
          </div>

          {/* I tre numeri del programma */}
          <div className="relative rounded-2xl border border-line bg-panel shadow-card divide-y divide-line min-w-0">
            {t.facts.map((f) => (
              <div key={f.l} className="flex items-baseline gap-4 px-6 py-5">
                <span className="font-display text-[26px] sm:text-[38px] leading-none font-semibold tracking-tight tabular text-ink-100 whitespace-nowrap min-w-[5.5rem] sm:min-w-[7.5rem] shrink-0">{f.v}</span>
                <span className="text-sm text-ink-400 min-w-0">{f.l}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionTitle>{t.getTitle}</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {t.get.map((it) => (
              <FeatureCard key={it.t} t={it.t} d={it.d} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionTitle>{t.askTitle}</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {t.ask.map((it) => (
              <FeatureCard key={it.t} t={it.t} d={it.d} />
            ))}
          </div>
        </section>

        <Steps title={c.howTitle} steps={t.how} />

        <TrustStrip copy={c.trust} />

        <section className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-8 lg:gap-12 items-start">
          <div className="flex flex-col gap-4 lg:sticky lg:top-8">
            <SectionTitle id="apply">{t.formTitle}</SectionTitle>
            <p className="text-sm text-ink-400">{t.formSub}</p>
            <p className="text-sm text-ink-400 pt-2">
              {t.partnerNote}{" "}
              <a href={partnersHref} className="text-ink-100 underline underline-offset-2 hover:no-underline">{t.partnerLink}</a>
            </p>
          </div>
          <div className="rounded-xl border border-line bg-panel p-5 sm:p-6 shadow-card min-w-0">
            <LeadForm kind="pilot" lang={lang} copy={c.form} countries={countryOptions(lang)} submit={t.submit} messagePh={t.messagePh} />
          </div>
        </section>
      </main>
    </div>
  );
}

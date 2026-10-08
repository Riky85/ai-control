import type { Metadata } from "next";
import PublicHeader from "@/components/PublicHeader";
import LeadForm from "@/components/LeadForm";
import { LangSwitch, Eyebrow, HeroGrid, SectionTitle, FeatureCard, Steps, TrustStrip, Tick } from "@/components/PublicBits";
import { currentSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PARTNER } from "@/lib/plans";
import { COMMON, PARTNERS, E_INVOICE_FORMATS, countryOptions, fill, pickLang } from "@/lib/i18n-partners";

type Props = { searchParams: { lang?: string } };

export function generateMetadata({ searchParams }: Props): Metadata {
  const t = PARTNERS[pickLang(searchParams.lang)];
  // Pagina marketing con dati di esempio: fuori dall'indice (potrà passare al sito).
  return { title: `${t.metaTitle} — angar`, description: t.metaDesc, robots: { index: false } };
}

// Esempio illustrativo per la console (mai dati di clienti).
const MOCK = [
  { name: "Rossi Meccanica", spend: 1840, save: 420 },
  { name: "Hofmann & Partner", spend: 960, save: 210 },
  { name: "Atelier Moreau", spend: 610, save: 95 },
  { name: "Grupo Lumen", spend: 2310, save: 680 },
];
const eur = (n: number) => "€" + n.toLocaleString("en-GB");

const ICONS = [
  // documenti
  <svg key="a" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M4 1.75h5.5L12.25 4.5v9.75H4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M6 7.5h4M6 10h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>,
  // freccia in giù
  <svg key="b" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2 4.5l4.5 4.5 2.5-2.5 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 11.5h4v-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  // spunta su fattura
  <svg key="c" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><rect x="2" y="2.5" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" /><path d="M5.5 8.2l1.8 1.8 3.4-3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>,
];

// Pagina pubblica per commercialisti, consulenti fiscali e MSP / IT provider in tutta Europa.
export default function PartnersPage({ searchParams }: Props) {
  // Solo pubblica: dentro l'app (dati di esempio) non si mostra, si torna all'Overview.
  if (currentSession()) redirect("/");
  const lang = pickLang(searchParams.lang);
  const c = COMMON[lang];
  const t = PARTNERS[lang];
  const v = { d: PARTNER.discountPct, r: PARTNER.revenueSharePct };
  const signedIn = Boolean(currentSession());
  const pilotHref = lang === "en" ? "/pilot" : `/pilot?lang=${lang}`;

  return (
    <div lang={lang} className={signedIn ? "" : "min-h-screen bg-panel overflow-x-clip"}>
      {!signedIn && <PublicHeader active="partners" labels={c.nav} />}

      <main className={`${signedIn ? "" : "max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-20"} flex flex-col gap-16 sm:gap-20`}>
        {/* Hero */}
        <section className="relative grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-12 items-center">
          <HeroGrid />
          <div className="relative flex flex-col gap-6 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Eyebrow>{t.eyebrow}</Eyebrow>
              <LangSwitch path="/partners" lang={lang} label={c.langLabel} />
            </div>
            <h1 className="font-display text-[32px] sm:text-[44px] leading-[1.05] font-semibold tracking-[-0.02em] text-ink-100 text-balance">{t.h1}</h1>
            <p className="text-base sm:text-lg text-ink-400 leading-relaxed max-w-[36rem]">{t.sub}</p>
            <div className="flex flex-wrap gap-3">
              <a href="#apply" className="btn btn-primary h-10 px-4">{t.cta}</a>
              <a href="/pricing" className="btn btn-secondary h-10 px-4">{t.ctaSecondary}</a>
            </div>
            <ul className="flex flex-wrap gap-2">
              {t.audiences.map((a) => (
                <li key={a} className="text-xs text-ink-100 border border-line rounded-full px-2.5 py-1 bg-panel">{a}</li>
              ))}
            </ul>
          </div>

          {/* Anteprima della console partner, numeri d'esempio */}
          <div className="relative rounded-2xl border border-line bg-panel shadow-card overflow-hidden min-w-0">
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-line">
              <span className="text-sm font-semibold text-ink-100">{t.mock.title}</span>
              <span className="text-[11px] text-ink-400 border border-line rounded-full px-2 py-0.5">{t.mock.example}</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-mono uppercase text-[11px] tracking-[0.04em] text-ink-400">
                  <th className="px-5 pt-3 pb-2 font-medium">{t.mock.client}</th>
                  <th className="px-3 pt-3 pb-2 font-medium text-right">{t.mock.spend}</th>
                  <th className="px-5 pt-3 pb-2 font-medium text-right">{t.mock.save}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {MOCK.map((m) => (
                  <tr key={m.name}>
                    <td className="px-5 py-3 text-ink-100 truncate max-w-[9rem] sm:max-w-none">{m.name}</td>
                    <td className="px-3 py-3 text-right tabular text-ink-400 whitespace-nowrap">{eur(m.spend)}</td>
                    <td className="px-5 py-3 text-right tabular text-steady font-medium whitespace-nowrap">{eur(m.save)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line bg-ink/60">
                  <td className="px-5 py-3 text-xs text-ink-400" aria-hidden>Σ</td>
                  <td className="px-3 py-3 text-right tabular text-ink-100 font-semibold whitespace-nowrap">{eur(MOCK.reduce((s, m) => s + m.spend, 0))}</td>
                  <td className="px-5 py-3 text-right tabular text-steady font-semibold whitespace-nowrap">{eur(MOCK.reduce((s, m) => s + m.save, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Formati letti */}
        <section className="flex flex-wrap items-center gap-x-3 gap-y-2 -mt-6 sm:-mt-8 text-sm">
          <span className="text-ink-400">{t.formatsLabel}</span>
          {E_INVOICE_FORMATS.map((f) => (
            <span key={f} className="font-mono text-xs text-ink-100 border border-line rounded-md px-2 py-1 bg-panel">{f}</span>
          ))}
          <span className="text-xs text-ink-100 border border-line rounded-md px-2 py-1 bg-panel">{t.statements}</span>
        </section>

        {/* Per i clienti */}
        <section className="flex flex-col gap-6">
          <SectionTitle>{t.clientsTitle}</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {t.clients.map((it, i) => (
              <FeatureCard key={it.t} t={it.t} d={it.d} icon={ICONS[i]} />
            ))}
          </div>
        </section>

        {/* Per il partner */}
        <section className="flex flex-col gap-6">
          <SectionTitle>{t.youTitle}</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {t.you.map((it) => (
              <FeatureCard key={it.t} t={fill(it.t, v)} d={fill(it.d, v)} badge={it.soon && !PARTNER.brandedReports ? t.soon : undefined} />
            ))}
          </div>
        </section>

        <Steps title={c.howTitle} steps={t.how} />

        <TrustStrip copy={c.trust} />

        {/* Candidatura */}
        <section className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-8 lg:gap-12 items-start">
          <div className="flex flex-col gap-4 lg:sticky lg:top-8">
            <SectionTitle id="apply">{t.formTitle}</SectionTitle>
            <p className="text-sm text-ink-400">{t.formSub}</p>
            <ul className="flex flex-col gap-2 text-sm text-ink-100">
              {t.you.slice(0, 3).map((it) => (
                <li key={it.t} className="flex gap-2">
                  <Tick />
                  {fill(it.t, v)}
                </li>
              ))}
            </ul>
            <p className="text-sm text-ink-400 pt-2">
              {t.pilotNote}{" "}
              <a href={pilotHref} className="text-ink-100 underline underline-offset-2 hover:no-underline">{t.pilotLink}</a>
            </p>
          </div>
          <div className="rounded-xl border border-line bg-panel p-5 sm:p-6 shadow-card min-w-0">
            <LeadForm kind="partner" lang={lang} copy={c.form} countries={countryOptions(lang)} submit={t.submit} messagePh={t.messagePh} />
          </div>
        </section>
      </main>
    </div>
  );
}

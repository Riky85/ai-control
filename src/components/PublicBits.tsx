import type { ReactNode } from "react";
import { LANGS, type Lang, type CommonCopy } from "@/lib/i18n-partners";

// Pezzi comuni delle pagine pubbliche multilingua (/partners, /pilot).

/** Selettore lingua compatto: EN · IT · DE · FR · ES (?lang=…). */
export function LangSwitch({ path, lang, label }: { path: string; lang: Lang; label: string }) {
  return (
    <nav aria-label={label} className="inline-flex items-center gap-0.5 rounded-lg border border-line p-0.5 text-xs">
      {LANGS.map((l) => (
        <a
          key={l.code}
          href={l.code === "en" ? path : `${path}?lang=${l.code}`}
          hrefLang={l.code}
          lang={l.code}
          title={l.label}
          aria-current={l.code === lang ? "true" : undefined}
          className={`px-2 py-1 rounded-md font-medium transition-colors ${l.code === lang ? "bg-ink text-ink-100" : "text-ink-400 hover:text-ink-100"}`}
        >
          {l.short}
        </a>
      ))}
    </nav>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-ink-400">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
      {children}
    </span>
  );
}

/** Griglia di sfondo sfumata dell'hero (come /engine), mai un bagliore. */
export function HeroGrid() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -inset-x-4 -top-10 -bottom-6 opacity-70"
      style={{
        backgroundImage: "linear-gradient(to right, rgb(var(--c-line) / 0.6) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--c-line) / 0.6) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
        maskImage: "radial-gradient(ellipse 60% 70% at 72% 45%, black, transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse 60% 70% at 72% 45%, black, transparent 75%)",
      }}
    />
  );
}

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="font-display text-[22px] sm:text-[26px] leading-tight font-semibold tracking-tight text-ink-100 scroll-mt-8">
      {children}
    </h2>
  );
}

export const Tick = ({ className = "text-steady" }: { className?: string }) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className={`shrink-0 mt-0.5 ${className}`} aria-hidden>
    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Card semplice: titolo + testo, con un'etichetta opzionale ("In arrivo"). */
export function FeatureCard({ t, d, badge, icon }: { t: string; d: string; badge?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-2 min-w-0">
      {icon && <div className="h-8 w-8 rounded-lg bg-ink text-ink-100 flex items-center justify-center mb-1">{icon}</div>}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-ink-100">{t}</h3>
        {badge && <span className="shrink-0 text-[11px] font-medium text-ink-400 border border-line rounded-full px-2 py-0.5 whitespace-nowrap">{badge}</span>}
      </div>
      <p className="text-sm text-ink-400 leading-relaxed">{d}</p>
    </div>
  );
}

/** Tre passi numerati in riga (in colonna su mobile). */
export function Steps({ title, steps }: { title: string; steps: { t: string; d: string }[] }) {
  return (
    <section className="flex flex-col gap-6">
      <SectionTitle>{title}</SectionTitle>
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {steps.map((s, i) => (
          <li key={s.t} className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-2">
            <span className="font-display text-sm font-semibold tabular text-ink-400">0{i + 1}</span>
            <h3 className="text-[15px] font-semibold text-ink-100">{s.t}</h3>
            <p className="text-sm text-ink-400 leading-relaxed">{s.d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Dati e fiducia: quattro punti + link a /trust. */
export function TrustStrip({ copy }: { copy: CommonCopy["trust"] }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5 sm:p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="text-steady shrink-0" aria-hidden>
            <path d="M8 1.5l5 2v4c0 3.2-2.2 5.6-5 7-2.8-1.4-5-3.8-5-7v-4l5-2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M5.5 8l1.8 1.8L10.8 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2 className="text-base font-semibold text-ink-100">{copy.title}</h2>
        </div>
        <a href="/trust" className="text-sm text-ink-100 underline underline-offset-2 hover:no-underline">
          {copy.link} →
        </a>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
        {copy.items.map((it) => (
          <li key={it.t} className="flex gap-2.5 min-w-0">
            <Tick />
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink-100">{it.t}</div>
              <div className="text-sm text-ink-400">{it.d}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

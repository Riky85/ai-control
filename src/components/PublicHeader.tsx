import { Wordmark } from "@/components/Logo";

export type PublicNavKey = "pricing" | "partners" | "engine" | "check" | "pilot";

const DEFAULT_LABELS = { pricing: "Pricing", partners: "Partners", engine: "Engine", signIn: "Sign in", startFree: "Start free" };
export type PublicNavLabels = typeof DEFAULT_LABELS;

/**
 * Intestazione delle pagine pubbliche (/check, /pricing, /engine, /partners,
 * /pilot): stessi link ovunque. Su mobile i link secondari vanno su una seconda
 * riga, così niente scorrimento orizzontale a 375px.
 */
export default function PublicHeader({ active, labels = DEFAULT_LABELS, width = "max-w-6xl" }: { active?: PublicNavKey; labels?: PublicNavLabels; width?: string }) {
  const links: { key: PublicNavKey; href: string; label: string }[] = [
    { key: "pricing", href: "/pricing", label: labels.pricing },
    { key: "partners", href: "/partners", label: labels.partners },
    { key: "engine", href: "/engine", label: labels.engine },
  ];
  const cls = (k: PublicNavKey) => (k === active ? "text-ink-100 font-medium" : "text-ink-400 hover:text-ink-100");
  return (
    <header className={`${width} mx-auto px-4 sm:px-6 pt-6 sm:pt-8`}>
      <div className="flex items-center justify-between gap-3">
        <a href="/check" className="text-ink-100 shrink-0" aria-label="angar">
          <Wordmark size={20} />
        </a>
        <nav className="flex items-center gap-4 sm:gap-5 text-sm min-w-0" aria-label="Main">
          {links.map((l) => (
            <a key={l.key} href={l.href} className={`hidden sm:inline ${cls(l.key)}`} aria-current={l.key === active ? "page" : undefined}>
              {l.label}
            </a>
          ))}
          <a href="/login" className="text-ink-400 hover:text-ink-100 whitespace-nowrap">{labels.signIn}</a>
          <a href="/signup" className="btn btn-primary btn-sm whitespace-nowrap">{labels.startFree}</a>
        </nav>
      </div>
      <nav className="sm:hidden flex items-center gap-5 text-sm mt-3" aria-label="Sections">
        {links.map((l) => (
          <a key={l.key} href={l.href} className={cls(l.key)} aria-current={l.key === active ? "page" : undefined}>
            {l.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

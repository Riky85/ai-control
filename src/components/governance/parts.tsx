import Link from "next/link";
import { BlockHead } from "@/components/ui";

/**
 * Pezzi condivisi da Governance e Usage, nello stesso linguaggio del blocco
 * "What you pay vs the market": linee sottili, pillole tinte, colore misurato.
 */

const PILL = {
  alarm: "text-alarm bg-alarm/10",
  signal: "text-signal bg-signal/10",
  steady: "text-steady bg-steady/10",
  accent: "text-accent bg-accent/10",
  muted: "text-ink-400 bg-ink-100/[0.06]",
} as const;
export type Tone = keyof typeof PILL;

/** Pillola tinta: sempre testo + colore, mai solo colore. */
export function Pill({ tone = "muted", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-[2px] px-1.5 py-0.5 font-mono uppercase tracking-[0.05em] text-[10px] tabular whitespace-nowrap ${PILL[tone]}`}>
      {children}
    </span>
  );
}

/** Riquadro di sezione: titolo, riga di contesto, azione a destra, corpo e piè con il prossimo passo. */
export function Section({
  id,
  title,
  meta,
  action,
  children,
  footer,
  className = "",
}: {
  id?: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`rounded-xl border border-line bg-panel animate-rise scroll-mt-6 flex flex-col ${className}`} aria-labelledby={id ? `${id}-title` : undefined}>
      {/* Barra grigia in alto: titolo a sinistra, contesto e azioni a destra (regola della casa). */}
      <BlockHead id={id ? `${id}-title` : undefined} title={title} note={meta} action={action} rounded="rounded-t-xl" />
      {children && <div className="flex-1">{children}</div>}
      {footer && <div className="bg-ink border-t border-line rounded-b-xl px-5 py-3 text-sm bar-foot">{footer}</div>}
    </section>
  );
}

/** Il prossimo passo di una sezione (una sola azione), oppure "tutto a posto". */
export function NextStep({ href, label, done }: { href?: string; label: React.ReactNode; done?: boolean }) {
  if (done || !href) {
    return (
      <span className="flex items-center gap-2 text-ink-400">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${done ? "bg-steady" : "bg-ink-400"}`} aria-hidden />
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className="flex items-center gap-2 group">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-400" aria-hidden />
      <span className="flex-1 min-w-0 truncate text-ink-100 group-hover:underline">{label}</span>
      <span className="text-ink-400 group-hover:text-ink-100 shrink-0">→</span>
    </Link>
  );
}

export type StackPart = { key: string; label: string; value: number; bar: string; dot: string; href?: string };

/** Barra impilata sottile (parti di un totale) con legenda: pallino, nome e numero. */
export function StackBar({ parts, label }: { parts: StackPart[]; label: string }) {
  const total = parts.reduce((t, p) => t + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  const summary = `${label}: ${parts.map((p) => `${p.value} ${p.label.toLowerCase()}`).join(", ")}`;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-ink-100/[0.06]" role="img" aria-label={summary} title={summary}>
        {total > 0 && shown.map((p) => <div key={p.key} className={`h-full first:rounded-l-full last:rounded-r-full ${p.bar}`} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-400">
        {parts.map((p) => {
          const inner = (
            <>
              <span className={`h-2 w-2 rounded-full ${p.dot}`} aria-hidden />
              {p.label}
              <b className="font-medium text-ink-100 tabular">{p.value}</b>
            </>
          );
          return (
            <li key={p.key}>
              {p.href && p.value > 0 ? (
                <Link href={p.href} className="flex items-center gap-1.5 hover:text-ink-100">
                  {inner}
                </Link>
              ) : (
                <span className="flex items-center gap-1.5">{inner}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Freccia di apertura per i <details> (ruota quando aperti). */
export function Chevron() {
  return (
    <span className="text-ink-400 transition-transform group-open:rotate-90" aria-hidden>
      ›
    </span>
  );
}

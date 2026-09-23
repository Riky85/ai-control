import Link from "next/link";

/** Card statistica condivisa da tutte le pagine — nessun hover, solo link se serve. */
export function StatCard({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  tone?: "signal" | "alarm" | "accent";
}) {
  const color = tone === "signal" ? "text-signal" : tone === "alarm" ? "text-alarm" : tone === "accent" ? "text-accent" : "text-ink-100";
  const inner = (
    <>
      <div className="text-sm text-ink-400">{label}</div>
      <div>
        <div className={`font-display text-[30px] leading-none font-semibold tracking-tight tabular ${color}`}>{value}</div>
        {hint && <div className="text-xs text-ink-400 mt-1.5 truncate">{hint}</div>}
      </div>
    </>
  );
  const cls = "rounded-xl border border-line bg-panel p-5 min-h-[112px] flex flex-col justify-between gap-4 animate-rise";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Contenitore per grafici e sezioni — titolo, sottotitolo, azione opzionale. */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-panel p-5 animate-rise ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-ink-100">{title}</h2>
          {subtitle && <p className="text-sm text-ink-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink-100">{title}</h1>
        {subtitle && <p className="text-sm text-ink-400 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

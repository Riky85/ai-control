import Link from "next/link";
import { unreadAlertCount } from "@/lib/alerts";

// Campanella in alto a destra: numero di avvisi non letti (rinnovi, budget, AI non consentite, posti).
export default async function AlertsBell({ organizationId }: { organizationId: string }) {
  const n = await unreadAlertCount(organizationId);
  const label = n ? `${n} new alert${n === 1 ? "" : "s"}` : "No new alerts";
  return (
    <span className="relative group/bell">
      <Link href="/alerts" aria-label={label} className="btn btn-secondary btn-icon relative">
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden className={n ? "text-ink-100" : "text-ink-400"}>
          <path d="M4.5 12.5V8a4.5 4.5 0 019 0v4.5l1.3 1.5H3.2l1.3-1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M7.3 15.6a1.9 1.9 0 003.4 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {n > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-semibold leading-[18px] text-center tabular ring-2 ring-panel">{n > 99 ? "99+" : n}</span>
        )}
      </Link>
      <span role="tooltip" className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap rounded-md bg-ink-100 px-2 py-1 text-xs text-panel opacity-0 translate-y-[-2px] transition-all group-hover/bell:opacity-100 group-hover/bell:translate-y-0 z-50">
        {label}
      </span>
    </span>
  );
}

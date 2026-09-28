import Link from "next/link";
import { featureAvailability, type Feature } from "@/lib/plans";

export function LockIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/**
 * Funzione non inclusa nel piano: stessa posizione del pulsante vero, con
 * lucchetto e link a Billing ("Available on Growth"). Mai nascosta.
 */
export default function LockedFeature({ feature, label, className = "btn btn-secondary" }: { feature: Feature; label: string; className?: string }) {
  const hint = featureAvailability(feature);
  return (
    <Link href="/billing" title={hint} className={`${className} inline-flex items-center gap-1.5 opacity-80`}>
      <LockIcon />
      {label}
      <span className="sr-only"> — {hint}</span>
    </Link>
  );
}

/** Riga compatta: lucchetto + "Available on Growth" → Billing. */
export function LockedNote({ feature }: { feature: Feature }) {
  return (
    <Link href="/billing" className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-100">
      <LockIcon size={12} />
      {featureAvailability(feature)}
    </Link>
  );
}

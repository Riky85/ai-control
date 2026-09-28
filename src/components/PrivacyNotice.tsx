import Link from "next/link";
import { MIN_GROUP, type PrivacyMode } from "@/lib/privacy";

/**
 * Spiega perché una pagina non mostra le persone: la modalità privacy
 * scelta dall'azienda. Nessun output in modalità "individual".
 */
export default function PrivacyNotice({ mode, what }: { mode: PrivacyMode; what?: string }) {
  if (mode === "individual") return null;
  return (
    <div className="rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-100 flex items-start gap-3">
      <span aria-hidden className="mt-0.5 text-ink-400">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </span>
      <div className="flex-1">
        {mode === "department" ? (
          <>
            <b>Employee privacy: per department.</b> {what ?? "This page"} shows totals per department only — groups of at least {MIN_GROUP} people, smaller teams merged into &ldquo;Other (small teams)&rdquo;. No names, emails or devices.
          </>
        ) : (
          <>
            <b>Employee privacy: company totals only.</b> {what ?? "This page"} shows company-wide totals only — no names, devices or departments.
          </>
        )}{" "}
        <Link href="/settings#privacy" className="underline text-ink-400 hover:text-ink-100">Privacy settings</Link>
      </div>
    </div>
  );
}

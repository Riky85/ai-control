import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { HOSTING } from "@/lib/trust";

// Intestazione e piè di pagina del Trust Center. Da non autenticati la pagina
// è piena (niente sidebar), quindi serve un'intestazione propria; da
// autenticati resta solo il contenuto dentro l'app.

export function TrustHeader() {
  return (
    <header className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 flex items-center justify-between gap-3 print:hidden">
      <Link href="/check" className="text-ink-100 shrink-0" aria-label="angar">
        <Wordmark size={20} />
      </Link>
      <nav className="flex items-center gap-3 sm:gap-5 text-sm">
        <Link href="/pricing" className="text-ink-400 hover:text-ink-100 hidden sm:inline">Pricing</Link>
        <Link href="/login" className="text-ink-400 hover:text-ink-100">Sign in</Link>
        <Link href="/signup" className="btn btn-primary btn-sm">Start free</Link>
      </nav>
    </header>
  );
}

export function TrustFooter({ updated }: { updated: string }) {
  return (
    <footer className="border-t border-line mt-16 pt-6 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-ink-400">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>© angar</span>
        <Link href="/trust" className="hover:text-ink-100 print:hidden">Trust Center</Link>
        <Link href="/trust#documents" className="hover:text-ink-100 print:hidden">Documents</Link>
        <Link href="/pricing" className="hover:text-ink-100 print:hidden">Pricing</Link>
        <span>Hosted in the EU ({HOSTING.country.replace(" (EU)", "")}) · GDPR</span>
      </div>
      <span>Last reviewed {updated}</span>
    </footer>
  );
}

/** Data dell'ultima revisione dei testi del Trust Center (da aggiornare quando cambiano). */
export const TRUST_REVIEWED = "1 October 2026";

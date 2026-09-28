import Link from "next/link";
import { savedSoFar } from "@/lib/savings-ledger";
import { fmtEur } from "@/lib/format";

/**
 * "Saved so far": risparmi già realizzati (registro dei risparmi), in una riga
 * compatta per la home. Niente se non c'è ancora nulla di fatto o in corso.
 */
export default async function SavedSoFar({ orgId }: { orgId: string }) {
  const s = await savedSoFar(orgId).catch(() => null);
  if (!s || (s.savedMonthly < 1 && s.counts.accepted === 0)) return null;
  return (
    <Link
      href="/savings?view=progress"
      className="rounded-xl border border-line bg-panel px-5 py-3 flex items-center gap-4 hover:border-ink-400 transition-colors animate-rise"
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-steady ring-4 ring-steady/25" />
      <span className="text-sm text-ink-400">Saved so far</span>
      <span className="font-display text-lg font-semibold tabular text-ink-100">
        {fmtEur(s.savedMonthly)}
        <span className="text-sm text-ink-400 font-normal">/mo</span>
      </span>
      <span className="text-sm text-ink-400 truncate flex-1">
        {fmtEur(s.savedMonthly * 12)} a year
        {s.verifiedMonthly >= 1 ? ` · ${fmtEur(s.verifiedMonthly)}/mo confirmed on your bills` : ""}
        {s.counts.accepted ? ` · ${s.counts.accepted} in progress` : ""}
      </span>
      <span className="text-sm text-ink-400">→</span>
    </Link>
  );
}

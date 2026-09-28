import { savedSoFar } from "@/lib/savings-ledger";
import { fmtEur } from "@/lib/format";
import { InfoStrip } from "@/components/ui";

/**
 * "Saved so far": risparmi già realizzati (registro dei risparmi), in una riga
 * compatta per la home. Niente se non c'è ancora nulla di fatto o in corso.
 */
export default async function SavedSoFar({ orgId }: { orgId: string }) {
  const s = await savedSoFar(orgId).catch(() => null);
  if (!s || (s.savedMonthly < 1 && s.counts.accepted === 0)) return null;
  const text = [
    `${fmtEur(s.savedMonthly * 12)} a year`,
    s.verifiedMonthly >= 1 ? `${fmtEur(s.verifiedMonthly)}/mo confirmed on your bills` : null,
    s.counts.accepted ? `${s.counts.accepted} in progress` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <InfoStrip
      tone="steady"
      icon={
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3 3 7-7" /></svg>
      }
      title="Saved so far"
      value={<>{fmtEur(s.savedMonthly)}<span className="text-xs text-ink-400 font-normal">/mo</span></>}
      text={text}
      href="/savings?view=progress"
    />
  );
}

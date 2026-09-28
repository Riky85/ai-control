import { currentSession } from "@/lib/auth";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";
import { seatRemovalSupport } from "@/lib/seat-removal";
import { removeSeatAction } from "@/lib/savings-actions";

/**
 * "Remove seat" per una persona su un'AI: via API del fornitore quando angar
 * può farlo (conferma in un piccolo riquadro, nessun JavaScript), altrimenti
 * il link alla pagina di amministrazione del fornitore. Solo admin, solo con
 * la privacy "per persona".
 */
export default async function SeatRemoveButton({ assetId, email, back = "people" }: { assetId: string; email: string; back?: "people" | "cleanup" }) {
  const s = currentSession();
  if (!s || !["OWNER", "ADMIN"].includes(s.role)) return null;
  if (!showsPeople(await orgPrivacyMode(s.orgId))) return null;
  const support = await seatRemovalSupport(s.orgId, assetId);
  if (!support) return null;

  if (support.mode === "manual") {
    return support.url ? (
      <a href={support.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" title="angar can't remove this seat automatically — remove it in the provider's admin page, then mark it removed">
        Admin page ↗
      </a>
    ) : null;
  }

  return (
    <details className="relative inline-block text-left">
      <summary className="btn btn-secondary btn-sm list-none cursor-pointer select-none">Remove seat</summary>
      <div className="absolute right-0 z-30 mt-1.5 w-72 rounded-xl border border-line bg-panel p-4 shadow-lg flex flex-col gap-3">
        <p className="text-sm text-ink-100">
          Remove the seat of <span className="font-medium break-all">{email}</span> in {support.label}?
        </p>
        <p className="text-xs text-ink-400">angar removes it now through the {support.label} admin API. They can be given a seat again at any time.</p>
        <form action={removeSeatAction}>
          <input type="hidden" name="assetId" value={assetId} />
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="back" value={back} />
          <button className="btn btn-danger btn-sm w-full">Yes, remove the seat</button>
        </form>
      </div>
    </details>
  );
}

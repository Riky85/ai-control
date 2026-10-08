import { nudgeUsersAction } from "@/lib/access/actions";
import { fmtDate } from "@/lib/format";
import { nextNudgeAt } from "@/lib/access/nudge";

/**
 * "Nudge users" su un'AI non consentita: email cortese a chi la usa ancora, con l'alternativa
 * approvata. Spento (con la data) se è già partito negli ultimi 7 giorni. Solo per admin: chi lo
 * mostra controlla il ruolo; l'azione lo ricontrolla.
 */
export default function NudgeButton({ assetId, nudgedAt, back }: { assetId: string; nudgedAt: Date | null; back: string }) {
  const next = nextNudgeAt(nudgedAt);
  if (next)
    return (
      <button type="button" disabled className="btn btn-ghost btn-sm opacity-50 cursor-not-allowed" title={`Nudged on ${fmtDate(nudgedAt)} — next possible on ${fmtDate(next)}`}>
        Nudged
      </button>
    );
  return (
    <form action={nudgeUsersAction}>
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="back" value={back} />
      <button className="btn btn-secondary btn-sm" title="Email the people who still use it: a short, polite notice with the approved alternative">
        Nudge users
      </button>
    </form>
  );
}

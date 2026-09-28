import { db } from "@/lib/db";
import { Wordmark } from "@/components/Logo";
import { respondSeatAction } from "@/lib/seat-actions";

export const dynamic = "force-dynamic";

// Pagina pubblica dal link nell'email "ti serve ancora il posto?". La risposta
// si registra solo col clic su un pulsante (i controlli antivirus che aprono i
// link nelle email non devono rispondere al posto della persona).
export default async function SeatPage({ params, searchParams }: { params: { token: string }; searchParams: { done?: string } }) {
  const r = await db.seatReminder.findUnique({ where: { token: params.token } });
  const asset = r ? await db.aiAsset.findUnique({ where: { id: r.aiAssetId }, select: { name: true, organization: { select: { name: true } } } }) : null;
  const done = searchParams.done ?? r?.response ?? null;

  return (
    <div className="force-dark min-h-screen bg-sidebar text-ink-100 flex flex-col items-center justify-center px-6 py-12 gap-8">
      <Wordmark size={22} />
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-7 flex flex-col gap-5">
        {!r || !asset ? (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight">This link isn&apos;t valid any more</h1>
            <p className="text-sm text-ink-400">It may have been replaced by a newer email. Ask your IT or finance team if you need help.</p>
          </>
        ) : done ? (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{done === "keep" ? "Got it — you keep your seat" : "Thanks — the seat will be freed"}</h1>
            <p className="text-sm text-ink-400">
              {done === "keep"
                ? `${asset.organization.name} knows you still need ${asset.name}.`
                : `${asset.organization.name} will remove your ${asset.name} seat so it stops paying for it. You can always ask for it again.`}
            </p>
            <p className="text-xs text-ink-400">You can close this page.</p>
          </>
        ) : (
          <>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">Do you still need {asset.name}?</h1>
              <p className="text-sm text-ink-400 mt-2">
                {asset.organization.name} pays for a {asset.name} seat for you ({r.email}), but it hasn&apos;t been used in the last 30 days.
              </p>
            </div>
            <form action={respondSeatAction} className="flex flex-col gap-2.5">
              <input type="hidden" name="token" value={params.token} />
              <button name="response" value="keep" className="btn btn-primary !h-11 !rounded-xl">Yes, I still need it</button>
              <button name="response" value="release" className="btn btn-secondary !h-11 !rounded-xl">No, free it up</button>
            </form>
            <p className="text-xs text-ink-400">No answer in 7 days means the seat can be freed. angar only sees which AI tools are used — never what you do in them.</p>
          </>
        )}
      </div>
    </div>
  );
}

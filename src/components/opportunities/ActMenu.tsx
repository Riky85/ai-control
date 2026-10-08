import * as React from "react";
import { currentSession } from "@/lib/auth";
import { actOnOpportunityAction } from "@/lib/opportunities/act";
import { actsFor, loadActContext, type ActContext } from "@/lib/opportunities/act-plan";
import type { Opportunity } from "@/lib/opportunities/types";
import { db } from "@/lib/db";

// Contesto di "Act" una volta per richiesta (tutte le righe della pagina lo condividono).
const reactCache = (React as { cache?: <F extends (...a: never[]) => unknown>(fn: F) => F }).cache ?? (<F,>(fn: F) => fn);
const contextFor = reactCache(async (orgId: string): Promise<ActContext | null> => {
  try {
    const ids = await db.aiAsset.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true }, take: 500 });
    return await loadActContext(orgId, ids.map((a) => a.id));
  } catch (err) {
    console.error("[act] context failed", (err as Error).message);
    return null;
  }
});

/**
 * Menu "Act" accanto ai controlli di stato di una riga: un modulo per esecutore (nessun
 * JavaScript, si apre con <details>). Le voci che non si possono usare restano visibili, spente,
 * con il motivo. `ctx` si passa solo nelle pagine di prova (senza database).
 */
export default async function ActMenu({ o, back, ctx, align = "right" }: { o: Opportunity; back: string; ctx?: ActContext; align?: "left" | "right" }) {
  const open = o.status === "new" || o.status === "accepted" || o.status === "in_progress";
  if (!open) return null;
  let context = ctx ?? null;
  if (!context) {
    const s = currentSession();
    if (!s || s.role === "VIEWER") return null;
    context = await contextFor(s.orgId);
  }
  if (!context) return null;
  const options = actsFor(o, context);
  if (!options.length) return null;
  return (
    <details className="relative inline-block text-left group/act">
      <summary className="btn btn-secondary btn-sm list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden" title="Do it now: the right next step for this opportunity">
        Act
      </summary>
      <div className={`menu absolute ${align === "right" ? "right-0" : "left-0"} z-40 mt-1.5 w-72`} role="menu">
        <div className="eyebrow px-2.5 pt-1 pb-1.5">Act on this</div>
        {options.map((x) => (
          <form key={x.act} action={actOnOpportunityAction}>
            <input type="hidden" name="key" value={o.key} />
            <input type="hidden" name="act" value={x.act} />
            <input type="hidden" name="back" value={back} />
            <button
              role="menuitem"
              disabled={!!x.disabled}
              title={x.disabled ?? x.hint}
              className="menu-item !flex-col !items-start !gap-0.5"
            >
              <span className="text-sm text-ink-100">{x.label}</span>
              <span className="w-full text-xs text-ink-400 truncate">{x.disabled ?? x.hint}</span>
            </button>
          </form>
        ))}
        <p className="-mx-1.5 px-4 pt-2 pb-0.5 mt-1 border-t border-line text-[11px] text-ink-400">Acting marks it accepted and goes in the audit log.</p>
      </div>
    </details>
  );
}

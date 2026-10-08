/**
 * "Act" sulle opportunità: quali esecutori offrire per ogni riga (puro) e il contesto che serve
 * per deciderlo (una lettura per pagina). Le azioni server stanno in act.ts.
 *
 * Esecutori:
 *  - seats     → pulizia posti (chiede alle persone inattive, poi "Remove seat"), solo "seats:<id>";
 *  - negotiate → dossier del rinnovo /negotiate/[id] (risparmi, prezzi sopra listino, rinnovi);
 *  - ticket    → Jira / ServiceNow (se collegati);
 *  - email     → email al responsabile dell'AI (se l'email è configurata e c'è un responsabile);
 *  - chat      → Slack / Teams (se c'è il webhook);
 *  - simulate  → Impact simulator con i parametri dell'opportunità.
 */
import { db } from "@/lib/db";
import { connectedTicketing } from "@/lib/ticketing";
import { emailEnabled } from "@/lib/mail";
import type { Opportunity } from "./types";

export const ACTS = ["seats", "negotiate", "ticket", "email", "chat", "simulate"] as const;
export type Act = (typeof ACTS)[number];
export const isAct = (v: string): v is Act => (ACTS as readonly string[]).includes(v);

export interface ActContext {
  ticketing: string | null; // "Jira" | "ServiceNow"
  email: boolean;
  chat: string | null; // "Slack" | "Teams"
  /** id dell'AI → email del responsabile (contratto prima, poi owner). */
  owners: Record<string, string>;
}

export interface ActOption {
  act: Act;
  label: string;
  hint: string;
  /** Motivo per cui non si può (voce mostrata spenta). Ogni atto passa dal server, per audit e stato. */
  disabled?: string;
}

/** Id dell'AI coinvolta, quando l'opportunità ne riguarda una sola in modo chiaro. */
export function primaryAsset(o: Pick<Opportunity, "key" | "systems">): string | null {
  const m = /^(?:seats|renewal|dep|switch):([^:]+)/.exec(o.key);
  if (m) return m[1];
  return o.systems[0]?.id ?? null;
}

const negotiable = (o: Pick<Opportunity, "key" | "category">) => o.category === "SAVE" || /^(price|renewal|seats):/.test(o.key);

/** Esecutori adatti a questa opportunità, nell'ordine in cui compaiono nel menu. */
export function actsFor(o: Pick<Opportunity, "key" | "category" | "systems" | "simulateHref">, ctx: ActContext): ActOption[] {
  const out: ActOption[] = [];
  const asset = primaryAsset(o);
  const owner = asset ? ctx.owners[asset] ?? null : null;
  if (o.key.startsWith("seats:")) out.push({ act: "seats", label: "Remove unused seats", hint: "Ask inactive people first, then remove their seats" });
  if (asset && negotiable(o)) out.push({ act: "negotiate", label: "Start negotiation", hint: "Renewal dossier with market prices and a draft email" });
  out.push(
    ctx.ticketing
      ? { act: "ticket", label: `Create a ${ctx.ticketing} ticket`, hint: "One ticket, linked back here" }
      : { act: "ticket", label: "Create a ticket", hint: "Connect Jira or ServiceNow in Settings", disabled: "Connect Jira or ServiceNow in Settings → Integrations" },
  );
  out.push(
    !ctx.email
      ? { act: "email", label: "Email the owner", hint: "Email isn't set up on this deployment", disabled: "Email isn't set up on this deployment" }
      : owner
        ? { act: "email", label: "Email the owner", hint: owner }
        : { act: "email", label: "Email the owner", hint: "No owner set for this AI", disabled: "Set an owner on the AI system first" },
  );
  if (ctx.chat) out.push({ act: "chat", label: `Post to ${ctx.chat}`, hint: "Share it with the team channel" });
  if (o.simulateHref) out.push({ act: "simulate", label: "Open in Impact simulator", hint: "See what happens if you do it" });
  return out;
}

/** Contesto per tutte le righe di una pagina. Ogni lettura è indipendente: un errore spegne solo quell'esecutore. */
export async function loadActContext(organizationId: string, assetIds: string[]): Promise<ActContext> {
  const ids = Array.from(new Set(assetIds)).slice(0, 500);
  const [tool, org, assets] = await Promise.all([
    connectedTicketing(organizationId).catch(() => null),
    db.organization.findUnique({ where: { id: organizationId }, select: { chatWebhookEncrypted: true } }).catch(() => null),
    ids.length
      ? db.aiAsset
          .findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, owner: { select: { email: true } }, cost: { select: { contractOwnerEmail: true } } } })
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const owners: Record<string, string> = {};
  for (const a of assets) {
    const e = a.cost?.contractOwnerEmail || a.owner?.email;
    if (e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) owners[a.id] = e.toLowerCase();
  }
  let chat: string | null = null;
  if (org?.chatWebhookEncrypted) {
    try {
      const { decryptJson } = await import("@/lib/crypto");
      const url = decryptJson<{ url: string }>(org.chatWebhookEncrypted)?.url;
      if (url) chat = /(^|\.)hooks\.slack\.com$/.test(new URL(url).hostname) ? "Slack" : "Teams";
    } catch {
      chat = null;
    }
  }
  return { ticketing: tool?.label ?? null, email: emailEnabled(), chat, owners };
}

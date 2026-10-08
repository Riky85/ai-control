/**
 * Opportunities — stato persistente (puro).
 *
 * Due registri, mai mescolati:
 *  - opportunità del motore dei risparmi → SavingAction (accepted / done / verified / failed) e
 *    SavingDismissal ("not for us"), come prima: "In progress" e la verifica sugli addebiti restano uguali;
 *  - tutte le altre → OpportunityState, chiave = chiave deterministica dell'opportunità.
 *
 * Una chiave che sparisce dall'elenco (situazione risolta, dati cambiati) non lascia nulla in giro:
 * lo stato resta nel database e torna valido se la stessa situazione ricompare.
 */
import { STATUSES, type Opportunity, type Status } from "./types";

export interface StatusInput {
  /** OpportunityState: chiave → stato. */
  states: Map<string, Status>;
  /** SavingAction (non fallite): chiave del suggerimento → stato del registro. */
  ledger: Map<string, "accepted" | "done" | "verified">;
  /** SavingDismissal: chiavi nascoste. */
  dismissed: Set<string>;
}

export const emptyStatus = (): StatusInput => ({ states: new Map(), ledger: new Map(), dismissed: new Set() });

export const isStatus = (s: string): s is Status => (STATUSES as readonly string[]).includes(s);

/** Dallo stato del registro dei risparmi allo stato dell'opportunità. */
export function fromLedger(s: "accepted" | "done" | "verified" | undefined, dismissed: boolean): Status {
  if (dismissed) return "dismissed";
  if (s === "accepted") return "accepted";
  if (s === "done" || s === "verified") return "done";
  return "new";
}

/** Stato di ciascuna opportunità dal suo registro. Le chiudere (done / dismissed) restano nell'elenco: il filtro lo fa la pagina. */
export function applyStatus(list: Opportunity[], st: StatusInput): Opportunity[] {
  return list.map((o) => {
    const status: Status = o.ledger === "savings" ? fromLedger(st.ledger.get(o.key), st.dismissed.has(o.key)) : st.states.get(o.key) ?? "new";
    // Accettato nel registro ma ancora tra i suggerimenti calcolati: fuori dal totale.
    const counted = status === "new" ? o.countedMonthlyEur : 0;
    return { ...o, status, countedMonthlyEur: counted };
  });
}

/** Passaggi consentiti (azione "Mark done", "Dismiss", "Accept", "Start", "Reopen"). */
export const TRANSITIONS: Record<Status, Status[]> = {
  new: ["accepted", "in_progress", "done", "dismissed"],
  accepted: ["in_progress", "done", "dismissed", "new"],
  in_progress: ["done", "dismissed", "new"],
  done: ["new"],
  dismissed: ["new"],
};

export function canMove(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Visibile nella scheda "All" (aperte); "In progress" mostra accepted + in_progress. */
export const isOpen = (s: Status) => s === "new" || s === "accepted" || s === "in_progress";

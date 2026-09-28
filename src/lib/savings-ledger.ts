/**
 * Registro dei risparmi realizzati. Un suggerimento accettato ("In progress")
 * diventa "done" quando qualcuno lo segna fatto (o angar toglie un posto), e
 * "verified" quando gli addebiti reali dopo quella data sono davvero scesi.
 * Nessun numero inventato: il risparmio verificato è la differenza tra il
 * primo addebito dopo il cambio e la mediana dei 3 precedenti.
 */
import { db } from "@/lib/db";
import { createAlert } from "@/lib/alerts";
import { fmtEur } from "@/lib/format";
import type { Saving } from "@/lib/savings";

const DAY = 86400000;
export const VERIFY_AFTER_DAYS = 45;

export const LEDGER_KINDS = ["seat_removed", "plan_downgrade", "duplicate_removed", "annual_billing", "cancelled", "other"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];
export type LedgerStatus = "accepted" | "done" | "verified" | "failed";

export const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  seat_removed: "Seat removed",
  plan_downgrade: "Cheaper plan",
  duplicate_removed: "Duplicate removed",
  annual_billing: "Yearly billing",
  cancelled: "Cancelled",
  other: "Other",
};

/** Dal tipo di suggerimento (savings.ts) al tipo di azione nel registro. */
export function ledgerKindOf(kind: Saving["kind"]): LedgerKind {
  switch (kind) {
    case "seats":
      return "seat_removed";
    case "annual":
      return "annual_billing";
    case "duplicate":
      return "duplicate_removed";
    case "premium":
      return "plan_downgrade";
    case "idle":
      return "cancelled";
    default:
      return "other";
  }
}

/** L'AI su cui si misura il risparmio: per un doppione, la prima da togliere. */
export const ledgerAssetOf = (s: Pick<Saving, "kind" | "assets">) => (s.kind === "duplicate" ? s.assets[1]?.id : s.assets[0]?.id) ?? null;

/** Un posto tolto (a mano o via API): una riga "done" per posto, idempotente sul promemoria. */
export async function recordSeatRemoval(organizationId: string, r: { seatReminderId: string; assetId: string; assetName: string; perSeatEur: number | null; createdBy: string; via: "api" | "manual" }) {
  const data = {
    organizationId,
    assetId: r.assetId,
    kind: "seat_removed",
    title: `1 ${r.assetName} seat removed`,
    expectedMonthlyEur: Math.round((r.perSeatEur ?? 0) * 100) / 100,
    status: "done",
    doneAt: new Date(),
    seatReminderId: r.seatReminderId,
    createdBy: r.createdBy,
    note: r.via === "api" ? "Removed by angar via the provider's API" : "Removed by hand in the provider's admin page",
  };
  return db.savingAction.upsert({ where: { seatReminderId: r.seatReminderId }, create: data, update: {} });
}

export type SavedSoFar = Awaited<ReturnType<typeof savedSoFar>>;

/** Totali per /savings, la home e il report mensile. */
export async function savedSoFar(organizationId: string) {
  const rows = await db.savingAction.findMany({ where: { organizationId }, orderBy: { acceptedAt: "desc" }, take: 1000 });
  const now = Date.now();
  const verified = rows.filter((r) => r.status === "verified");
  const done = rows.filter((r) => r.status === "done");
  const accepted = rows.filter((r) => r.status === "accepted");
  const verifiedMonthly = verified.reduce((t, r) => t + (r.verifiedMonthlyEur ?? r.expectedMonthlyEur), 0);
  const doneMonthly = done.reduce((t, r) => t + r.expectedMonthlyEur, 0);
  const acceptedMonthly = accepted.reduce((t, r) => t + r.expectedMonthlyEur, 0);
  const notConfirmed = done.filter((r) => r.doneAt && now - r.doneAt.getTime() > VERIFY_AFTER_DAYS * DAY);
  return {
    rows,
    verifiedMonthly,
    doneMonthly,
    acceptedMonthly,
    /** Verificato + fatto (ancora da confermare sugli addebiti). */
    savedMonthly: verifiedMonthly + doneMonthly,
    counts: { verified: verified.length, done: done.length, accepted: accepted.length },
    notConfirmedIds: new Set(notConfirmed.map((r) => r.id)),
  };
}

export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type Charge = { id: string; date: Date; amountEur: number };
type Pending = { id: string; doneAt: Date; expectedMonthlyEur: number };
export type Verdict = { id: string; verifiedMonthlyEur: number } | { id: string; notConfirmed: true };

/**
 * Logica pura della verifica, per un'AI: per ogni azione "done" si cerca il
 * primo addebito almeno un giorno dopo doneAt e la mediana dei 3 addebiti
 * precedenti. Più azioni che puntano allo stesso addebito (es. 3 posti tolti
 * lo stesso mese) si dividono il calo in proporzione al risparmio atteso.
 * Nessun addebito da 40 giorni dopo l'ultimo (e da 35 dopo il cambio) = pagamento
 * cessato → risparmio pari alla mediana. Dopo 45 giorni senza calo: "non confermato".
 */
export function verifyAsset(charges: Charge[], actions: Pending[], now = Date.now()): Verdict[] {
  const sorted = [...charges].sort((a, b) => a.date.getTime() - b.date.getTime());
  const out: Verdict[] = [];
  const byCharge = new Map<string, { action: Pending; before: number; after: number }[]>();
  for (const a of actions) {
    const cut = a.doneAt.getTime();
    const before = sorted.filter((c) => c.date.getTime() <= cut).slice(-3);
    const next = sorted.find((c) => c.date.getTime() >= cut + DAY);
    // Mediana dei 3 precedenti, ma mai sopra l'ultimo addebito: un calo già avvenuto prima non conta.
    const base = before.length ? Math.min(median(before.map((c) => c.amountEur)), before[before.length - 1].amountEur) : 0;
    if (!before.length) {
      if (now - cut > VERIFY_AFTER_DAYS * DAY) out.push({ id: a.id, notConfirmed: true });
      continue;
    }
    if (!next) {
      const last = before[before.length - 1].date.getTime();
      if (now - last > 40 * DAY && now - cut > 35 * DAY) out.push({ id: a.id, verifiedMonthlyEur: round2(base) });
      else if (now - cut > VERIFY_AFTER_DAYS * DAY) out.push({ id: a.id, notConfirmed: true });
      continue;
    }
    if (next.amountEur < base - Math.max(0.5, base * 0.01)) {
      byCharge.set(next.id, [...(byCharge.get(next.id) ?? []), { action: a, before: base, after: next.amountEur }]);
    } else if (now - cut > VERIFY_AFTER_DAYS * DAY) out.push({ id: a.id, notConfirmed: true });
  }
  for (const group of byCharge.values()) {
    const drop = Math.max(...group.map((g) => g.before - g.after));
    const expected = group.reduce((t, g) => t + Math.max(0, g.action.expectedMonthlyEur), 0);
    for (const g of group) {
      const share = expected > 0 ? Math.max(0, g.action.expectedMonthlyEur) / expected : 1 / group.length;
      out.push({ id: g.action.id, verifiedMonthlyEur: round2(drop * share) });
    }
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Lavoro giornaliero: verifica sugli addebiti reali le azioni fatte. */
export async function verifySavingActions(organizationId: string, now = new Date()) {
  const pending = await db.savingAction.findMany({ where: { organizationId, status: "done", doneAt: { not: null }, assetId: { not: null } } });
  const byAsset = new Map<string, typeof pending>();
  for (const p of pending) byAsset.set(p.assetId!, [...(byAsset.get(p.assetId!) ?? []), p]);
  let verified = 0;
  for (const [assetId, actions] of byAsset) {
    const charges = await db.spendRecord.findMany({ where: { organizationId, aiAssetId: assetId }, select: { id: true, date: true, amountEur: true }, orderBy: { date: "desc" }, take: 60 });
    const verdicts = verifyAsset(charges, actions.map((a) => ({ id: a.id, doneAt: a.doneAt!, expectedMonthlyEur: a.expectedMonthlyEur })), now.getTime());
    for (const v of verdicts) {
      const a = actions.find((x) => x.id === v.id)!;
      if ("verifiedMonthlyEur" in v) {
        await db.savingAction.updateMany({ where: { id: v.id, organizationId, status: "done" }, data: { status: "verified", verifiedAt: now, verifiedMonthlyEur: v.verifiedMonthlyEur } });
        verified++;
        (await import("@/lib/webhooks")).emitWebhook(organizationId, "savings.verified", { id: a.id, title: a.title, assetId, expectedMonthlyEur: a.expectedMonthlyEur, verifiedMonthlyEur: v.verifiedMonthlyEur, verifiedAt: now.toISOString() });
      } else {
        await createAlert(organizationId, {
          kind: "info",
          severity: "info",
          title: `Saving not confirmed yet: ${a.title}`,
          body: `Marked done ${VERIFY_AFTER_DAYS}+ days ago, but the charges haven't dropped. Check the provider's billing — the change may not have been applied (${fmtEur(a.expectedMonthlyEur)}/month expected).`,
          href: "/savings?view=progress",
          dedupeKey: `saving-unconfirmed:${a.id}`,
        });
      }
    }
  }
  return verified;
}

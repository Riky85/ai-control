"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canonicalSavingKey, computeSavings, savingKeyFilters } from "@/lib/savings";
import { ledgerKindOf, ledgerAssetOf } from "@/lib/savings-ledger";
import { loadOpportunities } from "@/lib/opportunities";
import { canMove, isStatus } from "@/lib/opportunities/status";
import type { Status } from "@/lib/opportunities/types";

const safeBack = (v: FormDataEntryValue | null) => {
  const b = String(v ?? "").slice(0, 300);
  // Anche la home ("/"): l'interruttore di "What to do next" torna lì.
  return b.startsWith("/opportunities") || b === "/" || b.startsWith("/?") ? b : "/opportunities";
};
/** Stesso percorso con un parametro in più o in meno (il cassetto dei dettagli si chiude dopo l'azione). */
function edit(path: string, set: Record<string, string | null>) {
  const u = new URL(path, "http://x");
  for (const [k, v] of Object.entries(set)) (v == null ? u.searchParams.delete(k) : u.searchParams.set(k, v));
  const q = u.searchParams.toString();
  return `${u.pathname}${q ? `?${q}` : ""}`;
}

/**
 * Cambia lo stato di un'opportunità. Titolo e importi si ricalcolano qui, mai dal form.
 * Opportunità del motore dei risparmi → registro dei risparmi (SavingAction / SavingDismissal);
 * tutte le altre → OpportunityState.
 */
export async function setOpportunityStatusAction(formData: FormData) {
  const back = safeBack(formData.get("back"));
  const s = await requireRole("EDITOR", back);
  const key = String(formData.get("key") ?? "").slice(0, 500);
  const to = String(formData.get("to") ?? "");
  if (!key || !isStatus(to)) redirect(back);
  const r = await applyStatus(s, key, to as Status);
  if (r === "missing") redirect(edit(back, { open: null, error: "That opportunity isn't there any more — it may have changed with new data." }));
  if (r === "invalid") redirect(back);
  revalidatePath("/", "layout");
  redirect(edit(back, { open: null, error: null }));
}

/**
 * Porta un'opportunità ad "Accepted" o "In progress" senza redirect (usata da "Act" in act.ts).
 * È un'azione server pubblica: controlla da sé ruolo e azienda, e accetta solo questi due stati.
 * Esito: "ok", "unchanged" (già lì o passaggio non previsto) o "missing".
 */
export async function markOpportunityStatus(key: string, to: "accepted" | "in_progress"): Promise<"ok" | "unchanged" | "missing"> {
  const s = await requireRole("EDITOR", "/opportunities");
  const k = String(key ?? "").slice(0, 500);
  if (!k || (to !== "accepted" && to !== "in_progress")) return "unchanged";
  const r = await applyStatus(s, k, to);
  if (r === "ok") revalidatePath("/", "layout");
  return r === "invalid" ? "unchanged" : r;
}

/** Cambio di stato vero e proprio (non esportato: in un file "use server" ogni export è un endpoint). */
async function applyStatus(s: { orgId: string; email: string }, key: string, to: Status): Promise<"ok" | "invalid" | "missing"> {
  const { list } = await loadOpportunities(s.orgId);
  const o = list.find((x) => x.key === key);
  if (!o) return "missing";
  if (o.status === to || !canMove(o.status, to as never)) return "invalid";

  if (o!.ledger === "savings") {
    // Stessa chiave nelle forme vecchie (doppioni "dup:<categoria>:…"): vanno trattate insieme.
    const keyOr = savingKeyFilters(key);
    if (to === "dismissed") {
      await db.savingDismissal.upsert({ where: { organizationId_key: { organizationId: s.orgId, key } }, update: {}, create: { organizationId: s.orgId, key } });
    } else if (to === "new") {
      // Riapre: toglie il "not for us" e annulla accettazione o "fatto", così il suggerimento torna nell'elenco.
      // Le righe verificate restano (storia di "Saved so far"): si staccano dalla chiave, così non nascondono
      // più il suggerimento, che torna come elemento nuovo; savedSoFar conta anche le righe senza chiave.
      const ck = canonicalSavingKey(key);
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`saving:${s.orgId}:${ck}`}::text))`;
        await tx.savingDismissal.deleteMany({ where: { organizationId: s.orgId, OR: keyOr.map((k) => ({ key: k })) } });
        await tx.savingAction.deleteMany({ where: { organizationId: s.orgId, OR: keyOr.map((k) => ({ savingKey: k })), status: { in: ["accepted", "done"] } } });
        await tx.savingAction.updateMany({
          where: { organizationId: s.orgId, OR: keyOr.map((k) => ({ savingKey: k })), status: "verified" },
          data: { savingKey: null, note: `Reopened on ${new Date().toISOString().slice(0, 10)} (was ${ck.slice(0, 150)}). Realised saving kept in history.` },
        });
      });
    } else {
      const done = to === "done";
      const { items, inProgress } = await computeSavings(s.orgId);
      const item = items.find((i) => i.key === key) ?? inProgress.find((i) => i.key === key);
      // Doppio invio (due clic, due schede): lock su azienda + chiave e controllo dentro la transazione.
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`saving:${s.orgId}:${canonicalSavingKey(key)}`}::text))`;
        const existing = await tx.savingAction.findFirst({ where: { organizationId: s.orgId, OR: keyOr.map((k) => ({ savingKey: k })), status: { not: "failed" } }, orderBy: { acceptedAt: "desc" } });
        if (existing && done && existing.status === "accepted") {
          await tx.savingAction.update({ where: { id: existing.id }, data: { status: "done", doneAt: new Date() } });
        } else if (!existing && item) {
          const now = new Date();
          await tx.savingAction.create({
            data: {
              organizationId: s.orgId,
              assetId: ledgerAssetOf(item),
              kind: ledgerKindOf(item.kind),
              title: item.title.slice(0, 200),
              expectedMonthlyEur: Math.round(item.monthlyEur * 100) / 100,
              status: done ? "done" : "accepted",
              savingKey: key,
              acceptedAt: now,
              doneAt: done ? now : null,
              createdBy: s.email,
            },
          });
        }
      });
    }
  } else if (to === "new") {
    // Riapre: senza riga di stato l'opportunità torna "new".
    await db.opportunityState.deleteMany({ where: { organizationId: s.orgId, key } });
  } else {
    await db.opportunityState.upsert({
      where: { organizationId_key: { organizationId: s.orgId, key } },
      update: { status: to, title: o!.title.slice(0, 200), updatedBy: s.email },
      create: { organizationId: s.orgId, key, status: to, title: o!.title.slice(0, 200), updatedBy: s.email },
    });
  }
  await audit(`opportunity.${to}`, o!.title, { key, category: o!.category });
  return "ok";
}

/** "Show hidden": riapre tutte le opportunità nascoste (risparmi e altre). */
export async function restoreOpportunitiesAction() {
  const s = await requireRole("EDITOR", "/opportunities");
  await db.savingDismissal.deleteMany({ where: { organizationId: s.orgId } });
  await db.opportunityState.deleteMany({ where: { organizationId: s.orgId, status: "dismissed" } }).catch(() => null);
  await audit("opportunity.restore", "hidden opportunities");
  revalidatePath("/", "layout");
  redirect("/opportunities");
}

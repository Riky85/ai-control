/**
 * Savings Autopilot (angar Engine): ogni suggerimento di risparmio diventa un
 * piano eseguibile. angar fa da sé i passi sicuri (domande alle persone,
 * promemoria, avvisi, verifica sugli addebiti), toglie i posti via API solo
 * con un'approvazione, e lascia alle persone i passi che solo loro possono
 * fare (con il link giusto). Il risultato si prova sulle bollette successive
 * tramite il registro dei risparmi (savings-ledger.ts).
 *
 * Regole di sicurezza:
 * - niente viene eseguito senza approvazione (umana, o automatica in modalità "auto");
 * - in "auto" si approvano da soli solo i piani i cui passi automatici sono
 *   avvisi/promemoria/domande, e solo per le leve sicure (seats, annual, idle, duplicate);
 * - togliere posti via API resta irreversibile: serve un'approvazione umana,
 *   a meno che l'azienda abbia già scelto la rimozione automatica (autoRemoveSeats);
 * - tutte le protezioni esistenti (privacy per persona, collegamenti attivi) restano valide;
 * - ogni esecuzione è idempotente: rilanciarla non ripete gli effetti.
 */
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createAlert, postToChat } from "@/lib/alerts";
import { fmtDate, fmtEur } from "@/lib/format";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";
import { MANAGE_URL } from "@/lib/pricing/catalog";
import { computeSavingsCached, serviceOf, type Saving } from "@/lib/savings";
import { ledgerKindOf, ledgerAssetOf } from "@/lib/savings-ledger";
import { supportOf, type SeatRemovalSupport } from "@/lib/seat-removal";
import type { AutopilotTask, ConnectorProvider, Prisma } from "@prisma/client";

const DAY = 86400000;
/** Soglia minima: sotto i 5 € al mese non vale un piano. */
export const MIN_MONTHLY_EUR = 5;
/** Chi approva in modalità "auto". */
export const AUTO_ACTOR = "angar (automatic)";
/** Promemoria per la fatturazione annuale: quanti giorni prima del rinnovo. */
const REMIND_BEFORE_DAYS = 14;

export type AutopilotMode = "off" | "approve" | "auto";
export type TaskStatus = "proposed" | "approved" | "running" | "done" | "failed" | "dismissed";
export type StepId = "ask" | "remove" | "unassigned" | "remind" | "switch" | "notify" | "cancel" | "downgrade" | "route" | "migrate" | "verify";

export interface AutopilotStep {
  /** Codice del passo (per eseguirlo e per unire i piani ricalcolati). */
  id: StepId;
  label: string;
  /** true = lo fa angar; false = lo fa una persona (con href). */
  auto: boolean;
  done: boolean;
  at?: string;
  detail?: string;
  href?: string;
  /** AI a cui si riferisce il passo. */
  ref?: string;
  /** Solo "verify": risparmio confermato sugli addebiti. */
  eur?: number;
}

export const modeOf = (v: string | null | undefined): AutopilotMode => (v === "off" || v === "auto" ? v : "approve");
export const isMode = (v: unknown): v is AutopilotMode => v === "off" || v === "approve" || v === "auto";

// ── Piani ─────────────────────────────────────────────────────────────────

export interface PlanContext {
  /** Privacy "per persona": si possono fare domande alle singole persone. */
  people: boolean;
  /** Come si tolgono i posti, AI per AI. */
  support: Record<string, SeatRemovalSupport>;
  /** Posti pagati senza nessuna persona nota, AI per AI. */
  unassigned: Record<string, number>;
  /** Prossimo rinnovo noto (ISO), AI per AI. */
  renewals: Record<string, string>;
}

type PlanSaving = Pick<Saving, "key" | "kind" | "title" | "assets">;
type AssetRef = Saving["assets"][number];

/** Pagina di fatturazione del fornitore, altrimenti la scheda dell'AI in angar. */
export const billingUrl = (a: Pick<AssetRef, "id" | "serviceId">) => (a.serviceId && MANAGE_URL[a.serviceId]) || `/assets/${a.id}`;

const verifyStep = (s: PlanSaving): AutopilotStep => ({ id: "verify", label: "Verify on the next bills", auto: true, done: false, ref: ledgerAssetOf(s) ?? undefined });

/** Il piano di un suggerimento: passi in ordine, chi li fa, dove. */
export function planFor(saving: PlanSaving, ctx: PlanContext): AutopilotStep[] {
  const a = saving.assets[0];
  if (!a) return [verifyStep(saving)];
  const steps: AutopilotStep[] = [];
  switch (saving.kind) {
    case "seats": {
      if (ctx.people) {
        steps.push({ id: "ask", label: "Ask inactive people if they still need it", auto: true, done: false, ref: a.id, href: "/usage?view=cleanup" });
        const sup = ctx.support[a.id];
        if (sup?.mode === "api") steps.push({ id: "remove", label: `Remove released seats via ${sup.label}`, auto: true, done: false, ref: a.id });
        else steps.push({ id: "remove", label: `Remove released seats in ${a.name}`, auto: false, done: false, ref: a.id, href: "/usage?view=cleanup" });
      }
      const free = ctx.unassigned[a.id] ?? 0;
      if (free > 0 || !ctx.people) {
        steps.push({
          id: "unassigned",
          label: free > 0 && ctx.people ? `Cancel ${free} unassigned seat${free === 1 ? "" : "s"}` : `Remove unused ${a.name} seats`,
          auto: false,
          done: false,
          ref: a.id,
          href: billingUrl(a),
        });
      }
      break;
    }
    case "annual": {
      const when = ctx.renewals[a.id];
      steps.push({ id: "remind", label: "Reminder before the renewal", auto: true, done: false, ref: a.id, detail: when ? `Renews ${fmtDate(when)}` : undefined });
      steps.push({ id: "switch", label: `Switch ${a.name} to yearly billing`, auto: false, done: false, ref: a.id, href: billingUrl(a) });
      break;
    }
    case "duplicate": {
      steps.push({ id: "notify", label: `Tell the team to standardise on ${a.name}`, auto: true, done: false, ref: a.id });
      for (const d of saving.assets.slice(1)) steps.push({ id: "cancel", label: `Cancel ${d.name}`, auto: false, done: false, ref: d.id, href: billingUrl(d) });
      break;
    }
    case "premium":
      steps.push({ id: "downgrade", label: "Move light users to the standard plan", auto: false, done: false, ref: a.id, href: billingUrl(a) });
      break;
    case "model":
      steps.push({ id: "route", label: "Route simple requests to the cheaper model", auto: false, done: false, ref: a.id, href: `/assets/${a.id}`, detail: "Test on real prompts first" });
      break;
    case "idle":
      steps.push({ id: "notify", label: `Ask the team if anyone still uses ${a.name}`, auto: true, done: false, ref: a.id });
      steps.push({ id: "cancel", label: `Cancel ${a.name}`, auto: false, done: false, ref: a.id, href: billingUrl(a) });
      break;
    case "alternative":
      steps.push({ id: "migrate", label: "Test it on real work, then switch", auto: false, done: false, ref: a.id, href: `/assets/${a.id}` });
      break;
  }
  steps.push(verifyStep(saving));
  return steps;
}

/** Piano ricalcolato: conserva lo stato dei passi già fatti (stesso codice e stessa AI). */
export function mergeSteps(prev: AutopilotStep[], next: AutopilotStep[]): AutopilotStep[] {
  return next.map((s) => {
    const old = prev.find((p) => p.id === s.id && (p.ref ?? "") === (s.ref ?? ""));
    return old?.done ? { ...s, done: true, at: old.at, detail: old.detail ?? s.detail, eur: old.eur } : s;
  });
}

/** Leve abbastanza sicure da approvare da sole in modalità "auto". */
const AUTO_KINDS = new Set(["seats", "annual", "idle", "duplicate"]);

/**
 * In "auto" un piano si approva da solo se i suoi passi automatici sono solo
 * domande, promemoria, avvisi o verifiche. Togliere posti via API no, a meno
 * che l'azienda abbia già scelto la rimozione automatica.
 */
export function safeToAutoApprove(task: { kind: string; steps: AutopilotStep[] }, org: { autoRemoveSeats: boolean }): boolean {
  if (!AUTO_KINDS.has(task.kind)) return false;
  return task.steps.every((s) => !s.auto || s.id !== "remove" || org.autoRemoveSeats);
}

/** Un piano approvato in automatico che deve togliere posti, senza il consenso dell'azienda: serve una persona. */
export function needsHumanApproval(task: { status: string; approvedBy: string | null; steps: AutopilotStep[] }, org: { autoRemoveSeats: boolean }): boolean {
  if (task.status === "proposed") return true;
  if (task.status !== "approved" && task.status !== "running") return false;
  return task.approvedBy === AUTO_ACTOR && !org.autoRemoveSeats && task.steps.some((s) => s.auto && s.id === "remove" && !s.done);
}

type TaskLite = { id: string; savingKey: string; status: string; steps: AutopilotStep[] };

/**
 * Logica pura della sincronizzazione: nuovi piani per i suggerimenti nuovi,
 * piani "proposed" aggiornati, "proposed" spariti → "dismissed" (solo se
 * nessun passo è già fatto). Mai toccati gli altri stati: un "dismissed" non torna.
 */
export function diffSync(items: (PlanSaving & { monthlyEur: number })[], tasks: TaskLite[], ctx: PlanContext) {
  const byKey = new Map(tasks.map((t) => [t.savingKey, t]));
  const current = items.filter((i) => i.monthlyEur >= MIN_MONTHLY_EUR);
  const keys = new Set(current.map((i) => i.key));
  const create: { item: PlanSaving & { monthlyEur: number }; steps: AutopilotStep[] }[] = [];
  const update: { id: string; item: PlanSaving & { monthlyEur: number }; steps: AutopilotStep[] }[] = [];
  for (const item of current) {
    const t = byKey.get(item.key);
    const plan = planFor(item, ctx);
    if (!t) create.push({ item, steps: plan });
    else if (t.status === "proposed") update.push({ id: t.id, item, steps: mergeSteps(t.steps, plan) });
  }
  const dismiss = tasks.filter((t) => t.status === "proposed" && !keys.has(t.savingKey) && !t.steps.some((s) => s.done)).map((t) => t.id);
  return { create, update, dismiss };
}

// ── Contesto dal database ──────────────────────────────────────────────────

type SavingsAssets = Awaited<ReturnType<typeof computeSavingsCached>>["assets"];

async function planContext(organizationId: string, assets: SavingsAssets): Promise<PlanContext> {
  const [mode, connectors] = await Promise.all([
    orgPrivacyMode(organizationId),
    db.connector.findMany({
      where: { organizationId, provider: { in: ["MICROSOFT_365", "GOOGLE_WORKSPACE", "OPENAI", "ANTHROPIC"] }, credentialsEncrypted: { not: null } },
      select: { provider: true },
    }),
  ]);
  const connected = new Set<ConnectorProvider>(connectors.map((c) => c.provider));
  const { upcomingRenewals } = await import("@/lib/renewals");
  const renewals = await upcomingRenewals(organizationId, 400);
  const ctx: PlanContext = { people: showsPeople(mode), support: {}, unassigned: {}, renewals: {} };
  for (const a of assets) {
    ctx.support[a.id] = supportOf({ serviceId: serviceOf(a), name: a.name, vendor: a.vendor, connector: a.connector }, connected);
    const seats = a.cost?.seats ?? 0;
    if (seats > a.usages.length) ctx.unassigned[a.id] = seats - a.usages.length;
  }
  for (const r of renewals) if (!ctx.renewals[r.assetId]) ctx.renewals[r.assetId] = r.date.toISOString();
  return ctx;
}

const stepsOf = (v: Prisma.JsonValue): AutopilotStep[] => (Array.isArray(v) ? (v as unknown as AutopilotStep[]) : []);
const json = (steps: AutopilotStep[]) => steps as unknown as Prisma.InputJsonValue;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Sincronizzazione ───────────────────────────────────────────────────────

/** Un piano "proposed" per ogni suggerimento attuale (≥ 5 € al mese). */
export async function syncAutopilot(organizationId: string) {
  const { items, assets } = await computeSavingsCached(organizationId);
  const [ctx, rows] = await Promise.all([planContext(organizationId, assets), db.autopilotTask.findMany({ where: { organizationId } })]);
  const diff = diffSync(items, rows.map((r) => ({ id: r.id, savingKey: r.savingKey, status: r.status, steps: stepsOf(r.steps) })), ctx);
  let created = 0;
  for (const c of diff.create) {
    const ok = await db.autopilotTask
      .create({ data: { organizationId, savingKey: c.item.key, kind: c.item.kind, title: c.item.title.slice(0, 200), expectedMonthlyEur: round2(c.item.monthlyEur), steps: json(c.steps) } })
      .then(() => true)
      .catch(() => false); // creato nel frattempo (vincolo unico)
    if (ok) created++;
  }
  for (const u of diff.update) {
    await db.autopilotTask.updateMany({
      where: { id: u.id, organizationId, status: "proposed" },
      data: { title: u.item.title.slice(0, 200), expectedMonthlyEur: round2(u.item.monthlyEur), steps: json(u.steps) },
    });
  }
  if (diff.dismiss.length) {
    await db.autopilotTask.updateMany({ where: { id: { in: diff.dismiss }, organizationId, status: "proposed" }, data: { status: "dismissed", result: "The saving isn't there any more" } });
  }
  return { created, updated: diff.update.length, dismissed: diff.dismiss.length };
}

// ── Registro dei risparmi ──────────────────────────────────────────────────

type TaskRow = AutopilotTask;

/** Riga "accepted" nel registro, così la verifica sugli addebiti funziona. Idempotente. */
async function ensureLedgerRow(task: TaskRow, by: string) {
  const existing = await db.savingAction.findFirst({ where: { organizationId: task.organizationId, savingKey: task.savingKey, status: { not: "failed" } } });
  if (existing) return existing;
  const verify = stepsOf(task.steps).find((s) => s.id === "verify");
  return db.savingAction.create({
    data: {
      organizationId: task.organizationId,
      assetId: verify?.ref ?? null,
      kind: ledgerKindOf(task.kind as Saving["kind"]),
      title: task.title.slice(0, 200),
      expectedMonthlyEur: round2(task.expectedMonthlyEur),
      status: "accepted",
      savingKey: task.savingKey,
      acceptedAt: new Date(),
      createdBy: by,
      note: "Approved in Autopilot",
    },
  });
}

/** Posti tolti (una riga del registro ciascuno) dopo l'approvazione. */
const seatRowsSince = (task: TaskRow, assetId: string) =>
  db.savingAction.findMany({ where: { organizationId: task.organizationId, assetId, kind: "seat_removed", seatReminderId: { not: null }, doneAt: { gte: task.approvedAt ?? task.createdAt } } });

/** A che punto è la verifica sulle bollette. */
async function verificationOf(task: TaskRow): Promise<{ state: "pending" | "verified" | "failed"; eur: number }> {
  const assetId = stepsOf(task.steps).find((s) => s.id === "remove" || s.id === "ask")?.ref;
  if (task.kind === "seats" && assetId) {
    const seats = await seatRowsSince(task, assetId);
    if (seats.length) {
      const eur = seats.reduce((t, r) => t + (r.status === "verified" ? r.verifiedMonthlyEur ?? r.expectedMonthlyEur : 0), 0);
      return { state: seats.every((r) => r.status === "verified") ? "verified" : "pending", eur: round2(eur) };
    }
  }
  const row = await db.savingAction.findFirst({ where: { organizationId: task.organizationId, savingKey: task.savingKey }, orderBy: { acceptedAt: "desc" } });
  if (!row) return { state: "pending", eur: 0 };
  if (row.status === "verified") return { state: "verified", eur: round2(row.verifiedMonthlyEur ?? row.expectedMonthlyEur) };
  if (row.status === "failed") return { state: "failed", eur: 0 };
  return { state: "pending", eur: 0 };
}

/** Tutti i passi (tranne la verifica) sono fatti: il registro passa a "done". */
async function closeLedger(task: TaskRow, removedSeats: number, nothingToRemove: boolean) {
  const row = await db.savingAction.findFirst({ where: { organizationId: task.organizationId, savingKey: task.savingKey, status: { not: "failed" } } });
  if (task.kind === "seats" && removedSeats > 0) {
    // Ogni posto tolto ha già la sua riga "done": quella complessiva si toglie per non contare due volte.
    if (row?.status === "accepted") await db.savingAction.delete({ where: { id: row.id } });
    return;
  }
  if (task.kind === "seats" && nothingToRemove) {
    if (row?.status === "accepted") await db.savingAction.update({ where: { id: row.id }, data: { status: "failed", note: "Everyone still needs their seat" } });
    return;
  }
  if (row?.status === "accepted") await db.savingAction.update({ where: { id: row.id }, data: { status: "done", doneAt: new Date() } });
  else if (!row) {
    const verify = stepsOf(task.steps).find((s) => s.id === "verify");
    await db.savingAction.create({
      data: {
        organizationId: task.organizationId,
        assetId: verify?.ref ?? null,
        kind: ledgerKindOf(task.kind as Saving["kind"]),
        title: task.title.slice(0, 200),
        expectedMonthlyEur: round2(task.expectedMonthlyEur),
        status: "done",
        savingKey: task.savingKey,
        doneAt: new Date(),
        createdBy: task.approvedBy ?? AUTO_ACTOR,
        note: "Done in Autopilot",
      },
    });
  }
}

// ── Posti: stato delle domande ─────────────────────────────────────────────

async function seatState(organizationId: string, assetId: string) {
  const rows = await db.seatReminder.findMany({ where: { organizationId, aiAssetId: assetId, removedAt: null } });
  const cutoff = Date.now() - 7 * DAY;
  const due = rows.filter((r) => r.response === "release" || (r.response == null && r.sentAt.getTime() < cutoff));
  const waiting = rows.filter((r) => r.response == null && r.sentAt.getTime() >= cutoff);
  return { due, waiting };
}

// ── Esecuzione ─────────────────────────────────────────────────────────────

type Outcome = { state: "done"; detail?: string } | { state: "wait"; detail?: string } | { state: "hold"; detail: string } | { state: "fail"; error: string };

async function runStep(task: TaskRow, step: AutopilotStep, org: { autoRemoveSeats: boolean; name: string }, actor: string): Promise<Outcome> {
  const orgId = task.organizationId;
  switch (step.id) {
    case "ask": {
      if (!showsPeople(await orgPrivacyMode(orgId))) return { state: "fail", error: "Seat questions need the per-person employee privacy (Settings → Employee privacy)." };
      const { sendSeatReminders } = await import("@/lib/seats");
      // Le risposte vanno a una persona: chi ha approvato, altrimenti un owner del workspace.
      const owner = task.approvedBy && task.approvedBy !== AUTO_ACTOR ? null : await db.workspaceMember.findFirst({ where: { organizationId: orgId, role: "OWNER", status: "active" }, select: { email: true } });
      const r = await sendSeatReminders(orgId, step.ref!, owner?.email ?? (task.approvedBy && task.approvedBy !== AUTO_ACTOR ? task.approvedBy : actor));
      if (r.sent > 0) return { state: "done", detail: `${r.sent} ${r.sent === 1 ? "person" : "people"} asked` };
      if (r.asked > 0 && /email isn't configured/i.test(r.reason ?? "")) return { state: "fail", error: r.reason! };
      if (/privacy/i.test(r.reason ?? "")) return { state: "fail", error: r.reason! };
      return { state: "done", detail: r.reason?.replace(/\.$/, "") };
    }
    case "remove": {
      // Irreversibile: serve un'approvazione umana, o la rimozione automatica scelta dall'azienda.
      if (step.auto && task.approvedBy === AUTO_ACTOR && !org.autoRemoveSeats) return { state: "hold", detail: "Needs your approval" };
      const { due, waiting } = await seatState(orgId, step.ref!);
      if (step.auto) {
        const { removeSeatNow } = await import("@/lib/seat-removal");
        for (const r of due) {
          const res = await removeSeatNow(orgId, step.ref!, r.email, task.approvedBy ?? actor);
          if (!res.ok) return { state: "fail", error: res.message };
        }
      } else if (due.length) {
        return { state: "wait", detail: `${due.length} to remove` };
      }
      if (waiting.length) return { state: "wait", detail: `Waiting for ${waiting.length} answer${waiting.length === 1 ? "" : "s"}` };
      const removed = await seatRowsSince(task, step.ref!);
      return { state: "done", detail: removed.length ? `${removed.length} seat${removed.length === 1 ? "" : "s"} removed` : "Everyone still needs it" };
    }
    case "remind": {
      const { upcomingRenewals } = await import("@/lib/renewals");
      const next = (await upcomingRenewals(orgId, 400)).find((r) => r.assetId === step.ref);
      if (next && next.date.getTime() - Date.now() > REMIND_BEFORE_DAYS * DAY) {
        return { state: "wait", detail: `Reminder on ${fmtDate(next.date.getTime() - REMIND_BEFORE_DAYS * DAY)}` };
      }
      await createAlert(orgId, {
        kind: "autopilot",
        severity: "warning",
        title: next ? `Switch to yearly billing before ${fmtDate(next.date)}` : "Switch to yearly billing",
        body: `${task.title}. Saves ${fmtEur(task.expectedMonthlyEur)} a month.`,
        href: `/assets/${step.ref}`,
        dedupeKey: `autopilot-remind:${task.id}`,
      });
      return { state: "done", detail: next ? `Renews ${fmtDate(next.date)}` : "Reminder sent" };
    }
    case "notify": {
      const text = task.kind === "idle" ? `Does anyone still use ${task.title.replace(/^Nobody seems to use /, "")}? If not, it will be cancelled.` : `${task.title}: ${step.label.replace(/^Tell the team to /, "")}.`;
      await createAlert(orgId, { kind: "autopilot", severity: "info", title: step.label, body: text, href: "/opportunities?view=autopilot", dedupeKey: `autopilot-notify:${task.id}:${step.ref ?? ""}` });
      const chat = await postToChat(orgId, `*${org.name}* · ${text}`).catch(() => false);
      return { state: "done", detail: chat ? "Posted to the team channel" : "Added to alerts" };
    }
    case "verify": {
      const v = await verificationOf(task);
      if (v.state === "verified") return { state: "done", detail: `${fmtEur(v.eur)} a month confirmed` };
      if (v.state === "failed") return { state: "fail", error: "The saving wasn't confirmed on the bills" };
      return { state: "wait", detail: "Checking the next bills" };
    }
    default:
      return { state: "wait" }; // passi fatti da una persona
  }
}

export type RunResult = { status: TaskStatus; result: string | null; changed: boolean };

/**
 * Esegue i passi automatici di un piano approvato, in ordine: si ferma al
 * primo passo automatico che aspetta. I passi delle persone non bloccano i
 * successivi, ma la verifica parte solo quando tutto il resto è fatto.
 * Idempotente e protetto dalle esecuzioni concorrenti (updatedAt).
 */
export async function runTask(organizationId: string, taskId: string, actor = AUTO_ACTOR): Promise<RunResult | null> {
  const task = await db.autopilotTask.findFirst({ where: { id: taskId, organizationId } });
  if (!task) return null;
  const steps = stepsOf(task.steps).map((s) => ({ ...s }));
  const verify = steps.find((s) => s.id === "verify");
  if (!["approved", "running", "done"].includes(task.status) || (task.status === "done" && (!verify || verify.done))) {
    return { status: task.status as TaskStatus, result: task.result, changed: false };
  }
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { autoRemoveSeats: true, name: true } });
  if (!org) return null;

  const now = new Date().toISOString();
  let status: TaskStatus = task.status === "done" ? "done" : "running";
  let result = task.result;
  let error: string | null = null;
  let changed = false;

  if (status !== "done") {
    for (const s of steps) {
      if (s.done || s.id === "verify") continue;
      // Passo della persona: non si esegue; "Remove" a mano si riconosce dalla pulizia posti.
      if (!s.auto && s.id !== "remove") continue;
      const out = await runStep(task, s, org, actor);
      if (out.state === "done") {
        Object.assign(s, { done: true, at: now, detail: out.detail ?? s.detail });
        changed = true;
        await audit("autopilot.step", s.label, { taskId: task.id, detail: out.detail ?? null }, { orgId: organizationId, actorEmail: actor });
        continue;
      }
      if (out.state === "fail") {
        error = out.error;
        s.detail = out.error.slice(0, 200);
        changed = true;
        break;
      }
      if (s.detail !== out.detail) {
        s.detail = out.detail;
        changed = true;
      }
      if (s.auto) break; // i passi automatici vanno in ordine
    }

    const rest = steps.filter((s) => s.id !== "verify");
    if (!error && rest.every((s) => s.done)) {
      const removeStep = steps.find((s) => s.id === "remove");
      const removed = task.kind === "seats" && removeStep?.ref ? (await seatRowsSince(task, removeStep.ref)).length : 0;
      const nothing = task.kind === "seats" && removed === 0 && steps.every((s) => s.id !== "unassigned") && removeStep?.detail === "Everyone still needs it";
      await closeLedger(task, removed, nothing);
      status = "done";
      result = nothing ? "Everyone still needs their seat" : removed ? `${removed} seat${removed === 1 ? "" : "s"} removed · checking the next bills` : "Done · checking the next bills";
      changed = true;
      await audit("autopilot.done", task.title, { taskId: task.id, expectedMonthlyEur: task.expectedMonthlyEur }, { orgId: organizationId, actorEmail: actor });
      await createAlert(organizationId, {
        kind: "autopilot",
        severity: "info",
        title: `Done: ${task.title}`,
        body: nothing ? "Everyone still needs their seat. Nothing to remove." : `angar checks the next bills to confirm ${fmtEur(task.expectedMonthlyEur)} a month.`,
        href: "/opportunities?view=autopilot",
        dedupeKey: `autopilot-done:${task.id}`,
      });
      if (nothing && verify) Object.assign(verify, { done: true, at: now, detail: "Nothing to verify" });
    }
  }

  // Verifica sulle bollette (anche per i piani già fatti).
  if (!error && status === "done" && verify && !verify.done) {
    const out = await runStep(task, verify, org, actor);
    if (out.state === "done") {
      const v = await verificationOf(task);
      Object.assign(verify, { done: true, at: now, detail: out.detail, eur: v.eur });
      result = `${fmtEur(v.eur)} a month confirmed on the bills`;
      changed = true;
      await audit("autopilot.verified", task.title, { taskId: task.id, verifiedMonthlyEur: v.eur }, { orgId: organizationId, actorEmail: actor });
      await createAlert(organizationId, { kind: "autopilot", severity: "info", title: `Confirmed on the bills: ${task.title}`, body: `${fmtEur(v.eur)} a month saved.`, href: "/opportunities?view=progress", dedupeKey: `autopilot-verified:${task.id}` });
    } else if (out.state === "fail") {
      error = out.error;
      verify.detail = out.error;
    } else if (verify.detail !== out.detail) {
      verify.detail = out.detail;
      changed = true;
    }
  }

  if (error) {
    status = "failed";
    result = error.slice(0, 500);
    changed = true;
    await audit("autopilot.failed", task.title, { taskId: task.id, error: error.slice(0, 300) }, { orgId: organizationId, actorEmail: actor });
    await createAlert(organizationId, {
      kind: "autopilot",
      severity: "warning",
      title: `Autopilot stopped: ${task.title}`,
      body: error,
      href: "/opportunities?view=autopilot",
      dedupeKey: `autopilot-failed:${task.id}:${now.slice(0, 10)}`,
    });
  }

  if (!changed && status === task.status) return { status, result, changed: false };
  const saved = await db.autopilotTask.updateMany({ where: { id: task.id, organizationId, updatedAt: task.updatedAt }, data: { status, result, steps: json(steps) } });
  // Un'altra esecuzione ha già aggiornato il piano: i suoi effetti sono idempotenti, si tiene la sua versione.
  return { status, result, changed: saved.count > 0 };
}

// ── Azioni ─────────────────────────────────────────────────────────────────

/** Approva un piano (o riapprova da persona un piano approvato in automatico) ed esegue i passi automatici. */
export async function approveTask(organizationId: string, taskId: string, email: string) {
  const task = await db.autopilotTask.findFirst({ where: { id: taskId, organizationId } });
  if (!task) return { ok: false as const, error: "That plan isn't there any more." };
  const human = email !== AUTO_ACTOR;
  const reapprove = human && task.approvedBy === AUTO_ACTOR && (task.status === "approved" || task.status === "running");
  if (task.status !== "proposed" && !reapprove) return { ok: false as const, error: "That plan was already handled." };
  const claimed = await db.autopilotTask.updateMany({
    where: { id: task.id, organizationId, status: task.status, updatedAt: task.updatedAt },
    data: { status: reapprove ? task.status : "approved", approvedBy: email, approvedAt: task.approvedAt ?? new Date() },
  });
  if (claimed.count === 0) return { ok: false as const, error: "That plan changed in the meantime — try again." };
  const fresh = (await db.autopilotTask.findFirst({ where: { id: task.id, organizationId } }))!;
  await ensureLedgerRow(fresh, email);
  await audit("autopilot.approved", task.title, { taskId: task.id, savingKey: task.savingKey, expectedMonthlyEur: task.expectedMonthlyEur }, { orgId: organizationId, actorEmail: email });
  const run = await runTask(organizationId, task.id, email);
  return { ok: true as const, run };
}

/** "Not for us": il piano sparisce e il suggerimento non torna. */
export async function dismissTask(organizationId: string, taskId: string, email: string) {
  const task = await db.autopilotTask.findFirst({ where: { id: taskId, organizationId } });
  if (!task || (task.status !== "proposed" && task.status !== "failed")) return false;
  const r = await db.autopilotTask.updateMany({ where: { id: task.id, organizationId, status: task.status }, data: { status: "dismissed", result: `Not for us (${email})` } });
  if (!r.count) return false;
  await db.savingDismissal.upsert({ where: { organizationId_key: { organizationId, key: task.savingKey } }, update: {}, create: { organizationId, key: task.savingKey } });
  await db.savingAction.updateMany({ where: { organizationId, savingKey: task.savingKey, status: "accepted" }, data: { status: "failed", note: "Stopped in Autopilot" } });
  await audit("autopilot.dismissed", task.title, { taskId: task.id, savingKey: task.savingKey }, { orgId: organizationId, actorEmail: email });
  return true;
}

/** Riprova un piano fallito dal passo in cui si era fermato. */
export async function retryTask(organizationId: string, taskId: string, email: string) {
  const task = await db.autopilotTask.findFirst({ where: { id: taskId, organizationId } });
  if (!task || task.status !== "failed") return null;
  let steps = stepsOf(task.steps);
  let verifyOnly = steps.filter((s) => s.id !== "verify").every((s) => s.done);
  if (verifyOnly && (await verificationOf(task)).state === "failed") {
    // Non confermato sulle bollette: i passi delle persone vanno rifatti, con una nuova riga nel registro.
    steps = steps.map((s) => (s.auto && s.id !== "verify" ? s : { ...s, done: false, at: undefined, detail: undefined }));
    verifyOnly = false;
  }
  const r = await db.autopilotTask.updateMany({
    where: { id: task.id, organizationId, status: "failed" },
    data: { status: verifyOnly ? "done" : "approved", result: null, approvedBy: email, approvedAt: task.approvedAt ?? new Date(), steps: json(steps) },
  });
  if (!r.count) return null;
  const fresh = (await db.autopilotTask.findFirst({ where: { id: task.id, organizationId } }))!;
  if (!verifyOnly) await ensureLedgerRow(fresh, email);
  await audit("autopilot.retry", task.title, { taskId: task.id }, { orgId: organizationId, actorEmail: email });
  return runTask(organizationId, task.id, email);
}

/** Una persona ha fatto il suo passo (es. cambio di piano nella pagina del fornitore). */
export async function markStepDone(organizationId: string, taskId: string, index: number, email: string) {
  const task = await db.autopilotTask.findFirst({ where: { id: taskId, organizationId } });
  if (!task || (task.status !== "approved" && task.status !== "running")) return false;
  const steps = stepsOf(task.steps);
  const s = steps[index];
  if (!s || s.auto || s.done) return false;
  steps[index] = { ...s, done: true, at: new Date().toISOString(), detail: `Done by ${email}` };
  const r = await db.autopilotTask.updateMany({ where: { id: task.id, organizationId, updatedAt: task.updatedAt }, data: { status: "running", steps: json(steps) } });
  if (!r.count) return false;
  await audit("autopilot.step", s.label, { taskId: task.id, manual: true }, { orgId: organizationId, actorEmail: email });
  await runTask(organizationId, task.id, email);
  return true;
}

// ── Lavoro giornaliero ─────────────────────────────────────────────────────

/** Lavoro giornaliero: sincronizza, porta avanti i piani approvati, in "auto" approva quelli sicuri. */
export async function runAutopilot(organizationId: string) {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { autopilotMode: true, autoRemoveSeats: true } });
  if (!org) return null;
  const mode = modeOf(org.autopilotMode);
  if (mode === "off") return { mode, synced: null, approved: 0, ran: 0 };
  const synced = await syncAutopilot(organizationId);

  let approved = 0;
  if (mode === "auto") {
    const proposed = await db.autopilotTask.findMany({ where: { organizationId, status: "proposed" } });
    for (const t of proposed) {
      if (!safeToAutoApprove({ kind: t.kind, steps: stepsOf(t.steps) }, org)) continue;
      const r = await approveTask(organizationId, t.id, AUTO_ACTOR);
      if (r.ok) approved++;
    }
  }

  const active = await db.autopilotTask.findMany({ where: { organizationId, status: { in: ["approved", "running", "done"] } }, select: { id: true, status: true, steps: true } });
  let ran = 0;
  for (const t of active) {
    if (t.status === "done" && stepsOf(t.steps).find((s) => s.id === "verify")?.done !== false) continue;
    const r = await runTask(organizationId, t.id);
    if (r?.changed) ran++;
  }

  // Piani nuovi da approvare: un avviso con il totale.
  const waiting = await db.autopilotTask.findMany({ where: { organizationId, status: "proposed" }, select: { expectedMonthlyEur: true } });
  if (synced.created > 0 && waiting.length) {
    const eur = waiting.reduce((t, w) => t + w.expectedMonthlyEur, 0);
    await createAlert(organizationId, {
      kind: "autopilot",
      severity: "info",
      title: `${waiting.length} saving${waiting.length === 1 ? "" : "s"} ready for approval`,
      body: `${fmtEur(eur)} a month. One click on the Savings page and angar does the rest.`,
      href: "/opportunities?view=autopilot",
      dedupeKey: `autopilot-ready:${organizationId}:${new Date().toISOString().slice(0, 10)}`,
    });
  }
  return { mode, synced, approved, ran };
}

// ── Riepilogo ──────────────────────────────────────────────────────────────

export interface AutopilotSummary {
  mode: AutopilotMode;
  proposedCount: number;
  proposedMonthlyEur: number;
  runningCount: number;
  doneMonthlyEur: number;
  verifiedMonthlyEur: number;
}

export async function autopilotSummary(organizationId: string): Promise<AutopilotSummary> {
  const [org, tasks] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { autopilotMode: true, autoRemoveSeats: true } }),
    db.autopilotTask.findMany({ where: { organizationId, status: { not: "dismissed" } }, select: { status: true, expectedMonthlyEur: true, steps: true, approvedBy: true } }),
  ]);
  return summarize(modeOf(org?.autopilotMode), tasks.map((t) => ({ ...t, steps: stepsOf(t.steps) })), { autoRemoveSeats: Boolean(org?.autoRemoveSeats) });
}

/** Logica pura del riepilogo. */
export function summarize(mode: AutopilotMode, tasks: { status: string; expectedMonthlyEur: number; steps: AutopilotStep[]; approvedBy: string | null }[], org: { autoRemoveSeats: boolean }): AutopilotSummary {
  const ask = tasks.filter((t) => needsHumanApproval(t, org));
  const running = tasks.filter((t) => (t.status === "approved" || t.status === "running") && !needsHumanApproval(t, org));
  const done = tasks.filter((t) => t.status === "done");
  return {
    mode,
    proposedCount: ask.length,
    proposedMonthlyEur: round2(ask.reduce((s, t) => s + t.expectedMonthlyEur, 0)),
    runningCount: running.length,
    doneMonthlyEur: round2(done.reduce((s, t) => s + t.expectedMonthlyEur, 0)),
    verifiedMonthlyEur: round2(done.reduce((s, t) => s + (t.steps.find((x) => x.id === "verify" && x.done)?.eur ?? 0), 0)),
  };
}

/** Piani per il pannello. */
export async function autopilotTasks(organizationId: string) {
  const [org, rows] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { autoRemoveSeats: true } }),
    db.autopilotTask.findMany({ where: { organizationId, status: { not: "dismissed" } }, orderBy: { updatedAt: "desc" }, take: 200 }),
  ]);
  const o = { autoRemoveSeats: Boolean(org?.autoRemoveSeats) };
  return rows.map((r) => {
    const steps = stepsOf(r.steps);
    return {
      id: r.id,
      kind: r.kind,
      title: r.title,
      status: r.status as TaskStatus,
      expectedMonthlyEur: r.expectedMonthlyEur,
      steps,
      result: r.result,
      needsApproval: needsHumanApproval({ status: r.status, approvedBy: r.approvedBy, steps }, o),
      approvedBy: r.approvedBy,
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

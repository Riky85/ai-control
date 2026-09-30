import { db } from "@/lib/db";
import { createAlert, postToChat, appUrl } from "@/lib/alerts";
import { upcomingRenewals } from "@/lib/renewals";
import { checkBudgets } from "@/lib/budgets";
import { fmtEur, fmtDate } from "@/lib/format";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";
import { countActive, idleSeats, SEAT_WINDOW_DAYS } from "@/lib/seats";

/**
 * Lavori periodici, eseguiti dal server stesso (niente cron esterno): ogni ora
 * si controlla cosa è "dovuto" e ogni lavoro gira una volta sola per chiave
 * (giorno o settimana), grazie al vincolo unico su JobRun.
 */
const DAY = 86400000;

function romeParts(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday as string, hour: Number(p.hour) };
}

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - yearStart.getTime()) / DAY + 1) / 7)).padStart(2, "0")}`;
}

/**
 * true se questo lavoro non era ancora stato registrato per questa chiave (e lo
 * registra come "running"). Un "running" di oltre 2 ore è un lavoro interrotto
 * (riavvio, errore): si può riprendere. finish() lo segna "done" solo a fine lavoro.
 */
const STALE_RUN_MS = 2 * 60 * 60 * 1000;
async function claim(name: string, key: string) {
  try {
    await db.jobRun.create({ data: { name, key, status: "running" } });
    return true;
  } catch {
    const retaken = await db.jobRun.updateMany({
      where: { name, key, status: "running", ranAt: { lt: new Date(Date.now() - STALE_RUN_MS) } },
      data: { ranAt: new Date() },
    });
    return retaken.count > 0;
  }
}

async function finish(name: string, key: string) {
  await db.jobRun.updateMany({ where: { name, key }, data: { status: "done" } });
}

// ── Rinnovi: avviso 14 giorni prima, con i posti non usati ───────────────
export async function renewalAlerts(orgId: string) {
  const renewals = await upcomingRenewals(orgId, 14);
  let n = 0;
  for (const r of renewals) {
    const asset = await db.aiAsset.findFirst({ where: { id: r.assetId, organizationId: orgId }, include: { cost: true, usages: { select: { lastSeenAt: true } } } });
    if (asset?.cost?.contractEnd) continue; // con il contratto registrato avvisa noticeDeadlineAlerts (contracts.ts)
    const seats = asset?.cost?.seats ?? null;
    // Stessa definizione di posto attivo di Usage e Savings (30 giorni).
    const active = countActive(asset?.usages ?? []);
    const idle = idleSeats(seats, active, asset?.usages.length ?? 0);
    // Mensili: si avvisa solo se ci sono posti da togliere (niente rumore ogni mese).
    if (!r.annual && idle === 0) continue;
    const created = await createAlert(orgId, {
      kind: "renewal",
      severity: r.annual || idle > 0 ? "warning" : "info",
      title: `${r.name} renews on ${fmtDate(r.date)} — ${fmtEur(r.amountEur)}${r.annual ? " (yearly)" : ""}`,
      body: idle > 0 ? `${idle} of ${seats} seats haven't been used in ${SEAT_WINDOW_DAYS} days. Remove them before the renewal to stop paying for them.` : `Decide now if you still need it${r.annual ? ": a yearly plan can't be reduced until the next term" : ""}.`,
      href: `/negotiate/${r.assetId}`,
      dedupeKey: `renewal:${r.assetId}:${r.date.toISOString().slice(0, 10)}`,
    });
    if (created) n++;
  }
  return n;
}

// ── Posti: senza risposta da 7 giorni → "da togliere" ──────────────────────
export async function seatFollowups(orgId: string) {
  // Il giro di pulizia posti è per persona: spento con la privacy per reparto / solo totali.
  if (!showsPeople(await orgPrivacyMode(orgId))) return 0;
  // Se l'azienda l'ha scelto, prima si tolgono da soli i posti che angar sa togliere via API.
  await (await import("@/lib/seat-removal")).autoRemoveSeats(orgId).catch((err) => console.error("[jobs] auto seat removal failed", orgId, err));
  const stale = await db.seatReminder.findMany({ where: { organizationId: orgId, respondedAt: null, removedAt: null, sentAt: { lt: new Date(Date.now() - 7 * DAY) } } });
  const released = await db.seatReminder.findMany({ where: { organizationId: orgId, response: "release", removedAt: null } });
  const byAsset = new Map<string, number>();
  for (const r of [...stale, ...released]) byAsset.set(r.aiAssetId, (byAsset.get(r.aiAssetId) ?? 0) + 1);
  let n = 0;
  for (const [assetId, count] of byAsset) {
    const a = await db.aiAsset.findFirst({ where: { id: assetId, organizationId: orgId }, select: { name: true } });
    if (!a) continue;
    if (
      await createAlert(orgId, {
        kind: "seats",
        severity: "warning",
        title: `${count} ${a.name} seat${count === 1 ? "" : "s"} ready to remove`,
        body: "People said they don't need it, or didn't answer in 7 days. Remove the seats in the provider's admin page, then mark them removed in angar.",
        href: "/usage?view=cleanup",
        dedupeKey: `seats:${assetId}:${isoWeek()}`,
      })
    )
      n++;
  }
  return n;
}

// ── Brief settimanale con decisioni one-click (lunedì mattina) ───────────
/**
 * Le 3 decisioni della settimana (weekly-brief.ts) come card con pulsanti su
 * Slack / Teams e per email a owner e admin, con gli stessi link firmati.
 * Restituisce true se è partito almeno un messaggio.
 */
export async function weeklyDigest(orgId: string, now = new Date()) {
  const [{ loadBrief, withButtons, briefText, briefSlackBlocks, briefTeamsCard, briefEmailHtml }, { chatActionUrl, slackInteractive, savingRef }, { sendEmail, emailEnabled }] = await Promise.all([
    import("@/lib/weekly-brief"),
    import("@/lib/chat-actions"),
    import("@/lib/mail"),
  ]);
  const { org, summary, decisions } = await loadBrief(orgId, now);
  if (!org) return false;
  const base = appUrl();
  const link = (act: "approve" | "reject" | "accept_saving", target: string) =>
    chatActionUrl({ act, org: orgId, asset: act === "accept_saving" ? savingRef(target) : target });
  const withLinks = decisions.map((d) => withButtons(d, base, link));
  const s = { ...summary, base };
  const text = briefText(s, withLinks);
  let sent = false;

  if (org.chatWebhookEncrypted) {
    sent = await postToChat(orgId, text, { slack: briefSlackBlocks(s, withLinks, slackInteractive(), orgId), teams: briefTeamsCard(s, withLinks) }).catch(() => false);
  }
  // Email solo se c'è qualcosa da decidere (niente rumore nelle settimane tranquille).
  if (emailEnabled() && withLinks.length) {
    const members = await db.workspaceMember.findMany({ where: { organizationId: orgId, status: "active", role: { in: ["OWNER", "ADMIN"] } }, select: { email: true } });
    const subject = `angar weekly: ${withLinks.length === 1 ? "1 decision" : `${withLinks.length} decisions`} for ${summary.orgName}`;
    const html = briefEmailHtml(s, withLinks);
    for (const m of members) {
      const r = await sendEmail({ to: m.email, subject, text, html }).catch(() => ({ sent: false }));
      if (r.sent) sent = true;
    }
  }
  if (sent) {
    const { audit } = await import("@/lib/audit");
    await audit("brief.sent", "weekly", { decisions: withLinks.map((d) => ({ kind: d.kind, id: d.id.slice(0, 120) })) }, { orgId, actorEmail: null });
  }
  return sent;
}

// ── Costi: sincronizza banche, contabilità e Fatture in Cloud (ogni giorno) ──
export async function syncCosts() {
  const [{ syncBank }, { syncAccounting }, { syncFattureInCloud }] = await Promise.all([
    import("@/lib/connectors/bank"),
    import("@/lib/connectors/chift"),
    import("@/lib/connectors/fatture-in-cloud"),
  ]);
  const rows = await db.connector.findMany({ where: { provider: { in: ["BANK", "ACCOUNTING", "FATTURE_IN_CLOUD"] }, credentialsEncrypted: { not: null } } });
  let ok = 0;
  for (const r of rows) {
    const run = r.provider === "BANK" ? syncBank : r.provider === "ACCOUNTING" ? syncAccounting : syncFattureInCloud;
    try {
      await run(r.organizationId);
      ok++;
    } catch (err) {
      await db.connector.update({ where: { id: r.id }, data: { lastSyncError: (err as Error).message.slice(0, 500) } });
    }
  }
  return ok;
}

// ── Report mensile via email a owner e admin (il 1° del mese) ─────────────
export async function monthlyReports() {
  const [{ buildReport, reportText }, { sendEmail, appOrigin }] = await Promise.all([import("@/lib/report"), import("@/lib/mail")]);
  const orgs = await db.organization.findMany({ where: { aiAssets: { some: { deletedAt: null } } }, include: { members: { where: { role: { in: ["OWNER", "ADMIN"] }, status: "active" } } } });
  let sent = 0;
  for (const org of orgs) {
    const r = await buildReport(org.id);
    const text = reportText(r, appOrigin());
    for (const m of org.members) {
      const res = await sendEmail({ to: m.email, subject: `Your AI in ${r.month}: ${r.canSave > 0 ? `save ${Math.round(r.canSave)} €/month` : "all tidy"}`, text });
      if (res.sent) sent++;
    }
  }
  return sent;
}

/** Mesi di conservazione dei dati d'uso (come scritto nell'informativa ai dipendenti). */
export const USAGE_RETENTION_MONTHS = 12;

/** Conservazione: cancella i dati d'uso più vecchi di USAGE_RETENTION_MONTHS (attività e traffico Edge). */
export async function purgeOldUsage(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - USAGE_RETENTION_MONTHS);
  const [activities, edge] = await Promise.all([
    db.aiAssetActivity.deleteMany({ where: { occurredAt: { lt: cutoff } } }),
    db.edgeEvent.deleteMany({ where: { day: { lt: cutoff.toISOString().slice(0, 10) } } }),
  ]);
  return activities.count + edge.count;
}

/** Tutti i lavori dovuti adesso, per tutte le aziende. Idempotente. */
export async function runDueJobs(now = new Date()) {
  const { day, weekday, hour } = romeParts(now);
  const orgs = await db.organization.findMany({ where: { aiAssets: { some: { deletedAt: null } } }, select: { id: true } });
  const summary = { orgs: orgs.length, synced: 0, renewals: 0, seats: 0, budgets: 0, digests: 0, reports: 0 };
  // Giornalieri: dalle 7 in poi (ora di Roma), una volta al giorno. Prima i costi, poi gli avvisi.
  if (hour >= 7 && (await claim("daily", day))) {
    summary.synced = await syncCosts().catch(() => 0);
    await purgeOldUsage(now).catch((err) => console.error("[jobs] retention failed", err));
    for (const o of orgs) {
      try {
        summary.renewals += await renewalAlerts(o.id);
        summary.seats += await seatFollowups(o.id);
        summary.budgets += (await checkBudgets(o.id)).filter((b) => b.alerted).length;
        summary.renewals += await (await import("@/lib/contracts")).noticeDeadlineAlerts(o.id).catch(() => 0);
        await (await import("@/lib/savings-ledger")).verifySavingActions(o.id, now).catch((err) => console.error("[jobs] saving verification failed", o.id, err));
        // angar Engine: autopilot dei risparmi, anomalie e fotografia dell'angar Score.
        await (await import("@/lib/engine/autopilot")).runAutopilot(o.id).catch((err) => console.error("[jobs] autopilot failed", o.id, err));
        await (await import("@/lib/engine/forecast")).anomalyAlerts(o.id).catch((err) => console.error("[jobs] anomalies failed", o.id, err));
        await (await import("@/lib/engine/score")).recordScoreSnapshot(o.id, now).catch((err) => console.error("[jobs] score snapshot failed", o.id, err));
      } catch (err) {
        console.error("[jobs] daily failed for", o.id, err);
      }
    }
    await finish("daily", day);
  }
  // Mensile: il 1° del mese dalle 9.
  if (day.endsWith("-01") && hour >= 9 && (await claim("monthly-report", day.slice(0, 7)))) {
    summary.reports = await monthlyReports().catch(() => 0);
    await finish("monthly-report", day.slice(0, 7));
  }
  // Settimanale: lunedì dalle 8.
  if (weekday === "Mon" && hour >= 8 && (await claim("weekly", isoWeek(now)))) {
    for (const o of orgs) {
      try {
        if (await weeklyDigest(o.id, now)) summary.digests++;
        // Promemoria della policy AI non confermata da 7+ giorni (max 2 per persona).
        await (await import("@/lib/policy-ack")).sendAckReminders(o.id, undefined, now).catch((err) => console.error("[jobs] policy ack reminders failed", o.id, err));
      } catch (err) {
        console.error("[jobs] weekly failed for", o.id, err);
      }
    }
    await finish("weekly", isoWeek(now));
  }
  return summary;
}

let started = false;
/** Avviato una volta all'avvio del server (instrumentation.ts). */
export function startScheduler() {
  if (started || process.env.DISABLE_SCHEDULER === "1") return;
  started = true;
  const tick = () => void runDueJobs().catch((err) => console.error("[jobs] tick failed", err));
  setTimeout(tick, 2 * 60 * 1000); // dopo l'avvio
  setInterval(tick, 60 * 60 * 1000); // poi ogni ora
}

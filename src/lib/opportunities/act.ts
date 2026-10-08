"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { appUrl, postToChat } from "@/lib/alerts";
import { sendEmail } from "@/lib/mail";
import { ticketForEvent } from "@/lib/ticketing";
import { fmtEur } from "@/lib/format";
import { loadOpportunities } from "@/lib/opportunities";
import { markOpportunityStatus } from "@/lib/opportunities/actions";
import { actsFor, isAct, loadActContext, primaryAsset } from "./act-plan";
import { CATEGORY_LABEL, type Opportunity } from "./types";

/**
 * "Act" su una riga di Opportunities: esegue l'azione scelta (pulizia posti, negoziazione,
 * ticket, email al responsabile, Slack/Teams, Impact simulator), la scrive nel registro di
 * audit e porta l'opportunità ad "Accepted" / "In progress" con le funzioni di stato esistenti.
 * Stesso ruolo delle azioni di stato (EDITOR). Titolo e importi si ricalcolano qui, mai dal form.
 */

const safeBack = (v: FormDataEntryValue | null) => {
  const b = String(v ?? "").slice(0, 300);
  return b.startsWith("/opportunities") ? b : "/opportunities";
};

function edit(path: string, set: Record<string, string | null>) {
  const u = new URL(path, "http://x");
  for (const [k, v] of Object.entries(set)) (v == null ? u.searchParams.delete(k) : u.searchParams.set(k, v));
  const q = u.searchParams.toString();
  return `${u.pathname}${q ? `?${q}` : ""}`;
}

/** Testo comune per email, chat e ticket. */
function describe(o: Opportunity) {
  const link = `${appUrl()}/opportunities?open=${encodeURIComponent(o.key)}`;
  const money = o.savings ? `${o.savings.kind === "estimated" ? "About " : ""}${fmtEur(o.savings.eur)} a month (${fmtEur(o.savings.eur * 12)} a year)` : null;
  const lines = [
    o.reason,
    "",
    `Recommended action: ${o.recommendedAction}`,
    money ? `Potential saving: ${money}` : null,
    o.systems.length ? `AI systems: ${o.systems.map((s) => s.name).join(", ")}` : null,
    `Effort: ${o.effort} · Risk: ${o.risk}`,
    "",
    ...o.evidence.slice(0, 5).map((e) => `- ${e}`),
  ].filter((x): x is string => x !== null);
  return { link, text: lines.join("\n") };
}

/**
 * Stato dopo l'atto, con le funzioni di opportunities/actions.ts: "In progress" quando il lavoro è
 * partito davvero (posti, ticket, negoziazione; solo per il registro di stato), altrimenti "Accepted".
 */
async function advance(o: Opportunity, act: string): Promise<string | null> {
  const started = (act === "seats" || act === "ticket" || act === "negotiate") && o.ledger === "state";
  const to = started ? "in_progress" : "accepted";
  if (!(o.status === "new" || (to === "in_progress" && o.status === "accepted"))) return null;
  const r = await markOpportunityStatus(o.key, to);
  return r === "missing" ? "The opportunity changed with new data — its status wasn't updated." : null;
}

export async function actOnOpportunityAction(formData: FormData) {
  const back = safeBack(formData.get("back"));
  const s = await requireRole("EDITOR", back);
  const key = String(formData.get("key") ?? "").slice(0, 500);
  const act = String(formData.get("act") ?? "");
  const fail = (msg: string): never => redirect(edit(back, { open: null, error: msg }));
  if (!key || !isAct(act)) fail("Choose what to do.");

  const { list } = await loadOpportunities(s.orgId);
  const o = list.find((x) => x.key === key);
  if (!o) return fail("That opportunity isn't there any more — it may have changed with new data.");
  const asset = primaryAsset(o);
  const ctx = await loadActContext(s.orgId, [...o.systems.map((x) => x.id), ...(asset ? [asset] : [])]);
  const option = actsFor(o, ctx).find((x) => x.act === act);
  if (!option) fail("That action doesn't fit this opportunity.");
  if (option!.disabled) fail(option!.disabled!);

  let dest = edit(back, { open: null, error: null });
  const meta: Record<string, unknown> = { key, act, category: o.category };

  if (act === "seats") {
    // Pulizia posti esistente: email alle persone inattive, poi "Remove seat" (API del fornitore) da Usage → Cleanup.
    const { sendSeatReminders } = await import("@/lib/seats");
    const r = await sendSeatReminders(s.orgId, asset!, s.email);
    meta.asked = r.asked;
    meta.sent = r.sent;
    dest = r.sent ? `/usage?view=cleanup&asked=${r.sent}` : `/usage?view=cleanup&error=${encodeURIComponent(r.reason || "Nobody to ask right now — remove the seats from the list below.")}`;
  } else if (act === "negotiate") {
    dest = `/negotiate/${encodeURIComponent(asset!)}`;
  } else if (act === "simulate") {
    if (!o.simulateHref || !o.simulateHref.startsWith("/impact")) fail("No simulation fits this opportunity.");
    dest = o.simulateHref!;
  } else if (act === "ticket") {
    const { link, text } = describe(o);
    const r = await ticketForEvent(
      s.orgId,
      { kind: "opportunity", title: `${CATEGORY_LABEL[o.category]}: ${o.title}`, body: `${text}\n\nRequested by ${s.email}.`, url: link, dedupeKey: `opportunity:${o.key}` },
      s.email,
    );
    if (!r.ok) fail(`Ticket not created — ${r.error}`);
    meta.ticket = r.ok ? r.key : null;
    meta.existing = r.ok ? !!r.existing : false;
  } else if (act === "email") {
    const to = asset ? ctx.owners[asset] : null;
    if (!to) fail("Set an owner on the AI system first.");
    const { link, text } = describe(o);
    const r = await sendEmail({
      to: to!,
      subject: `Angar: ${o.title}`.slice(0, 180),
      text: `Hello,\n\n${s.name ?? s.email} flagged this for you in Angar:\n\n${o.title}\n${text}\n\nOpen it: ${link}\n`,
    });
    if (!r.sent) fail(`Email not sent — ${r.reason ?? "unknown error"}`);
    meta.to = to;
  } else if (act === "chat") {
    const { link, text } = describe(o);
    const ok = await postToChat(s.orgId, `*${o.title}*\n${text}\n${link}`).catch(() => false);
    if (!ok) fail(`${ctx.chat ?? "Chat"} didn't accept the message — check the webhook in Settings.`);
    meta.channel = ctx.chat;
  }

  await audit("opportunity.act", o.title.slice(0, 200), meta);
  const err = await advance(o, act);
  revalidatePath("/opportunities");
  revalidatePath("/");
  if (err && dest.startsWith("/opportunities")) dest = edit(dest, { error: err });
  redirect(dest);
}

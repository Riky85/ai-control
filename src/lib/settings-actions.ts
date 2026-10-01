"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";
import { postToChat } from "@/lib/alerts";
import { audit } from "@/lib/audit";
import { INDUSTRIES } from "@/lib/industries";
import { isPrivacyMode, privacyModeOf } from "@/lib/privacy";


export async function setIndustryAction(formData: FormData) {
  const s = await requireRole("ADMIN", "/settings");
  const v = String(formData.get("industry") ?? "");
  await db.organization.update({ where: { id: s.orgId }, data: { industry: INDUSTRIES.includes(v) ? v : null } });
  revalidatePath("/", "layout");
  redirect("/settings");
}

/** Webhook Slack o Microsoft Teams: salvato cifrato, provato subito. */
export async function setChatWebhookAction(formData: FormData) {
  const s = await requireRole("ADMIN", "/settings?tab=integrations");
  const url = String(formData.get("url") ?? "").trim();
  if (!url) {
    await db.organization.update({ where: { id: s.orgId }, data: { chatWebhookEncrypted: null } });
    await audit("chat.disconnect", "webhook");
    redirect("/settings?tab=integrations&chat=off");
  }
  let host = "";
  try {
    const u = new URL(url);
    host = u.hostname;
    if (u.protocol !== "https:") throw new Error();
  } catch {
    redirect(`/settings?tab=integrations&error=${encodeURIComponent("That doesn't look like a webhook URL (it must start with https://).")}`);
  }
  // Solo i servizi di chat attesi: niente URL arbitrari verso cui il server farebbe richieste.
  const allowed = /(^|\.)hooks\.slack\.com$|(^|\.)webhook\.office\.com$|(^|\.)logic\.azure\.com$|(^|\.)environment\.api\.powerplatform\.com$/.test(host);
  if (!allowed) redirect(`/settings?tab=integrations&error=${encodeURIComponent("Use a Slack incoming webhook (hooks.slack.com) or a Microsoft Teams workflow webhook.")}`);
  await db.organization.update({ where: { id: s.orgId }, data: { chatWebhookEncrypted: encryptJson({ url }) } });
  const ok = await postToChat(s.orgId, "✅ angar is connected. You'll get a weekly summary every Monday and alerts for renewals, budgets and AI that isn't allowed.").catch(() => false);
  await audit("chat.connect", host);
  redirect(ok ? "/settings?tab=integrations&chat=ok" : `/settings?tab=integrations&error=${encodeURIComponent("Saved, but the test message failed — check the webhook URL.")}`);
}

/**
 * Privacy dei dipendenti: per persona, per reparto (gruppi ≥ 5) o solo totali.
 * Solo admin e owner; il cambio resta nel registro di audit.
 */
export async function setPrivacyModeAction(formData: FormData) {
  const s = await requireRole("ADMIN", "/settings?tab=privacy");
  const mode = String(formData.get("mode") ?? "");
  if (!isPrivacyMode(mode)) redirect(`/settings?tab=privacy&error=${encodeURIComponent("Choose one of the privacy modes.")}`);
  const org = await db.organization.findUnique({ where: { id: s.orgId }, select: { privacyMode: true } });
  const from = privacyModeOf(org);
  if (from !== mode) {
    await db.organization.update({ where: { id: s.orgId }, data: { privacyMode: mode } });
    await audit("privacy.mode_change", mode, { from, to: mode });
  }
  revalidatePath("/", "layout");
  redirect(`/settings?tab=privacy&privacy=${from === mode ? "same" : "ok"}`);
}

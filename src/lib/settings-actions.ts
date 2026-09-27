"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";
import { postToChat } from "@/lib/alerts";
import { audit } from "@/lib/audit";
import { INDUSTRIES } from "@/lib/industries";


export async function setIndustryAction(formData: FormData) {
  const s = await requireRole("ADMIN", "/settings");
  const v = String(formData.get("industry") ?? "");
  await db.organization.update({ where: { id: s.orgId }, data: { industry: INDUSTRIES.includes(v) ? v : null } });
  revalidatePath("/", "layout");
  redirect("/settings");
}

/** Webhook Slack o Microsoft Teams: salvato cifrato, provato subito. */
export async function setChatWebhookAction(formData: FormData) {
  const s = await requireRole("ADMIN", "/settings");
  const url = String(formData.get("url") ?? "").trim();
  if (!url) {
    await db.organization.update({ where: { id: s.orgId }, data: { chatWebhookEncrypted: null } });
    await audit("chat.disconnect", "webhook");
    redirect("/settings?chat=off");
  }
  let host = "";
  try {
    const u = new URL(url);
    host = u.hostname;
    if (u.protocol !== "https:") throw new Error();
  } catch {
    redirect(`/settings?error=${encodeURIComponent("That doesn't look like a webhook URL (it must start with https://).")}`);
  }
  // Solo i servizi di chat attesi: niente URL arbitrari verso cui il server farebbe richieste.
  const allowed = /(^|\.)hooks\.slack\.com$|(^|\.)webhook\.office\.com$|(^|\.)logic\.azure\.com$|(^|\.)environment\.api\.powerplatform\.com$/.test(host);
  if (!allowed) redirect(`/settings?error=${encodeURIComponent("Use a Slack incoming webhook (hooks.slack.com) or a Microsoft Teams workflow webhook.")}`);
  await db.organization.update({ where: { id: s.orgId }, data: { chatWebhookEncrypted: encryptJson({ url }) } });
  const ok = await postToChat(s.orgId, "✅ angar is connected. You'll get a weekly summary every Monday and alerts for renewals, budgets and AI that isn't allowed.").catch(() => false);
  await audit("chat.connect", host);
  redirect(ok ? "/settings?chat=ok" : `/settings?error=${encodeURIComponent("Saved, but the test message failed — check the webhook URL.")}`);
}

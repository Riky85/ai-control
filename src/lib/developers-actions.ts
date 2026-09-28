"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { encryptJson } from "@/lib/crypto";
import { newApiKey } from "@/lib/api-keys";
import { checkWebhookUrl, deliver, isWebhookEvent, newWebhookSecret, MAX_WEBHOOKS } from "@/lib/webhooks";

const BACK = "/settings?tab=integrations";
const MAX_KEYS = 20;
const clean = (v: unknown, n = 60) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Nuova chiave API (sola lettura): si vede una volta sola. */
export async function createApiKeyAction(input: { name: string }): Promise<{ key: string; hint: string } | { error: string }> {
  const s = await requireRole("ADMIN", BACK);
  const name = clean(input?.name) || "API key";
  if ((await db.apiKey.count({ where: { organizationId: s.orgId, revokedAt: null } })) >= MAX_KEYS) return { error: `At most ${MAX_KEYS} active keys — revoke one first.` };
  const k = newApiKey();
  await db.apiKey.create({ data: { organizationId: s.orgId, name, keyHash: k.hash, hint: k.hint, scopes: ["read"], createdBy: s.email } });
  await audit("api_key.create", name, { hint: k.hint });
  revalidatePath("/settings");
  return { key: k.key, hint: k.hint };
}

export async function revokeApiKeyAction(formData: FormData) {
  const s = await requireRole("ADMIN", BACK);
  const key = await db.apiKey.findFirst({ where: { id: String(formData.get("id") ?? ""), organizationId: s.orgId, revokedAt: null } });
  if (key) {
    await db.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    await audit("api_key.revoke", key.name, { hint: key.hint });
  }
  revalidatePath("/settings");
  redirect(BACK);
}

/** Nuovo webhook: il segreto di firma si vede una volta sola. */
export async function createWebhookAction(input: { url: string; events: string[] }): Promise<{ secret: string } | { error: string }> {
  const s = await requireRole("ADMIN", BACK);
  const u = checkWebhookUrl(String(input?.url ?? ""));
  if (!u.ok) return { error: u.error };
  const events = [...new Set((Array.isArray(input?.events) ? input.events : []).map(String).filter(isWebhookEvent))];
  if (!events.length) return { error: "Pick at least one event." };
  if ((await db.webhook.count({ where: { organizationId: s.orgId } })) >= MAX_WEBHOOKS) return { error: `At most ${MAX_WEBHOOKS} webhooks — delete one first.` };
  const secret = newWebhookSecret();
  await db.webhook.create({ data: { organizationId: s.orgId, url: u.url, secretEncrypted: encryptJson({ secret }), events, createdBy: s.email } });
  await audit("webhook.create", new URL(u.url).host, { events });
  revalidatePath("/settings");
  return { secret };
}

async function ownWebhook(formData: FormData) {
  const s = await requireRole("ADMIN", BACK);
  const hook = await db.webhook.findFirst({ where: { id: String(formData.get("id") ?? ""), organizationId: s.orgId } });
  if (!hook) redirect(BACK);
  return { s, hook: hook! };
}

export async function toggleWebhookAction(formData: FormData) {
  const { hook } = await ownWebhook(formData);
  await db.webhook.update({ where: { id: hook.id }, data: { active: !hook.active } });
  await audit(hook.active ? "webhook.pause" : "webhook.resume", new URL(hook.url).host);
  revalidatePath("/settings");
  redirect(BACK);
}

export async function deleteWebhookAction(formData: FormData) {
  const { hook } = await ownWebhook(formData);
  await db.webhook.delete({ where: { id: hook.id } });
  await audit("webhook.delete", new URL(hook.url).host);
  revalidatePath("/settings");
  redirect(BACK);
}

/** "Send test": un evento "test" firmato, atteso (timeout 5 s), esito in lastStatus. */
export async function testWebhookAction(formData: FormData) {
  const { s, hook } = await ownWebhook(formData);
  const status = await deliver(hook, s.orgId, "test", { message: "Test event from angar", sentBy: s.email });
  revalidatePath("/settings");
  redirect(`${BACK}&webhook=${encodeURIComponent(status)}`);
}

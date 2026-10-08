"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { refreshOAuthGrants, capabilities, isGrantProvider, PROVIDER_LABEL } from "@/lib/access";
import { revokeGrant } from "./providers";
import { nudgeUsers } from "./nudge";

/**
 * App access: "Refresh" (editor), "Revoke" (admin, dietro conferma, solo se il token lo permette),
 * "Nudge users" (admin, una volta ogni 7 giorni per AI). Tutto nel registro di audit.
 */
const ACCESS = "/estate/access";
const safeBack = (v: FormDataEntryValue | null) => {
  const b = String(v ?? "").slice(0, 200);
  return b === ACCESS || b.startsWith(`${ACCESS}?`) || b === "/estate/requests" || b.startsWith("/estate/requests?") ? b : ACCESS;
};
const withParam = (path: string, k: string, v: string) => {
  const u = new URL(path, "http://x");
  for (const x of ["error", "done"]) u.searchParams.delete(x);
  u.searchParams.set(k, v);
  return `${u.pathname}?${u.searchParams.toString()}`;
};

export async function refreshAccessAction(formData: FormData) {
  const back = safeBack(formData.get("back"));
  const s = await requireRole("EDITOR", back);
  // Ogni lettura chiama Microsoft/Google per tutti gli utenti: al massimo 3 ogni 10 minuti.
  if (!rateLimit(`access-refresh:${s.orgId}`, 3, 10 * 60_000)) redirect(withParam(back, "error", "Refreshed a moment ago — try again in a few minutes."));
  const results = await refreshOAuthGrants(s.orgId);
  await audit("access.refresh", "OAuth grants", { results: results.map((r) => ({ provider: r.provider, ok: r.ok, apps: r.apps ?? null, aiApps: r.aiApps ?? null })) });
  revalidatePath(ACCESS);
  if (!results.length) redirect(withParam(back, "error", "Connect Microsoft 365 or Google Workspace first."));
  const failed = results.filter((r) => !r.ok);
  if (failed.length === results.length) redirect(withParam(back, "error", failed.map((r) => `${PROVIDER_LABEL[r.provider]}: ${r.error}`).join(" · ")));
  const apps = results.reduce((t, r) => t + (r.apps ?? 0), 0);
  redirect(withParam(back, "done", failed.length ? `Updated ${apps} apps. ${failed.map((r) => `${PROVIDER_LABEL[r.provider]}: ${r.error}`).join(" · ")}` : `Updated: ${apps} app${apps === 1 ? "" : "s"} with access.`));
}

export async function revokeAccessAction(formData: FormData) {
  const back = safeBack(formData.get("back"));
  const s = await requireRole("ADMIN", back);
  const id = String(formData.get("id") ?? "").slice(0, 64);
  if (String(formData.get("confirm") ?? "") !== "yes") redirect(withParam(back, "error", "Confirm the revoke first."));
  const g = id ? await db.oAuthGrant.findFirst({ where: { id, organizationId: s.orgId } }) : null;
  if (!g || !isGrantProvider(g.provider)) redirect(withParam(back, "error", "That app isn't in the list any more."));
  const provider = g!.provider as "MICROSOFT_365" | "GOOGLE_WORKSPACE";
  const cap = (await capabilities(s.orgId, { fresh: true }))[provider];
  if (!cap?.canRevoke) redirect(withParam(back, "error", cap?.revokeWhy ?? `${PROVIDER_LABEL[provider]} isn't connected.`));
  const row = await db.connector.findUnique({ where: { organizationId_provider: { organizationId: s.orgId, provider } }, select: { credentialsEncrypted: true } });
  const r = await revokeGrant(provider, row?.credentialsEncrypted ?? null, g!.appId, g!.userRefs);
  await audit(r.ok ? "access.revoke" : "access.revoke_failed", g!.appName, { provider, appId: g!.appId, isAi: g!.isAi, users: g!.userCount, ...(r.ok ? { removed: r.removed } : { error: r.error }) });
  if (!r.ok) redirect(withParam(back, "error", `${PROVIDER_LABEL[provider]} didn't revoke ${g!.appName}: ${r.error}`));
  await db.oAuthGrant.deleteMany({ where: { id: g!.id, organizationId: s.orgId } });
  revalidatePath(ACCESS);
  redirect(withParam(back, "done", `Revoked ${g!.appName} in ${PROVIDER_LABEL[provider]}.`));
}

export async function nudgeUsersAction(formData: FormData) {
  const back = safeBack(formData.get("back"));
  const s = await requireRole("ADMIN", back);
  const assetId = String(formData.get("assetId") ?? "").slice(0, 64);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(assetId)) redirect(withParam(back, "error", "Choose an AI system."));
  const r = await nudgeUsers(s.orgId, assetId);
  if (!r.ok) {
    redirect(withParam(back, "error", r.error));
  }
  const ok = r as Extract<typeof r, { ok: true }>;
  await audit("estate.nudge", ok.name, { assetId, recipients: ok.asked, sent: ok.sent });
  revalidatePath(ACCESS);
  revalidatePath("/estate/requests");
  redirect(withParam(back, "done", `Nudged ${ok.sent} ${ok.sent === 1 ? "person" : "people"} about ${ok.name}.`));
}

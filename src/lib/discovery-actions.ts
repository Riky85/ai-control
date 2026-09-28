"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { domainsFromText, ingestFindings, newDiscoveryToken } from "@/lib/discovery/ingest";
import { revokeDesktopTokens } from "@/lib/discovery/desktop-tokens";

/** Nuovo token per lo scanner: il precedente smette di funzionare. Mostrato una sola volta. */
export async function createDiscoveryTokenAction(): Promise<{ token: string; hint: string }> {
  const s = await requireRole("ADMIN", "/download?view=other");
  const t = newDiscoveryToken();
  const { encryptJson } = await import("@/lib/crypto");
  await db.organization.update({ where: { id: s.orgId }, data: { discoveryTokenHash: t.hash, discoveryTokenHint: t.hint, discoveryTokenEncrypted: encryptJson({ token: t.token }) } });
  await audit("discovery.token_created");
  return { token: t.token, hint: t.hint };
}

export async function revokeDiscoveryTokenAction() {
  const s = await requireRole("ADMIN", "/download?view=other");
  await db.organization.update({ where: { id: s.orgId }, data: { discoveryTokenHash: null, discoveryTokenHint: null, discoveryTokenEncrypted: null, joinCode: null } });
  // Anche i token delle singole installazioni dell'app desktop.
  await revokeDesktopTokens(s.orgId);
  await audit("discovery.token_revoked");
  revalidatePath("/download");
}

/** Log di rete (DNS, firewall, proxy): si estraggono i domini dei servizi AI. */
export async function uploadNetworkLogAction(formData: FormData) {
  const s = await requireRole("EDITOR", "/download?view=other");
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) redirect(`/download?view=other&error=${encodeURIComponent("Choose a log file first.")}#network`);
  if (file!.size > 50 * 1024 * 1024) redirect(`/download?view=other&error=${encodeURIComponent("That file is over 50 MB — export a shorter period.")}#network`);
  const findings = domainsFromText(await file!.text());
  if (findings.length === 0) redirect(`/download?view=other&error=${encodeURIComponent(`No AI services found in ${file!.name}. Check it lists domain names (DNS queries or URLs).`)}#network`);
  const systems = await ingestFindings(s.orgId, `Network log · ${file!.name}`.slice(0, 120), findings);
  await audit("discovery.log_upload", file!.name);
  revalidatePath("/", "layout");
  redirect(`/review?from=scan&found=${systems.length}`);
}

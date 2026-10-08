"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { domainsFromText, ingestFindings, newDiscoveryToken } from "@/lib/discovery/ingest";
import { revokeDesktopTokens } from "@/lib/discovery/desktop-tokens";
import { revalidateOrgSetup } from "@/lib/layout-data";

/** Nuovo token per lo scanner: il precedente smette di funzionare. Mostrato una sola volta. */
export async function createDiscoveryTokenAction(): Promise<{ token: string; hint: string }> {
  const s = await requireRole("ADMIN", "/connect/other");
  const t = newDiscoveryToken();
  const { encryptJson } = await import("@/lib/crypto");
  await db.organization.update({ where: { id: s.orgId }, data: { discoveryTokenHash: t.hash, discoveryTokenHint: t.hint, discoveryTokenEncrypted: encryptJson({ token: t.token }) } });
  await audit("discovery.token_created");
  return { token: t.token, hint: t.hint };
}

export async function revokeDiscoveryTokenAction() {
  const s = await requireRole("ADMIN", "/connect/other");
  await db.organization.update({ where: { id: s.orgId }, data: { discoveryTokenHash: null, discoveryTokenHint: null, discoveryTokenEncrypted: null, joinCode: null } });
  // Anche i token delle singole installazioni dell'app desktop.
  await revokeDesktopTokens(s.orgId);
  await audit("discovery.token_revoked");
  revalidatePath("/download");
  revalidatePath("/connect/other");
}

/**
 * Log di rete (DNS, firewall, proxy) caricati a mano: .csv, .log, .txt, .json, .zip (anche più file).
 * Formato riconosciuto da solo (Zscaler NSS, FortiGate, BIND, Windows DNS, Pi-hole, pfSense/OPNsense,
 * Umbrella, Cloudflare, CSV/JSON generici), poi la stessa pipeline di angar Edge: AI per giorno e
 * persona/dispositivo secondo la privacy dell'azienda. Mai URL o query string.
 */
export async function uploadNetworkLogAction(formData: FormData) {
  const from = String(formData.get("back") ?? "");
  const backTo = from === "/connectors" ? "/connectors" : "/connect/other";
  const anchor = backTo === "/connectors" ? "#network-logs" : "#network";
  // Su /connectors l'errore resta accanto al modulo di caricamento (logerror), non nel messaggio globale.
  const key = backTo === "/connectors" ? "logerror" : "error";
  const fail = (msg: string): never => redirect(`${backTo}${backTo.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}${anchor}`);
  const s = await requireRole("EDITOR", backTo);
  const files = formData.getAll("file").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).size > 0);
  if (!files.length) fail("Choose a log file first.");
  if (files.reduce((n, f) => n + f.size, 0) > 50 * 1024 * 1024) fail("Over 50 MB — zip the logs or export a shorter period.");

  const { textsOf, aggregateImport, formatLabel } = await import("@/lib/edge/log-import");
  const { importMatcher, ingestImport, isAnonymous } = await import("@/lib/edge/network-source");
  const texts: [string, string][] = [];
  const warnings: string[] = [];
  for (const f of files.slice(0, 20)) {
    const t = textsOf(f.name, new Uint8Array(await f.arrayBuffer()));
    texts.push(...t.texts);
    warnings.push(...t.warnings);
  }
  const org = await db.organization.findUnique({ where: { id: s.orgId }, select: { privacyMode: true } });
  const anonymous = isAnonymous(org);
  const r = aggregateImport(texts, await importMatcher(s.orgId), { anonymous, prefix: "import" });
  r.warnings.unshift(...warnings);
  const names = files.map((f) => f.name).join(", ").slice(0, 200);

  let services = r.services.length;
  if (r.aiLines > 0) {
    await ingestImport(s.orgId, "upload", r);
  } else {
    // Nessuna riga in un formato noto (es. un elenco di domini): solo i nomi dei servizi, per l'azienda.
    const findings = domainsFromText(texts.map(([, t]) => t).join("\n"));
    if (findings.length === 0) {
      fail(r.parsed ? `Read ${r.lines.toLocaleString("en-GB")} lines — no AI services in them.` : `No AI services found in ${names}. Check the file lists domain names (DNS queries or URLs).`);
    }
    services = (await ingestFindings(s.orgId, `Network log · ${names}`.slice(0, 120), findings)).length;
  }
  await audit("discovery.log_upload", names, { lines: r.lines, aiLines: r.aiLines, services, formats: Object.keys(r.formats) });
  revalidateOrgSetup(s.orgId);
  revalidatePath("/", "layout");
  const fmt = Object.entries(r.formats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k]) => formatLabel(k))
    .join(", ");
  const q = new URLSearchParams({ netlog: `${r.lines}.${services}.${anonymous ? -1 : r.people}`, ...(fmt ? { fmt } : {}), ...(r.warnings.length ? { warn: r.warnings.slice(0, 2).join(" ").slice(0, 300) } : {}) });
  redirect(`/connectors?${q.toString()}#network-logs`);
}

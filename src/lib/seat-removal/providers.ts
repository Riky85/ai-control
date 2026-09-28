/**
 * Togliere un posto direttamente dal fornitore, via API amministrativa.
 * Ogni adattatore riceve le credenziali GIÀ salvate (cifrate) sul connettore
 * dell'azienda: mai le chiavi di ripiego dalle variabili d'ambiente, perché
 * un'azione distruttiva non deve mai poter toccare un'altra organizzazione.
 *
 * Esito: ok (tolto, o non c'era già più) oppure errore spiegato, con
 * `reconnect` quando il collegamento non ha il permesso di scrittura.
 */
import { decryptJson } from "@/lib/crypto";

export type RemovalOutcome = { ok: true; detail: string; alreadyGone?: boolean } | { ok: false; error: string; reconnect?: boolean };

const fail = (error: string, reconnect = false): RemovalOutcome => ({ ok: false, error, reconnect });
const short = async (res: Response) => (await res.text().catch(() => "")).slice(0, 200);

// ── Microsoft 365 Copilot (Graph) ─────────────────────────────────────────
/**
 * Permessi applicativi che consentono di togliere una licenza. L'app angar su
 * Entra ID usa il consenso ".default": il permesso va aggiunto nella
 * registrazione dell'app (LicenseAssignment.ReadWrite.All) e l'amministratore
 * del cliente deve ricollegare Microsoft 365 per approvarlo.
 */
export const MS_WRITE_ROLES = ["LicenseAssignment.ReadWrite.All", "User.ReadWrite.All", "Directory.ReadWrite.All"];

function jwtRoles(token: string): string[] {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return Array.isArray(payload.roles) ? payload.roles : [];
  } catch {
    return [];
  }
}

export async function removeCopilotSeat(credentialsEncrypted: string | null, email: string): Promise<RemovalOutcome> {
  const tenantId = decryptJson<{ tenantId?: string }>(credentialsEncrypted)?.tenantId;
  if (!tenantId) return fail("Microsoft 365 isn't connected.", true);
  const { msToken } = await import("@/lib/connectors/microsoft365");
  const token = await msToken(tenantId);
  if (!jwtRoles(token).some((r) => MS_WRITE_ROLES.includes(r))) {
    return fail("Microsoft 365 is connected read-only. Reconnect it in Sources and approve the licence-management permission to remove seats from angar.", true);
  }
  const G = "https://graph.microsoft.com/v1.0";
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ConsistencyLevel: "eventual" };

  const skusRes = await fetch(`${G}/subscribedSkus?$select=skuId,skuPartNumber`, { headers: h, cache: "no-store" });
  if (!skusRes.ok) return fail(`Microsoft didn't list the licences (${skusRes.status}): ${await short(skusRes)}`);
  const skus = ((await skusRes.json()).value ?? []) as { skuId: string; skuPartNumber?: string }[];
  const copilot = new Set(skus.filter((s) => /copilot/i.test(s.skuPartNumber ?? "")).map((s) => s.skuId));
  if (!copilot.size) return fail("No Microsoft 365 Copilot licences found in this tenant.");

  // L'email può essere il nome utente (UPN) o l'indirizzo principale.
  let user: { id: string; assignedLicenses?: { skuId: string }[] } | null = null;
  const direct = await fetch(`${G}/users/${encodeURIComponent(email)}?$select=id,assignedLicenses`, { headers: h, cache: "no-store" });
  if (direct.ok) user = await direct.json();
  else if (direct.status === 404) {
    const q = await fetch(`${G}/users?$filter=${encodeURIComponent(`mail eq '${email.replace(/'/g, "''")}'`)}&$select=id,assignedLicenses`, { headers: h, cache: "no-store" });
    if (q.ok) user = ((await q.json()).value ?? [])[0] ?? null;
  } else return fail(`Microsoft didn't find ${email} (${direct.status}): ${await short(direct)}`);
  if (!user) return fail(`${email} isn't a user in this Microsoft 365 tenant.`);

  const remove = (user.assignedLicenses ?? []).map((l) => l.skuId).filter((id) => copilot.has(id));
  if (!remove.length) return { ok: true, alreadyGone: true, detail: `${email} had no Copilot licence any more.` };
  const res = await fetch(`${G}/users/${user.id}/assignLicense`, { method: "POST", headers: h, body: JSON.stringify({ addLicenses: [], removeLicenses: remove }), cache: "no-store" });
  if (res.status === 403) return fail("Microsoft refused: angar isn't allowed to change licences. Reconnect Microsoft 365 in Sources and approve the licence-management permission.", true);
  if (!res.ok) return fail(`Microsoft didn't remove the licence (${res.status}): ${await short(res)}`);
  return { ok: true, detail: `Copilot licence removed from ${email} in Microsoft 365.` };
}

// ── Google Workspace: licenze aggiuntive Gemini (Licensing API) ──────────
/** Prodotto "Gemini" e SKU aggiuntivi. Senza SKU assegnato Gemini è incluso nel piano Workspace: niente da togliere. */
const GEMINI_PRODUCT = "101047";
const GEMINI_SKUS = ["1010470001", "1010470003", "1010470004", "1010470005"];
export const GOOGLE_LICENSING_SCOPE = "https://www.googleapis.com/auth/apps.licensing";

export async function removeGeminiSeat(credentialsEncrypted: string | null, email: string): Promise<RemovalOutcome> {
  const refresh = decryptJson<{ refreshToken?: string }>(credentialsEncrypted)?.refreshToken;
  if (!refresh) return fail("Google Workspace isn't connected.", true);
  const { googleAccessToken } = await import("@/lib/connectors/google-workspace");
  const token = await googleAccessToken(refresh);
  const base = `https://licensing.googleapis.com/apps/licensing/v1/product/${GEMINI_PRODUCT}/sku`;
  for (const sku of GEMINI_SKUS) {
    const url = `${base}/${sku}/user/${encodeURIComponent(email)}`;
    const got = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (got.status === 404 || got.status === 400) continue; // SKU non assegnato a questa persona
    if (got.status === 401 || got.status === 403) {
      return fail("Google Workspace is connected without licence management. Reconnect it in Sources (a super admin must approve) to remove Gemini seats from angar.", true);
    }
    if (!got.ok) return fail(`Google didn't answer (${got.status}): ${await short(got)}`);
    const del = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!del.ok) return fail(`Google didn't remove the Gemini licence (${del.status}): ${await short(del)}`);
    return { ok: true, detail: `Gemini licence removed from ${email} in Google Workspace.` };
  }
  return fail(`${email} has no separate Gemini licence — Gemini is probably included in your Workspace plan. Remove it in the Google Admin console if needed.`);
}

// ── OpenAI (Admin API) ────────────────────────────────────────────────────
export async function removeOpenAiUser(credentialsEncrypted: string | null, email: string): Promise<RemovalOutcome> {
  const apiKey = decryptJson<{ apiKey?: string }>(credentialsEncrypted)?.apiKey;
  if (!apiKey) return fail("OpenAI isn't connected with an Admin key.", true);
  const h = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  let after: string | undefined;
  let id: string | null = null;
  for (let i = 0; i < 50 && !id; i++) {
    const res = await fetch(`https://api.openai.com/v1/organization/users?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`, { headers: h, cache: "no-store" });
    if (res.status === 401 || res.status === 403) return fail("The OpenAI Admin key can't manage users. Save an Admin key with write access in Sources.", true);
    if (!res.ok) return fail(`OpenAI didn't list the users (${res.status}): ${await short(res)}`);
    const page = await res.json();
    id = (page.data ?? []).find((u: { email?: string }) => u.email?.toLowerCase() === email)?.id ?? null;
    after = page.has_more ? page.last_id : undefined;
    if (!after) break;
  }
  if (!id) return { ok: true, alreadyGone: true, detail: `${email} isn't a member of the OpenAI organization any more.` };
  const del = await fetch(`https://api.openai.com/v1/organization/users/${encodeURIComponent(id)}`, { method: "DELETE", headers: h, cache: "no-store" });
  if (del.status === 401 || del.status === 403) return fail("The OpenAI Admin key is read-only. Save an Admin key with write access in Sources.", true);
  if (!del.ok) return fail(`OpenAI didn't remove the user (${del.status}): ${await short(del)}`);
  return { ok: true, detail: `${email} removed from the OpenAI organization.` };
}

// ── Anthropic (Admin API) ─────────────────────────────────────────────────
export async function removeAnthropicUser(credentialsEncrypted: string | null, email: string): Promise<RemovalOutcome> {
  const apiKey = decryptJson<{ apiKey?: string }>(credentialsEncrypted)?.apiKey;
  if (!apiKey) return fail("Anthropic isn't connected with an Admin key.", true);
  const h = { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  let after: string | undefined;
  let id: string | null = null;
  for (let i = 0; i < 50 && !id; i++) {
    const res = await fetch(`https://api.anthropic.com/v1/organizations/users?limit=100${after ? `&after_id=${encodeURIComponent(after)}` : ""}`, { headers: h, cache: "no-store" });
    if (res.status === 401 || res.status === 403) return fail("The Anthropic Admin key can't manage users. Save a valid Admin key in Sources.", true);
    if (!res.ok) return fail(`Anthropic didn't list the users (${res.status}): ${await short(res)}`);
    const page = await res.json();
    id = (page.data ?? []).find((u: { email?: string }) => u.email?.toLowerCase() === email)?.id ?? null;
    after = page.has_more ? page.last_id : undefined;
    if (!after) break;
  }
  if (!id) return { ok: true, alreadyGone: true, detail: `${email} isn't a member of the Anthropic organization any more.` };
  const del = await fetch(`https://api.anthropic.com/v1/organizations/users/${encodeURIComponent(id)}`, { method: "DELETE", headers: h, cache: "no-store" });
  if (del.status === 401 || del.status === 403) return fail("Anthropic refused: the Admin key can't remove users.", true);
  if (!del.ok) return fail(`Anthropic didn't remove the user (${del.status}): ${await short(del)}`);
  return { ok: true, detail: `${email} removed from the Anthropic organization.` };
}

/**
 * Google Workspace — l'amministratore autorizza angar una volta (OAuth,
 * sola lettura). Dal registro "token" dell'Admin SDK Reports si vede quali
 * app di terze parti gli utenti hanno autorizzato con l'account aziendale
 * ("Accedi con Google"): ChatGPT, Claude, Cursor, Perplexity…
 * Mai email, documenti o chat.
 *
 * Variabili d'ambiente di angar: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
 * Scope: admin.reports.audit.readonly, admin.directory.user.readonly.
 */
import type { Connector, ConnectorSyncResult, ObservedAsset } from "./types";
import { decryptJson } from "@/lib/crypto";
import { matchMerchant } from "@/lib/pricing/merchants";
import { AI_SERVICES } from "@/lib/discovery/catalog";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/admin.reports.audit.readonly",
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "openid",
  "email",
];

export async function googleAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", refresh_token: refreshToken, grant_type: "refresh_token" }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}) — reconnect Google Workspace.`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export const googleWorkspaceConnector: Connector = {
  provider: "GOOGLE_WORKSPACE",

  async sync(row): Promise<ConnectorSyncResult> {
    const refresh = decryptJson<{ refreshToken?: string }>(row.credentialsEncrypted)?.refreshToken;
    if (!refresh) throw new Error("Google Workspace isn't connected — an administrator needs to approve angar first.");
    const token = await googleAccessToken(refresh);
    const warnings: string[] = [];
    const byService = new Map<string, ObservedAsset>();
    const startTime = new Date(Date.now() - 180 * 86400000).toISOString();

    let pageToken: string | undefined;
    let pages = 0;
    do {
      const url = new URL("https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/token");
      url.searchParams.set("startTime", startTime);
      url.searchParams.set("maxResults", "1000");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!res.ok) throw new Error(`Google Reports API → ${res.status} ${(await res.text()).slice(0, 160)}`);
      const json: any = await res.json();
      for (const item of json.items ?? []) {
        const email = String(item.actor?.email ?? "").toLowerCase();
        for (const ev of item.events ?? []) {
          const params = Object.fromEntries((ev.parameters ?? []).map((p: any) => [p.name, p.value ?? p.multiValue]));
          const appName = String(params.app_name ?? "");
          const service = matchMerchant(appName);
          if (!service || !email) continue;
          let a = byService.get(service);
          if (!a) {
            const svc = AI_SERVICES.find((s) => s.id === service);
            a = { externalId: `gw:${service}`, serviceId: service, type: svc?.type ?? "AI_APPLICATION", name: svc?.name ?? appName, vendor: svc?.vendor, users: [], activities: [], connectedSystems: [{ system: "Google Workspace", detail: "Sign in with Google" }] };
            byService.set(service, a);
          }
          if (!a.users!.some((u) => u.email === email)) a.users!.push({ email });
          a.activities!.push({ eventType: `oauth.${ev.name ?? "event"}`, actorRef: email, occurredAt: new Date(item.id?.time ?? Date.now()), payload: { app: appName, scopes: params.scope } });
        }
      }
      pageToken = json.nextPageToken;
    } while (pageToken && ++pages < 10);

    if (byService.size === 0) warnings.push("No AI apps authorised with company Google accounts in the last 6 months.");
    // Un'attività per utente e app è sufficiente: si tengono le più recenti.
    for (const a of byService.values()) a.activities = a.activities!.sort((x, y) => y.occurredAt.getTime() - x.occurredAt.getTime()).slice(0, 200);
    return { provider: "GOOGLE_WORKSPACE", assets: [...byService.values()], syncedAt: new Date(), warnings };
  },
};

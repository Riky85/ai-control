/**
 * Microsoft 365 / Entra ID — app multi-tenant di angar con consenso
 * dell'amministratore del cliente (un clic, sola lettura). Poi, con
 * client-credentials sul tenant del cliente, legge:
 *  - le app aziendali (service principal) riconosciute come AI;
 *  - chi ha dato il consenso a quelle app e i sign-in degli ultimi 30 giorni;
 *  - le licenze Microsoft 365 Copilot (posti acquistati e assegnati) e,
 *    se disponibile, l'uso reale di Copilot per utente.
 *
 * Variabili d'ambiente di angar (non del cliente): MS365_CLIENT_ID, MS365_CLIENT_SECRET.
 * Permessi applicativi dell'app (admin consent): Application.Read.All,
 * Directory.Read.All, AuditLog.Read.All, Reports.Read.All, User.Read.All.
 * Mai email, file o chat.
 */
import type { Connector, ConnectorSyncResult, ObservedAsset } from "./types";
import { decryptJson } from "@/lib/crypto";
import { matchMerchant } from "@/lib/pricing/merchants";
import { AI_SERVICES } from "@/lib/discovery/catalog";
import { USD_TO_EUR, PLANS } from "@/lib/pricing/catalog";

const GRAPH = "https://graph.microsoft.com";

export async function msToken(tenantId: string) {
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS365_CLIENT_ID ?? "",
      client_secret: process.env.MS365_CLIENT_SECRET ?? "",
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Microsoft sign-in failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function graph(token: string, path: string, version = "v1.0") {
  const res = await fetch(path.startsWith("http") ? path : `${GRAPH}/${version}${path}`, { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Graph ${path.split("?")[0]} → ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

async function graphAll(token: string, path: string, maxPages = 10) {
  const out: any[] = [];
  let next: string | undefined = path;
  for (let i = 0; next && i < maxPages; i++) {
    const page: any = await graph(token, next);
    out.push(...(page.value ?? []));
    next = page["@odata.nextLink"];
  }
  return out;
}

export const microsoft365Connector: Connector = {
  provider: "MICROSOFT_365",

  async sync(row): Promise<ConnectorSyncResult> {
    const tenantId = decryptJson<{ tenantId?: string }>(row.credentialsEncrypted)?.tenantId ?? process.env.MS365_TENANT_ID;
    if (!tenantId) throw new Error("Microsoft 365 isn't connected — an administrator needs to approve angar first.");
    const token = await msToken(tenantId);
    const warnings: string[] = [];
    const byService = new Map<string, ObservedAsset>();
    const spToService = new Map<string, string>(); // service principal id → servizio
    const appToService = new Map<string, string>(); // appId → servizio

    const assetFor = (service: string, fallbackName: string, vendor?: string) => {
      let a = byService.get(service);
      if (!a) {
        const svc = AI_SERVICES.find((s) => s.id === service);
        a = { externalId: `ms:${service}`, serviceId: service, type: svc?.type ?? "AI_APPLICATION", name: svc?.name ?? fallbackName, vendor: svc?.vendor ?? vendor, users: [], activities: [], connectedSystems: [{ system: "Microsoft 365", detail: "Entra ID" }] };
        byService.set(service, a);
      }
      return a;
    };

    // 1. App aziendali riconosciute come AI.
    try {
      const sps = await graphAll(token, "/servicePrincipals?$select=id,appId,displayName,publisherName&$top=999");
      for (const sp of sps) {
        const service = matchMerchant(`${sp.displayName ?? ""} ${sp.publisherName ?? ""}`);
        if (!service) continue;
        assetFor(service, sp.displayName, sp.publisherName);
        spToService.set(sp.id, service);
        if (sp.appId) appToService.set(sp.appId, service);
      }
    } catch (err) {
      warnings.push(`Enterprise applications not readable: ${(err as Error).message}`);
    }

    // 2. Chi ha autorizzato quelle app (consenso OAuth) → utenti.
    const userCache = new Map<string, string | null>();
    const emailOf = async (id: string) => {
      if (userCache.has(id)) return userCache.get(id)!;
      try {
        const u = await graph(token, `/users/${id}?$select=mail,userPrincipalName`);
        userCache.set(id, (u.mail ?? u.userPrincipalName ?? null)?.toLowerCase() ?? null);
      } catch {
        userCache.set(id, null);
      }
      return userCache.get(id)!;
    };
    for (const [spId, service] of spToService) {
      try {
        const grants = await graphAll(token, `/servicePrincipals/${spId}/oauth2PermissionGrants`, 3);
        for (const g of grants.filter((g) => g.principalId).slice(0, 200)) {
          const email = await emailOf(g.principalId);
          if (email) assetFor(service, service).users!.push({ email, externalRef: g.principalId });
        }
      } catch {
        /* permesso mancante: si prosegue */
      }
    }

    // 3. Sign-in degli ultimi 30 giorni (serve Entra ID P1 per il log).
    try {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const signIns = await graphAll(token, `/auditLogs/signIns?$filter=createdDateTime ge ${since}&$select=appId,appDisplayName,userPrincipalName,createdDateTime&$top=999`, 5);
      for (const s of signIns) {
        const service = appToService.get(s.appId) ?? matchMerchant(s.appDisplayName ?? "");
        if (!service || !s.userPrincipalName) continue;
        const a = assetFor(service, s.appDisplayName);
        a.users!.push({ email: s.userPrincipalName.toLowerCase(), externalRef: s.userPrincipalName });
        a.activities!.push({ eventType: "signin", actorRef: s.userPrincipalName, occurredAt: new Date(s.createdDateTime) });
      }
    } catch (err) {
      warnings.push(`Sign-in log not available (needs Entra ID P1): ${(err as Error).message.slice(0, 120)}`);
    }

    // 4. Licenze Microsoft 365 Copilot: posti acquistati → costo stimato.
    try {
      const skus = await graphAll(token, "/subscribedSkus");
      const copilot = skus.filter((s) => /copilot/i.test(s.skuPartNumber ?? ""));
      const seats = copilot.reduce((t, s) => t + (s.prepaidUnits?.enabled ?? 0), 0);
      if (seats > 0) {
        const plan = PLANS.find((p) => p.id === "copilot-m365")!;
        const a = assetFor("copilot", "Microsoft 365 Copilot", "Microsoft");
        a.name = "Microsoft 365 Copilot";
        a.seats = seats;
        a.planId = plan.id;
        a.monthlyCost = seats * plan.monthlyUsd * USD_TO_EUR;
        a.costBasis = "estimate";
        a.costNote = `${seats} licences × list price · looks like ${seats} × ${plan.name}`;
      }
    } catch (err) {
      warnings.push(`Licences not readable: ${(err as Error).message.slice(0, 120)}`);
    }

    // 5. Uso reale di Copilot per utente (report, se il tenant lo espone).
    try {
      const rep = await graph(token, "/reports/getMicrosoft365CopilotUsageUserDetail(period='D30')?$format=application/json", "beta");
      const a = byService.get("copilot");
      for (const u of rep.value ?? []) {
        if (!a || !u.userPrincipalName || !u.lastActivityDate) continue;
        a.users!.push({ email: String(u.userPrincipalName).toLowerCase() });
        a.activities!.push({ eventType: "copilot.active", actorRef: u.userPrincipalName, occurredAt: new Date(u.lastActivityDate) });
      }
    } catch {
      /* report non disponibile per questo tenant */
    }

    // Utenti unici per AI.
    for (const a of byService.values()) {
      const seen = new Set<string>();
      a.users = a.users!.filter((u) => (seen.has(u.email) ? false : (seen.add(u.email), true)));
    }
    return { provider: "MICROSOFT_365", assets: [...byService.values()], syncedAt: new Date(), warnings };
  },
};

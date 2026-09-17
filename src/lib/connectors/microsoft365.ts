/**
 * Connettore Microsoft 365 / Entra ID — PRD sezione 5.1.
 *
 * Usa il flusso client-credentials (app-only) di Microsoft Graph: richiede
 * una App Registration in Entra con admin consent concesso sui permessi
 * applicativi elencati sotto. Nessuna interazione utente necessaria dopo
 * il setup iniziale.
 *
 * Variabili d'ambiente richieste:
 *   MS365_TENANT_ID
 *   MS365_CLIENT_ID
 *   MS365_CLIENT_SECRET
 *
 * Permessi applicativi da concedere in Azure AD (admin consent):
 *   Application.Read.All, AuditLog.Read.All, Directory.Read.All
 *   (Reports.Read.All opzionale, dipende dal piano del cliente — vedi §5.1)
 *
 * LIMITE NOTO (da non promettere come coperto): questo connettore vede solo
 * app/utenti/audit del tenant Microsoft gestito. Non fa network-level
 * discovery e non vede l'uso di account AI personali non collegati al
 * tenant — quello è fuori scope MVP1 (vedi PRD §5.1 e roadmap V2).
 */

import type { Connector, ConnectorSyncResult, ObservedAsset } from "./types";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// Elenco di keyword usate per riconoscere, tra le Enterprise Applications del
// tenant, quelle plausibilmente AI-related. E' una euristica configurabile,
// non un dato che Microsoft fornisce già classificato — va mantenuta e
// affinata nel tempo (vedi PRD §5.1: "va poi classificato... tramite una
// lookup table interna che mantenete voi").
const AI_VENDOR_KEYWORDS = [
  "openai",
  "chatgpt",
  "anthropic",
  "claude",
  "gemini",
  "perplexity",
  "copilot",
  "cursor",
  "midjourney",
  "jasper",
  "notion ai",
  "grammarly",
];

async function getAppOnlyToken(): Promise<string> {
  const tenantId = process.env.MS365_TENANT_ID;
  const clientId = process.env.MS365_CLIENT_ID;
  const clientSecret = process.env.MS365_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Microsoft 365 connector not configured: missing MS365_TENANT_ID / MS365_CLIENT_ID / MS365_CLIENT_SECRET"
    );
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    throw new Error(`Microsoft token request fallita: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function graphGet(token: string, path: string) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Graph API ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export const microsoft365Connector: Connector = {
  provider: "MICROSOFT_365",

  async sync(): Promise<ConnectorSyncResult> {
    const warnings: string[] = [];
    const assets: ObservedAsset[] = [];
    const token = await getAppOnlyToken();

    // 1. Service principal (Enterprise Applications) — candidate AI_APPLICATION
    // Richiede Application.Read.All
    // Manteniamo una mappa appId (client id) -> asset osservato, perché il
    // sign-in log (step 2) identifica l'app per appId, non per l'objectId
    // del service principal usato come externalId.
    const assetByAppId = new Map<string, ObservedAsset>();
    try {
      const apps = await graphGet(
        token,
        "/servicePrincipals?$select=id,appId,displayName,publisherName&$top=200"
      );
      for (const sp of apps.value ?? []) {
        const nameLower = `${sp.displayName ?? ""} ${sp.publisherName ?? ""}`.toLowerCase();
        const matched = AI_VENDOR_KEYWORDS.find((kw) => nameLower.includes(kw));
        if (!matched) continue;

        const asset: ObservedAsset = {
          externalId: sp.id,
          type: "AI_APPLICATION",
          name: sp.displayName ?? "Unknown application",
          vendor: sp.publisherName ?? undefined,
          users: [],
          activities: [],
        };
        assets.push(asset);
        if (sp.appId) assetByAppId.set(sp.appId, asset);
      }
    } catch (err) {
      warnings.push(`Unable to read Enterprise Applications: ${(err as Error).message}`);
    }

    // 2. Sign-in audit log — per popolare AiAssetUsage/AiAssetActivity
    // Richiede AuditLog.Read.All. Correlato via appId -> service principal
    // costruito allo step 1 (assetByAppId), non più un TODO.
    try {
      const signIns = await graphGet(
        token,
        "/auditLogs/signIns?$top=200&$select=appId,appDisplayName,userPrincipalName,createdDateTime"
      );
      let matchedCount = 0;
      for (const s of signIns.value ?? []) {
        const asset = assetByAppId.get(s.appId);
        if (!asset) continue; // sign-in di un'app non AI-related: fuori scope qui
        matchedCount++;
        asset.users!.push({ email: s.userPrincipalName, externalRef: s.userPrincipalName });
        asset.activities!.push({
          eventType: "signin",
          actorRef: s.userPrincipalName,
          occurredAt: s.createdDateTime ? new Date(s.createdDateTime) : new Date(),
          payload: s,
        });
      }
      if (matchedCount === 0 && assetByAppId.size > 0) {
        warnings.push(
          "No sign-ins found for the detected AI apps in the window returned by the API (normal if not used recently)."
        );
      }
    } catch (err) {
      warnings.push(`Unable to read sign-in logs: ${(err as Error).message}`);
    }

    // 3. Report Copilot (disponibilità dipende dal piano del cliente — PRD §5.1)
    try {
      await graphGet(token, "/reports/getMicrosoft365CopilotUsageUserDetail(period='D7')");
      warnings.push(
        "Copilot report available for this tenant: parsing not implemented yet (not included in this scaffold)."
      );
    } catch {
      warnings.push(
        "Copilot report not available for this tenant/plan — expected, see PRD §5.1."
      );
    }

    return { provider: "MICROSOFT_365", assets, syncedAt: new Date(), warnings };
  },
};

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
      "Connettore Microsoft 365 non configurato: mancano MS365_TENANT_ID / MS365_CLIENT_ID / MS365_CLIENT_SECRET"
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
    try {
      const apps = await graphGet(
        token,
        "/servicePrincipals?$select=id,appId,displayName,publisherName&$top=200"
      );
      for (const sp of apps.value ?? []) {
        const nameLower = `${sp.displayName ?? ""} ${sp.publisherName ?? ""}`.toLowerCase();
        const matched = AI_VENDOR_KEYWORDS.find((kw) => nameLower.includes(kw));
        if (!matched) continue;

        assets.push({
          externalId: sp.id,
          type: "AI_APPLICATION",
          name: sp.displayName ?? "Unknown application",
          vendor: sp.publisherName ?? undefined,
        });
      }
    } catch (err) {
      warnings.push(`Impossibile leggere le Enterprise Applications: ${(err as Error).message}`);
    }

    // 2. Sign-in audit log — per popolare AiAssetUsage/AiAssetActivity
    // Richiede AuditLog.Read.All. Filtriamo lato client sugli appId già trovati.
    try {
      const signIns = await graphGet(
        token,
        "/auditLogs/signIns?$top=200&$select=appId,appDisplayName,userPrincipalName,createdDateTime"
      );
      const byAppId = new Map(assets.map((a) => [a.externalId, a]));
      for (const s of signIns.value ?? []) {
        // qui l'external id del service principal non coincide direttamente con
        // appId del sign-in log; una implementazione reale dovrebbe mappare
        // appId -> objectId del service principal. Segnaliamo il limite.
        void byAppId;
      }
      warnings.push(
        "Sign-in log letto ma non ancora correlato agli asset per appId->objectId: da rifinire prima della release (vedi TODO nel codice)."
      );
    } catch (err) {
      warnings.push(`Impossibile leggere i sign-in log: ${(err as Error).message}`);
    }

    // 3. Report Copilot (disponibilità dipende dal piano del cliente — PRD §5.1)
    try {
      await graphGet(token, "/reports/getMicrosoft365CopilotUsageUserDetail(period='D7')");
      warnings.push(
        "Report Copilot disponibile per questo tenant: implementare il parsing (non incluso in questo scaffold)."
      );
    } catch {
      warnings.push(
        "Report Copilot non disponibile per questo tenant/piano — atteso, vedi PRD §5.1."
      );
    }

    return { provider: "MICROSOFT_365", assets, syncedAt: new Date(), warnings };
  },
};

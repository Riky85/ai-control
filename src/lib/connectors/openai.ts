/**
 * Connettore OpenAI (ChatGPT Enterprise/Edu) — PRD sezione 5.4.
 *
 * Usa l'Organization Admin API di OpenAI (api.openai.com/v1/organization/...),
 * autenticata con una Admin API key generata a livello di organizzazione
 * (Settings -> Organization -> Admin keys), distinta da una API key di
 * progetto.
 *
 * Variabili d'ambiente richieste:
 *   OPENAI_ADMIN_API_KEY
 *
 * IMPORTANTE — verifica prima del primo uso in produzione: la disponibilità
 * di utenti/audit log via questa API dipende dal piano (Enterprise/Edu) e
 * dai permessi concessi alla Admin key. Se un endpoint non è disponibile
 * per il piano del cliente, questo connettore lo segnala in `warnings`
 * invece di far fallire l'intero sync.
 *
 * LIMITE STRUTTURALE (da non promettere come coperto — PRD §5.4): vede solo
 * l'organizzazione ChatGPT Enterprise/Edu del cliente. Non vede l'uso di
 * account ChatGPT personali/Plus pagati di tasca propria dai dipendenti —
 * quello resta Shadow AI non rilevabile in MVP1 (vale per ogni provider).
 */

import type { Connector, ConnectorSyncResult, ObservedAsset } from "./types";

const API_BASE = "https://api.openai.com/v1";
const ASSET_EXTERNAL_ID = "chatgpt:organization";

async function adminGet(path: string) {
  const apiKey = process.env.OPENAI_ADMIN_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI connector not configured: missing OPENAI_ADMIN_API_KEY");
  }
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`OpenAI Organization API ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export const openaiConnector: Connector = {
  provider: "OPENAI",

  async sync(_connectorRow): Promise<ConnectorSyncResult> {
    const warnings: string[] = [];

    const asset: ObservedAsset = {
      externalId: ASSET_EXTERNAL_ID,
      type: "AI_APPLICATION",
      name: "ChatGPT",
      vendor: "OpenAI",
      users: [],
      activities: [],
    };

    // Membri dell'organizzazione -> AiAssetUsage.
    try {
      let after: string | undefined;
      do {
        const query = after ? `?after=${encodeURIComponent(after)}&limit=100` : "?limit=100";
        const page = await adminGet(`/organization/users${query}`);
        for (const member of page.data ?? []) {
          if (!member.email) continue;
          asset.users!.push({ email: member.email, externalRef: member.id, name: member.name });
        }
        after = page.has_more ? page.last_id : undefined;
      } while (after);
    } catch (err) {
      warnings.push(
        `Unable to read OpenAI organization users (needs Enterprise/Edu with Admin key enabled): ${
          (err as Error).message
        }`
      );
    }

    // Audit log dell'organizzazione -> AiAssetActivity. Endpoint soggetto a
    // disponibilità per piano; trattato come best-effort.
    try {
      const log = await adminGet("/organization/audit_logs?limit=100");
      for (const event of log.data ?? []) {
        asset.activities!.push({
          eventType: event.type ?? "unknown",
          actorRef: event.actor?.session?.user?.email ?? event.actor?.api_key?.id,
          occurredAt: event.effective_at ? new Date(event.effective_at * 1000) : new Date(),
          payload: event,
        });
      }
    } catch (err) {
      warnings.push(
        `Organization audit log not available or plan not enabled: ${(err as Error).message}`
      );
    }

    // Metriche di utilizzo (utenti attivi, volume messaggi) esposte tramite
    // "Workspace Analytics" lato UI Enterprise/Edu — non implementate qui:
    // l'endpoint pubblico corrispondente va verificato contro la
    // documentazione OpenAI corrente prima di aggiungerlo (PRD §5.4).
    warnings.push(
      "Usage metrics (Workspace Analytics: messages, custom GPTs) not yet imported: endpoint needs verifying against current OpenAI documentation."
    );

    return {
      provider: "OPENAI",
      assets: asset.users!.length > 0 ? [asset] : [],
      syncedAt: new Date(),
      warnings,
    };
  },
};

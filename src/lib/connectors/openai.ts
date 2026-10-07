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
import { decryptJson } from "@/lib/crypto";
import { totalsToEur, billingCostNote } from "@/lib/spend/fx";

const API_BASE = "https://api.openai.com/v1";
const ASSET_EXTERNAL_ID = "chatgpt:organization";

// La chiave arriva dalla UI (salvata cifrata sul connettore); la env var
// resta solo come fallback. Passata come parametro, mai in stato di modulo,
// così due organizzazioni che sincronizzano insieme non si scambiano chiavi.
export async function adminGet(path: string, apiKey: string | undefined) {
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

  async sync(connectorRow): Promise<ConnectorSyncResult> {
    const apiKey = decryptJson<{ apiKey: string }>(connectorRow.credentialsEncrypted)?.apiKey ?? process.env.OPENAI_ADMIN_API_KEY;
    const warnings: string[] = [];

    const asset: ObservedAsset = {
      externalId: ASSET_EXTERNAL_ID,
      type: "AI_APPLICATION",
      serviceId: "chatgpt",
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
        const page = await adminGet(`/organization/users${query}`, apiKey);
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
      const log = await adminGet("/organization/audit_logs?limit=100", apiKey);
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

    // Spesa reale ultimi 30 giorni (Costs API: importi in USD, `amount.currency`
    // = "usd"). Convertita in EUR qui, al momento dell'ingest: AiSystemCost è
    // sempre in EUR. L'importo originale resta nella nota del costo.
    try {
      const start = Math.floor(Date.now() / 1000) - 30 * 86400;
      let page: string | undefined;
      const totals = new Map<string, number>();
      let guard = 0;
      do {
        const costs = await adminGet(`/organization/costs?start_time=${start}&bucket_width=1d&limit=31${page ? `&page=${encodeURIComponent(page)}` : ""}`, apiKey);
        for (const bucket of costs.data ?? [])
          for (const r of bucket.results ?? []) {
            const cur = String(r.amount?.currency ?? "USD").toUpperCase();
            totals.set(cur, (totals.get(cur) ?? 0) + (Number(r.amount?.value ?? 0) || 0));
          }
        page = costs.has_more ? costs.next_page : undefined;
      } while (page && ++guard < 5);
      const fx = totalsToEur(totals);
      asset.monthlyCost = fx.eur;
      asset.costNote = billingCostNote("OpenAI billing", fx.original);
      if (fx.unconverted.length) warnings.push(`Amounts in ${fx.unconverted.join(", ")} couldn't be converted to EUR and are shown as they are.`);
    } catch (err) {
      warnings.push(`Costs not available: ${(err as Error).message.slice(0, 160)}`);
    }

    // Uso per modello (Usage API, completions raggruppate per modello): per il grafo
    // dell'AI estate (estate/populate.ts). Solo conteggi di token e richieste.
    try {
      const start = Math.floor(Date.now() / 1000) - 30 * 86400;
      const byModel = new Map<string, { inputTokens: number; outputTokens: number; requests: number }>();
      let page: string | undefined;
      let guard = 0;
      do {
        const usage = await adminGet(`/organization/usage/completions?start_time=${start}&bucket_width=1d&group_by=model&limit=31${page ? `&page=${encodeURIComponent(page)}` : ""}`, apiKey);
        for (const bucket of usage.data ?? [])
          for (const r of bucket.results ?? []) {
            if (!r.model) continue;
            const cur = byModel.get(r.model) ?? { inputTokens: 0, outputTokens: 0, requests: 0 };
            cur.inputTokens += Number(r.input_tokens ?? 0) || 0;
            cur.outputTokens += Number(r.output_tokens ?? 0) || 0;
            cur.requests += Number(r.num_model_requests ?? 0) || 0;
            byModel.set(r.model, cur);
          }
        page = usage.has_more ? usage.next_page : undefined;
      } while (page && ++guard < 5);
      if (byModel.size)
        asset.activities!.push({ eventType: "provider.usage", occurredAt: new Date(), payload: { provider: "openai", days: 30, models: [...byModel].map(([model, v]) => ({ model, ...v })) } });
    } catch (err) {
      warnings.push(`Usage by model not available: ${(err as Error).message.slice(0, 160)}`);
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
      assets: asset.users!.length > 0 || asset.monthlyCost ? [asset] : [],
      syncedAt: new Date(),
      warnings,
    };
  },
};

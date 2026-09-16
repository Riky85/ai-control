/**
 * Connettore Anthropic (Claude) — PRD sezione 5.3.
 *
 * Usa l'Admin API di Anthropic (organizzazione Claude Enterprise/Team con
 * Admin API abilitata), autenticata con una Admin API key (prefisso
 * sk-ant-admin...), distinta da una normale API key.
 *
 * Variabili d'ambiente richieste:
 *   ANTHROPIC_ADMIN_API_KEY
 *
 * IMPORTANTE — verifica prima del primo uso in produzione: gli endpoint
 * dell'Admin API di Anthropic evolvono. Quelli usati qui (v1/organizations/
 * users, v1/organizations/workspaces) sono quelli documentati per la
 * gestione utenti/workspace; se cambiano, questo connettore fallisce con un
 * errore esplicito (mai in silenzio) grazie ai controlli sotto.
 *
 * LIMITE STRUTTURALE (da non promettere come coperto — PRD §5.3): questo
 * connettore vede solo l'organizzazione Claude Enterprise/Team del cliente,
 * MAI il contenuto delle conversazioni. Non vede l'uso di account Claude
 * personali (Free/Pro) pagati di tasca propria dai dipendenti — è
 * strutturalmente lo Shadow AI più interessante ma resta invisibile a
 * qualunque integrazione API ufficiale del vendor (vale per ogni provider,
 * non solo Anthropic). Se il cliente pilota non ha un piano Enterprise/Team
 * con Admin API abilitata, questo connettore sincronizza zero utenti — non
 * è un bug, è il limite descritto nel PRD.
 */

import type { Connector, ConnectorSyncResult, ObservedAsset } from "./types";

const ADMIN_API_BASE = "https://api.anthropic.com/v1";
const ASSET_EXTERNAL_ID = "claude:organization";

async function adminGet(path: string) {
  const apiKey = process.env.ANTHROPIC_ADMIN_API_KEY;
  if (!apiKey) {
    throw new Error("Connettore Anthropic non configurato: manca ANTHROPIC_ADMIN_API_KEY");
  }
  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!res.ok) {
    throw new Error(`Anthropic Admin API ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export const anthropicConnector: Connector = {
  provider: "ANTHROPIC",

  async sync(): Promise<ConnectorSyncResult> {
    const warnings: string[] = [];

    const asset: ObservedAsset = {
      externalId: ASSET_EXTERNAL_ID,
      type: "AI_APPLICATION",
      name: "Claude",
      vendor: "Anthropic",
      users: [],
      activities: [],
    };

    // Membri dell'organizzazione -> AiAssetUsage. Richiede una Admin API key
    // con permesso di lettura utenti.
    try {
      let pageAfter: string | undefined;
      do {
        const query = pageAfter ? `?after_id=${encodeURIComponent(pageAfter)}&limit=100` : "?limit=100";
        const page = await adminGet(`/organizations/users${query}`);
        for (const member of page.data ?? []) {
          if (!member.email) continue;
          asset.users!.push({ email: member.email, externalRef: member.id, name: member.name });
        }
        pageAfter = page.has_more ? page.last_id : undefined;
      } while (pageAfter);
    } catch (err) {
      warnings.push(
        `Impossibile leggere gli utenti dell'organizzazione Claude (serve Enterprise/Team con Admin API abilitata): ${
          (err as Error).message
        }`
      );
    }

    // Non esiste un endpoint pubblico documentato equivalente a un "audit log
    // delle conversazioni": deliberatamente non inventiamo un percorso. Se e
    // quando Anthropic espone un log di audit/accesso per l'Admin API, va
    // aggiunto qui seguendo lo stesso pattern try/catch degli altri connettori.
    warnings.push(
      "Nessun audit log di accesso importato: da collegare quando disponibile un endpoint Admin API dedicato (vedi commento nel codice). Il contenuto delle conversazioni non è comunque mai accessibile via API."
    );

    return {
      provider: "ANTHROPIC",
      assets: asset.users!.length > 0 ? [asset] : [],
      syncedAt: new Date(),
      warnings,
    };
  },
};

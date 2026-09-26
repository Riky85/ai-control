/**
 * Interfaccia comune a tutti i connettori.
 *
 * Un connettore NON scrive mai direttamente nel database: restituisce una
 * lista di "asset osservati" normalizzati, che il layer di upsert
 * (see upsert.ts) trasforma in righe AiAsset/AiAssetUsage/AiAssetActivity.
 * Questo mantiene la logica di persistenza (idempotenza, multi-tenancy)
 * in un unico posto, indipendente da come ciascun provider espone i dati.
 */

import type { AiAssetType, ConnectorProvider, Connector as ConnectorRow } from "@prisma/client";

export interface ObservedUser {
  email: string;
  name?: string;
  department?: string;
  externalRef?: string; // id nativo del provider, per matching cross-connettore
}

export interface ObservedActivity {
  eventType: string; // es. "signin", "pull_request.create", "usage.snapshot"
  actorRef?: string; // email o id utente lato provider
  occurredAt: Date;
  payload?: Record<string, unknown>;
}

export interface ObservedConnectedSystem {
  system: string; // "GitHub", "AWS", "Salesforce"...
  detail?: string; // "repo:production-api"...
}

export interface ObservedAsset {
  externalId: string; // stabile lato provider, usato per l'upsert idempotente
  type: AiAssetType;
  name: string;
  vendor?: string;
  model?: string;
  connectedSystems?: ObservedConnectedSystem[];
  activities?: ObservedActivity[];
  users?: ObservedUser[]; // chi risulta usare/possedere questo asset
  /** Spesa reale degli ultimi 30 giorni letta dalla fatturazione del provider. */
  monthlyCost?: number;
  costNote?: string;
  /** Asset trovati per caso (rete, log): partono "da rivedere". Default: sì. */
  needsReview?: boolean;
}

export interface ConnectorSyncResult {
  provider: ConnectorProvider;
  assets: ObservedAsset[];
  syncedAt: Date;
  warnings: string[]; // es. "report Copilot Studio non disponibile per questo piano"
}

export interface Connector {
  provider: ConnectorProvider;
  /**
   * Esegue una sincronizzazione completa. Riceve la riga Connector dal
   * database — serve ai connettori che hanno credenziali specifiche per
   * organizzazione (es. GitHub: l'installation ID ottenuto dal flusso di
   * installazione dell'app, salvato in credentialsEncrypted) invece che
   * variabili d'ambiente globali condivise da tutti i clienti.
   * Deve essere tollerante a campi mancanti nella risposta del provider
   * (schema-on-read) e non deve mai lanciare per un singolo record
   * malformato: lo salta e lo segnala in `warnings`, senza interrompere
   * l'intero sync.
   */
  sync(connectorRow: ConnectorRow): Promise<ConnectorSyncResult>;
}

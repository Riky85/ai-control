/**
 * Connettore GitHub — PRD sezione 5.2.
 *
 * Usa una GitHub App installata a livello organizzazione (non OAuth
 * personale), per accesso stabile indipendente dal singolo utente.
 *
 * Variabili d'ambiente richieste:
 *   GITHUB_APP_ID
 *   GITHUB_APP_PRIVATE_KEY   (PEM, con newline reali o escaped \n)
 *   GITHUB_APP_INSTALLATION_ID
 *   GITHUB_ORG
 *
 * Permessi GitHub App richiesti: Organization members (read),
 * Organization administration (read), Repository metadata (read).
 *
 * LIMITE NOTO: non vediamo l'uso di tool AI di terze parti non integrati
 * con GitHub (es. Cursor usato localmente). La disponibilità e il formato
 * esatto degli "agentic audit log events" evolve rapidamente lato GitHub:
 * questo connettore tratta ogni payload come schema-on-read (vedi PRD §8).
 */

import { createSign } from "node:crypto";
import type { Connector, ConnectorSyncResult, ObservedAsset } from "./types";

const GITHUB_API = "https://api.github.com";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildAppJwt(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iat: now - 60, exp: now + 9 * 60, iss: appId };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKeyPem.replace(/\\n/g, "\n"));

  return `${signingInput}.${base64url(signature)}`;
}

async function getInstallationToken(): Promise<string> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (!appId || !privateKey || !installationId) {
    throw new Error(
      "Connettore GitHub non configurato: mancano GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY / GITHUB_APP_INSTALLATION_ID"
    );
  }

  const jwt = buildAppJwt(appId, privateKey);
  const res = await fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub installation token fallito: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

async function ghGet(token: string, path: string) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export const githubConnector: Connector = {
  provider: "GITHUB",

  async sync(): Promise<ConnectorSyncResult> {
    const warnings: string[] = [];
    const org = process.env.GITHUB_ORG;
    if (!org) {
      throw new Error("Connettore GitHub non configurato: manca GITHUB_ORG");
    }
    const token = await getInstallationToken();

    const copilotAsset: ObservedAsset = {
      externalId: `github-copilot:${org}`,
      type: "AI_DEV_TOOL",
      name: "GitHub Copilot",
      vendor: "GitHub / Microsoft",
      connectedSystems: [{ system: "GitHub", detail: `org:${org}` }],
      users: [],
      activities: [],
    };

    // Copilot seat/billing info -> chi ha effettivamente un seat attivo
    try {
      const seats = await ghGet(token, `/orgs/${org}/copilot/billing/seats?per_page=100`);
      for (const seat of seats.seats ?? []) {
        const login = seat.assignee?.login;
        if (login) {
          copilotAsset.users!.push({ email: `${login}@users.noreply.github.com`, externalRef: login });
        }
      }
    } catch (err) {
      warnings.push(
        `Impossibile leggere i seat Copilot (serve GitHub Enterprise/Business con Copilot abilitato): ${
          (err as Error).message
        }`
      );
    }

    // Repository dell'org -> connected systems, per il risk factor "produzione"
    const assets: ObservedAsset[] = [copilotAsset];
    try {
      const repos = await ghGet(token, `/orgs/${org}/repos?per_page=100&type=all`);
      for (const repo of repos ?? []) {
        copilotAsset.connectedSystems!.push({
          system: "GitHub",
          detail: `repo:${repo.full_name}${repo.name?.match(/prod/i) ? " (production)" : ""}`,
        });
      }
    } catch (err) {
      warnings.push(`Impossibile leggere i repository dell'org: ${(err as Error).message}`);
    }

    // Eventi "agentic" dall'audit log (schema in evoluzione lato GitHub —
    // trattato come best-effort, il payload grezzo va comunque salvato)
    try {
      const auditLog = await ghGet(
        token,
        `/orgs/${org}/audit-log?per_page=100&phrase=${encodeURIComponent("action:copilot")}`
      );
      for (const event of Array.isArray(auditLog) ? auditLog : []) {
        copilotAsset.activities!.push({
          eventType: event.action ?? "unknown",
          actorRef: event.actor,
          occurredAt: event.created_at ? new Date(event.created_at) : new Date(),
          payload: event,
        });
      }
    } catch (err) {
      warnings.push(
        `Audit log non disponibile o piano non abilitato (richiede GitHub Enterprise Cloud): ${
          (err as Error).message
        }`
      );
    }

    return { provider: "GITHUB", assets, syncedAt: new Date(), warnings };
  },
};

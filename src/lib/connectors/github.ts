/**
 * Connettore GitHub — PRD sezione 5.2.
 *
 * Usa una GitHub App di PIATTAFORMA (una sola, di proprietà nostra — non
 * del cliente) installata sull'organizzazione del cliente tramite il
 * flusso "Connect" reale: il cliente clicca Connect, sceglie la propria
 * org su github.com, e torna qui già collegato. Nessuna password, nessuna
 * chiave API da copiare a mano (vedi /api/connectors/github/install e
 * /callback). L'installation ID risultante è salvato per-organizzazione
 * in Connector.credentialsEncrypted (JSON), non in una env var globale
 * che varrebbe per tutti i clienti.
 *
 * Variabili d'ambiente richieste (di PIATTAFORMA, impostate una sola
 * volta da chi gestisce Angar — mai dal cliente):
 *   GITHUB_APP_ID
 *   GITHUB_APP_PRIVATE_KEY   (PEM, con newline reali o escaped \n)
 *   GITHUB_APP_SLUG          (per costruire il link di installazione)
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

interface GithubCredentials {
  installationId: string;
}

function readCredentials(connectorRow: { credentialsEncrypted: string | null }): GithubCredentials | null {
  if (!connectorRow.credentialsEncrypted) return null;
  try {
    return JSON.parse(connectorRow.credentialsEncrypted) as GithubCredentials;
  } catch {
    return null;
  }
}

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

function buildJwt(): string {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) {
    throw new Error("GitHub connector not configured on this platform: missing GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY");
  }
  return buildAppJwt(appId, privateKey);
}

async function getInstallationToken(installationId: string): Promise<string> {
  const jwt = buildJwt();
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

async function getInstallationOrgLogin(installationId: string): Promise<string> {
  const jwt = buildJwt();
  const res = await fetch(`${GITHUB_API}/app/installations/${installationId}`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(`Unable to read installation details: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { account?: { login?: string } };
  if (!data.account?.login) throw new Error("Installation has no associated organization login.");
  return data.account.login;
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

  async sync(connectorRow): Promise<ConnectorSyncResult> {
    const warnings: string[] = [];
    const creds = readCredentials(connectorRow);
    if (!creds?.installationId) {
      throw new Error("GitHub not connected yet — press Connect and install the app on your organization.");
    }
    const token = await getInstallationToken(creds.installationId);
    const org = await getInstallationOrgLogin(creds.installationId);

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
        `Unable to read Copilot seats (needs GitHub Enterprise/Business with Copilot enabled): ${
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
      warnings.push(`Unable to read org repositories: ${(err as Error).message}`);
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
        `Audit log not available or plan not enabled (requires GitHub Enterprise Cloud): ${
          (err as Error).message
        }`
      );
    }

    return { provider: "GITHUB", assets, syncedAt: new Date(), warnings };
  },
};

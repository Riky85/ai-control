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
 * volta da chi gestisce angar — mai dal cliente):
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
import { decryptJson } from "@/lib/crypto";

// Due modi di collegare GitHub:
//  - GitHub App (installationId): un clic, richiede la configurazione di piattaforma;
//  - token personale di sola lettura (mode "token"): funziona subito.
interface GithubCredentials {
  installationId?: string;
  mode?: "token";
  apiKey?: string;
  org?: string; // organizzazione da scansionare; vuoto = repo personali
}

function readCredentials(connectorRow: { credentialsEncrypted: string | null }): GithubCredentials | null {
  return decryptJson<GithubCredentials>(connectorRow.credentialsEncrypted);
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

// Legge un singolo file da un repo, o null se non esiste — un 404 su
// package.json/requirements.txt e' normalissimo (repo senza quel
// linguaggio), non un errore da segnalare.
async function ghGetFileText(token: string, fullName: string, path: string): Promise<string | null> {
  const res = await fetch(`${GITHUB_API}/repos/${fullName}/contents/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null; // altri errori (rate limit, repo vuoto...): tratta come "non trovato", non bloccare il sync
  const data = (await res.json()) as { content?: string; encoding?: string };
  if (!data.content || data.encoding !== "base64") return null;
  return Buffer.from(data.content, "base64").toString("utf-8");
}

// Firme note di SDK/framework AI — riconoscimento testuale semplice sui
// file di manifest delle dipendenze, non un parser completo. Se il nome
// compare nel file delle dipendenze, e' un'evidenza concreta (il repo
// dichiara quella dipendenza), non un'inferenza.
const AI_SDK_SIGNATURES: { pattern: RegExp; vendor: string | null; label: string }[] = [
  { pattern: /"openai"\s*:/, vendor: "OpenAI", label: "OpenAI SDK (npm)" },
  { pattern: /^openai(?:[=<>~]|$)/m, vendor: "OpenAI", label: "OpenAI SDK (pip)" },
  { pattern: /"@anthropic-ai\/sdk"\s*:/, vendor: "Anthropic", label: "Anthropic SDK (npm)" },
  { pattern: /^anthropic(?:[=<>~]|$)/m, vendor: "Anthropic", label: "Anthropic SDK (pip)" },
  { pattern: /"@google\/generative-ai"\s*:/, vendor: "Google", label: "Google Generative AI SDK (npm)" },
  { pattern: /^google-generativeai(?:[=<>~]|$)/m, vendor: "Google", label: "Google Generative AI SDK (pip)" },
  { pattern: /^boto3(?:[=<>~]|$)/m, vendor: "AWS", label: "boto3 (possible Bedrock)" },
  { pattern: /"langchain"\s*:|^langchain(?:[=<>~]|$)/m, vendor: null, label: "LangChain framework" },
  { pattern: /^llama-index(?:[=<>~]|$)|"llamaindex"\s*:/m, vendor: null, label: "LlamaIndex framework" },
];

interface RepoAiEvidence {
  matches: { label: string; vendor: string | null; file: string }[];
}

async function scanRepoForAiEvidence(token: string, fullName: string): Promise<RepoAiEvidence> {
  const matches: RepoAiEvidence["matches"] = [];
  for (const file of ["package.json", "requirements.txt", "pyproject.toml"]) {
    const text = await ghGetFileText(token, fullName, file);
    if (!text) continue;
    for (const sig of AI_SDK_SIGNATURES) {
      if (sig.pattern.test(text)) {
        matches.push({ label: sig.label, vendor: sig.vendor, file });
      }
    }
  }
  return { matches };
}

export const githubConnector: Connector = {
  provider: "GITHUB",

  async sync(connectorRow): Promise<ConnectorSyncResult> {
    const warnings: string[] = [];
    const creds = readCredentials(connectorRow);
    let token: string;
    let org: string;
    let personal = false;
    if (creds?.mode === "token" && creds.apiKey) {
      token = creds.apiKey;
      if (creds.org) {
        org = creds.org;
      } else {
        org = (await ghGet(token, "/user")).login;
        personal = true;
      }
    } else if (creds?.installationId) {
      token = await getInstallationToken(creds.installationId);
      org = await getInstallationOrgLogin(creds.installationId);
    } else {
      throw new Error("GitHub not connected yet — paste a read-only token in Connections.");
    }

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
    if (!personal) try {
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
    let repos: any[] = [];
    try {
      repos = (await ghGet(token, personal ? `/user/repos?per_page=100&affiliation=owner` : `/orgs/${org}/repos?per_page=100&type=all`)) ?? [];
      for (const repo of repos) {
        copilotAsset.connectedSystems!.push({
          system: "GitHub",
          detail: `repo:${repo.full_name}${repo.name?.match(/prod/i) ? " (production)" : ""}`,
        });
      }
    } catch (err) {
      warnings.push(`Unable to read repositories: ${(err as Error).message}`);
    }

    // Scansione del contenuto dei repo per rilevare SDK/framework AI —
    // evidenza diretta (il file di manifest dichiara la dipendenza), non
    // un'inferenza. Limitata ai 15 repo più recenti per non esaurire la
    // rate limit dell'API su organizzazioni molto grandi.
    const reposToScan = repos
      .slice()
      .sort((a, b) => new Date(b.pushed_at ?? 0).getTime() - new Date(a.pushed_at ?? 0).getTime())
      .slice(0, 15);
    for (const repo of reposToScan) {
      try {
        const evidence = await scanRepoForAiEvidence(token, repo.full_name);
        if (evidence.matches.length === 0) continue;
        const vendor = evidence.matches.find((m) => m.vendor)?.vendor ?? undefined;
        assets.push({
          externalId: `github-discovered:${repo.full_name}`,
          type: "AI_APPLICATION",
          name: repo.name,
          vendor,
          connectedSystems: [{ system: "GitHub", detail: `repo:${repo.full_name}` }],
          users: [],
          activities: [
            {
              eventType: "ai_dependency_detected",
              occurredAt: new Date(),
              payload: {
                repository: repo.full_name,
                detected: evidence.matches,
                note: "Detected from dependency manifest — direct evidence, not an inference.",
              },
            },
          ],
        });
      } catch (err) {
        warnings.push(`Unable to scan ${repo.full_name} for AI dependencies: ${(err as Error).message}`);
      }
    }

    // Eventi "agentic" dall'audit log (schema in evoluzione lato GitHub —
    // trattato come best-effort, il payload grezzo va comunque salvato)
    if (!personal) try {
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

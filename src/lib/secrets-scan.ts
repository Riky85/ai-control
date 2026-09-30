/**
 * Chiavi API di AI finite nel codice (GitHub). Con GitHub collegato, la
 * ricerca del codice di GitHub cerca nei repository dell'organizzazione (o
 * dell'utente) le chiavi di OpenAI, Anthropic, Gemini, xAI, Groq e Hugging
 * Face. Ogni risultato passa da un'espressione regolare sul frammento
 * restituito da GitHub: un nome di variabile senza chiave non è un problema.
 *
 * La chiave intera non viene MAI salvata né mostrata: si tiene solo la
 * versione mascherata (prime 6 + ultime 4). I ritrovamenti sono avvisi
 * (Alert, kind "secret"), senza tabelle nuove: dedupeKey
 * "secret|<mascherata>|<provider>|<repo>|<percorso>" = un avviso per chiave
 * e file, e la data di creazione è "vista la prima volta".
 */
import { db } from "@/lib/db";
import { createAlert } from "@/lib/alerts";

export interface KeyHit {
  provider: string;
  masked: string;
}

export interface SecretFinding extends KeyHit {
  repo: string;
  path: string;
}

// Ordine: i prefissi più specifici prima (sk-ant-, sk-proj- prima di sk-).
const PATTERNS: { provider: string; re: RegExp; context?: RegExp }[] = [
  { provider: "Anthropic", re: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{20,}/g },
  { provider: "OpenAI", re: /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}/g },
  { provider: "OpenAI", re: /\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b/g },
  { provider: "OpenAI", re: /\bsk-[A-Za-z0-9]{40,64}\b/g, context: /openai|gpt|chatgpt/i },
  { provider: "Google Gemini", re: /\bAIza[0-9A-Za-z_-]{35}\b/g, context: /gemini|generativelanguage|genai|google_api_key|palm/i },
  { provider: "xAI", re: /\bxai-[A-Za-z0-9]{40,}\b/g },
  { provider: "Groq", re: /\bgsk_[A-Za-z0-9]{40,}\b/g },
  { provider: "Hugging Face", re: /\bhf_[A-Za-z0-9]{30,}\b/g },
];

// Segnaposto da documentazione: non sono chiavi vere.
const PLACEHOLDER = /x{6,}|\.{3}|your|example|placeholder|dummy|test_?key|<|>|\*{3,}/i;

/** Prime 6 + ultime 4: abbastanza per riconoscerla nella console del fornitore, mai per usarla. */
export function maskKey(key: string): string {
  return key.length <= 12 ? key.slice(0, 3) + "…" : `${key.slice(0, 6)}…${key.slice(-4)}`;
}

/** Chiavi trovate in un testo (già mascherate). `context` = testo intorno, per i prefissi generici. */
export function findKeys(text: string, context = ""): KeyHit[] {
  const out: KeyHit[] = [];
  const seen = new Set<string>();
  const taken: [number, number][] = [];
  for (const p of PATTERNS) {
    if (p.context && !p.context.test(text + " " + context)) continue;
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(text))) {
      const key = m[0];
      const a = m.index;
      const b = a + key.length;
      if (taken.some(([x, y]) => a < y && b > x)) continue;
      if (PLACEHOLDER.test(key) || new Set(key.slice(8)).size < 8) continue; // "sk-aaaa…": finta
      taken.push([a, b]);
      const masked = maskKey(key);
      if (seen.has(masked)) continue;
      seen.add(masked);
      out.push({ provider: p.provider, masked });
    }
  }
  return out;
}

// Ricerche nella code search di GitHub (sintassi classica: parole intere, niente regex).
const QUERIES = ['"sk-ant-api03"', '"sk-proj"', "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "XAI_API_KEY", "GROQ_API_KEY", "HF_TOKEN"];

const GITHUB_API = "https://api.github.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface CodeItem {
  path?: string;
  repository?: { full_name?: string };
  text_matches?: { fragment?: string }[];
}

/**
 * Cerca le chiavi nei repository di `owner` (org o utente). Rispetta i limiti
 * della code search (10 ricerche al minuto): una ricerca alla volta, una pausa
 * tra l'una e l'altra, stop al primo 403/429 o quando il limite è finito.
 */
export async function scanGithubForKeys(token: string, owner: { login: string; personal: boolean }): Promise<{ findings: SecretFinding[]; warnings: string[] }> {
  const findings = new Map<string, SecretFinding>();
  const warnings: string[] = [];
  const scope = owner.personal ? `user:${owner.login}` : `org:${owner.login}`;
  for (let i = 0; i < QUERIES.length; i++) {
    if (i > 0) await sleep(1200);
    const q = `${QUERIES[i]} ${scope}`;
    let res: Response;
    try {
      res = await fetch(`${GITHUB_API}/search/code?q=${encodeURIComponent(q)}&per_page=50`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.text-match+json", "X-GitHub-Api-Version": "2022-11-28" },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      warnings.push(`Code search for exposed AI keys stopped: ${(err as Error).message}`);
      break;
    }
    if (res.status === 403 || res.status === 429) {
      const limited = res.headers.get("x-ratelimit-remaining") === "0" || res.status === 429;
      warnings.push(limited ? "Code search rate limit reached — the rest of the key scan runs at the next sync." : "Code search needs read access to repository contents to look for exposed AI keys.");
      break;
    }
    if (res.status === 422) continue; // org/utente senza codice indicizzato o query non valida: si passa oltre
    if (!res.ok) {
      warnings.push(`Code search for exposed AI keys failed: ${res.status}`);
      break;
    }
    const data = (await res.json().catch(() => ({}))) as { items?: CodeItem[] };
    for (const item of data.items ?? []) {
      const repo = item.repository?.full_name;
      const path = item.path;
      if (!repo || !path) continue;
      for (const tm of item.text_matches ?? []) {
        for (const hit of findKeys(tm.fragment ?? "", `${path} ${QUERIES[i]}`)) {
          findings.set(`${repo}|${path}|${hit.masked}`, { ...hit, repo, path });
        }
      }
    }
    if (res.headers.get("x-ratelimit-remaining") === "0") {
      warnings.push("Code search rate limit reached — the rest of the key scan runs at the next sync.");
      break;
    }
  }
  return { findings: [...findings.values()], warnings };
}

export const secretDedupeKey = (f: SecretFinding) => `secret|${f.masked}|${f.provider}|${f.repo}|${f.path}`;

/** Un avviso critico per chiave e file (una volta sola). Restituisce quanti sono nuovi. */
export async function recordSecretFindings(organizationId: string, findings: SecretFinding[]): Promise<number> {
  let fresh = 0;
  for (const f of findings.slice(0, 100)) {
    const isNew = await createAlert(organizationId, {
      kind: "secret",
      severity: "critical",
      title: `Exposed ${f.provider} key in ${f.repo}`,
      body: `${f.path} contains a ${f.provider} API key (${f.masked}). Revoke the key at the provider, then remove it from the code.`,
      href: "/governance#exposed-keys",
      dedupeKey: secretDedupeKey(f),
    });
    if (isNew) fresh += 1;
  }
  return fresh;
}

export interface ExposedKey extends SecretFinding {
  url: string;
  firstSeen: Date;
}

/** Ritrovamenti salvati (dagli avvisi), i più recenti prima. */
export async function listExposedKeys(organizationId: string): Promise<ExposedKey[]> {
  const rows = await db.alert.findMany({
    where: { organizationId, kind: "secret" },
    orderBy: { createdAt: "desc" },
    select: { dedupeKey: true, createdAt: true },
    take: 200,
  });
  const out: ExposedKey[] = [];
  for (const r of rows) {
    const [tag, masked, provider, repo, ...rest] = r.dedupeKey.split("|");
    const path = rest.join("|");
    if (tag !== "secret" || !masked || !repo || !path) continue;
    const url = `https://github.com/${repo.split("/").map(encodeURIComponent).join("/")}/blob/HEAD/${path.split("/").map(encodeURIComponent).join("/")}`;
    out.push({ masked, provider: provider || "AI", repo, path, url, firstSeen: r.createdAt });
  }
  return out;
}

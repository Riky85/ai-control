/**
 * AWS Bedrock — spesa da Cost Explorer (GetCostAndUsage), firmata a mano con
 * SigV4 (node:crypto, niente AWS SDK).
 *
 * Credenziali (dalla UI, cifrate): access key id + secret di un utente/ruolo
 * IAM con la sola azione ce:GetCostAndUsage. Endpoint fisso us-east-1
 * (Cost Explorer è globale ma risponde solo lì).
 *
 * I modelli di terze parti (Anthropic, Meta…) compaiono come servizi
 * Marketplace separati, es. "Claude 3.5 Sonnet (Amazon Bedrock Edition)":
 * una prima chiamata mensile raggruppata per SERVICE trova i nomi esatti,
 * poi la query giornaliera filtra su quei servizi e raggruppa per USAGE_TYPE.
 */
import { createHash, createHmac } from "crypto";
import { decryptJson } from "@/lib/crypto";
import type { Connector, ConnectorSyncResult } from "./types";
import { TIME_BUDGET_MS, buildCloudResult, fetchWithBackoff, runWindows, type CloudCostRow, type CloudCursor, type PlatformInfo } from "./cloud-ai";

export interface AwsCreds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  cursor?: CloudCursor;
}

const CE_REGION = "us-east-1";
const CE_URL = "https://ce.us-east-1.amazonaws.com/";

export const BEDROCK_INFO: PlatformInfo = {
  provider: "AWS_BEDROCK",
  platform: "Bedrock",
  prefix: "aws",
  billingName: "AWS Cost Explorer",
  services: { bedrock: { name: "Amazon Bedrock", vendor: "AWS" } },
};

export function validateAws(c: Partial<AwsCreds>): string | null {
  if (!c.accessKeyId || !/^(AKIA|ASIA)[A-Z0-9]{12,}$/.test(c.accessKeyId)) return "Access key ID should start with AKIA (or ASIA for temporary keys).";
  if (!c.secretAccessKey || c.secretAccessKey.length < 30) return "Paste the whole secret access key.";
  return null;
}

// ── SigV4 ────────────────────────────────────────────────────────────────

const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const hmac = (key: Buffer | string, s: string) => createHmac("sha256", key).update(s, "utf8").digest();

/** Codifica RFC 3986 come richiesta da SigV4 (anche ! ' ( ) *). */
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function signingKey(secret: string, date: string, region: string, service: string) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), service), "aws4_request");
}

export interface SignInput {
  method: string;
  url: string;
  region: string;
  service: string;
  headers: Record<string, string>;
  body?: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  /** Data della firma (test: fissa). */
  now?: Date;
}

/** Firma una richiesta: restituisce gli header da inviare (con Authorization e X-Amz-Date). */
export function signV4(i: SignInput) {
  const u = new URL(i.url);
  const amzDate = (i.now ?? new Date()).toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20150830T123600Z
  const date = amzDate.slice(0, 8);
  const headers: Record<string, string> = { ...i.headers, host: u.host, "x-amz-date": amzDate };
  if (i.sessionToken) headers["x-amz-security-token"] = i.sessionToken;
  const canonHeaders = Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, " ")] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const signedHeaders = canonHeaders.map(([k]) => k).join(";");
  const query = Array.from(u.searchParams.entries())
    .map(([k, v]) => [enc(k), enc(v)])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const path = u.pathname.split("/").map((p) => enc(decodeURIComponent(p))).join("/") || "/";
  const canonical = [i.method.toUpperCase(), path, query, canonHeaders.map(([k, v]) => `${k}:${v}\n`).join(""), signedHeaders, sha256(i.body ?? "")].join("\n");
  const scope = `${date}/${i.region}/${i.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const signature = createHmac("sha256", signingKey(i.secretAccessKey, date, i.region, i.service)).update(toSign, "utf8").digest("hex");
  const out: Record<string, string> = { ...headers, Authorization: `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
  delete out.host; // lo imposta fetch
  return { headers: out, signature, canonical, toSign };
}

// ── Cost Explorer ────────────────────────────────────────────────────────

const throttled = (status: number, body: string) => status === 400 && /Throttling|LimitExceeded|TooManyRequests/i.test(body);

async function ce(c: AwsCreds, payload: Record<string, unknown>, deadline: number) {
  const body = JSON.stringify(payload);
  const res = await fetchWithBackoff(
    CE_URL,
    () => ({
      method: "POST",
      // Firma rifatta a ogni tentativo: X-Amz-Date deve essere recente.
      headers: signV4({
        method: "POST",
        url: CE_URL,
        region: CE_REGION,
        service: "ce",
        headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "AWSInsightsIndexService.GetCostAndUsage" },
        body,
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey,
        sessionToken: c.sessionToken,
      }).headers,
      body,
    }),
    deadline,
    throttled
  );
  if (res.status === 403 || /AccessDenied|UnrecognizedClient|InvalidSignature|SignatureDoesNotMatch/i.test(res.bodyText)) {
    throw new Error(`AWS denied access (${res.status}): check the keys and that the IAM policy allows ce:GetCostAndUsage. Cost Explorer must also be enabled once in the Billing console.`);
  }
  if (!res.ok) throw new Error(`AWS Cost Explorer → ${res.status} ${res.bodyText.slice(0, 200)}`);
  return JSON.parse(res.bodyText);
}

/** I servizi "Bedrock" (Amazon Bedrock e modelli Marketplace "… (Amazon Bedrock Edition)"). */
export const isBedrockService = (name: string) => /bedrock/i.test(name);

async function bedrockServices(c: AwsCreds, start: string, end: string, deadline: number) {
  const names = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < 10; page++) {
    const j = await ce(c, { TimePeriod: { Start: start, End: end }, Granularity: "MONTHLY", Metrics: ["UnblendedCost"], GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }], ...(token ? { NextPageToken: token } : {}) }, deadline);
    for (const r of j.ResultsByTime ?? []) for (const g of r.Groups ?? []) if (isBedrockService(String(g.Keys?.[0] ?? ""))) names.add(String(g.Keys[0]));
    token = j.NextPageToken;
    if (!token) break;
  }
  return Array.from(names);
}

/** Risposta di GetCostAndUsage (raggruppata per SERVICE, USAGE_TYPE) → righe giornaliere. */
export function parseCostAndUsage(j: any): CloudCostRow[] {
  const out: CloudCostRow[] = [];
  for (const r of j?.ResultsByTime ?? []) {
    const day = String(r.TimePeriod?.Start ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    for (const g of r.Groups ?? []) {
      const [service = "", usageType = ""] = (g.Keys ?? []).map(String);
      const cost = g.Metrics?.UnblendedCost;
      const qty = g.Metrics?.UsageQuantity;
      // Il modello sta nel nome del servizio Marketplace ("Claude … (Amazon Bedrock Edition)") o nello usage type.
      const svcLabel = service.replace(/\s*\(Amazon Bedrock Edition\)\s*/i, "").trim();
      out.push({
        day,
        key: `${service}|${usageType}`,
        label: svcLabel && svcLabel !== "Amazon Bedrock" ? `${svcLabel}, ${usageType}` : usageType || service,
        serviceId: "bedrock",
        amount: Number(cost?.Amount ?? 0),
        currency: String(cost?.Unit ?? "USD"),
        quantity: Number(qty?.Amount ?? 0) || 0,
        unit: qty?.Unit ? String(qty.Unit) : undefined,
      });
    }
  }
  return out;
}

async function queryWindow(c: AwsCreds, start: string, end: string, deadline: number) {
  const services = await bedrockServices(c, start, end, deadline);
  if (!services.length) return [];
  const out: CloudCostRow[] = [];
  let token: string | undefined;
  for (let page = 0; page < 50; page++) {
    const j = await ce(
      c,
      {
        TimePeriod: { Start: start, End: end },
        Granularity: "DAILY",
        Metrics: ["UnblendedCost", "UsageQuantity"],
        Filter: { Dimensions: { Key: "SERVICE", Values: services } },
        GroupBy: [
          { Type: "DIMENSION", Key: "SERVICE" },
          { Type: "DIMENSION", Key: "USAGE_TYPE" },
        ],
        ...(token ? { NextPageToken: token } : {}),
      },
      deadline
    );
    out.push(...parseCostAndUsage(j));
    token = j.NextPageToken;
    if (!token) break;
  }
  return out;
}

export const awsBedrockConnector: Connector = {
  provider: "AWS_BEDROCK",
  async sync(row): Promise<ConnectorSyncResult> {
    const creds = decryptJson<AwsCreds>(row.credentialsEncrypted);
    if (!creds || validateAws(creds)) throw new Error("AWS: keys missing or incomplete — reconnect it.");
    const now = new Date();
    const deadline = Date.now() + TIME_BUDGET_MS;
    const warnings: string[] = [];
    // Cost Explorer conserva 12 mesi di default (14 se attivato): lo storico si ferma lì.
    const { rows, cursor } = await runWindows(now, creds.cursor, deadline, (s, e) => queryWindow(creds, s, e, deadline), warnings, 360);
    return buildCloudResult(BEDROCK_INFO, rows, now, warnings, cursor);
  },
};

/** Prova le chiavi con una chiamata minima (ultimi 2 giorni, mensile). */
export async function testAws(c: AwsCreds) {
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  await ce(c, { TimePeriod: { Start: start, End: end }, Granularity: "MONTHLY", Metrics: ["UnblendedCost"] }, Date.now() + 20_000);
}

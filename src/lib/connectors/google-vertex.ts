/**
 * Google Vertex AI / Gemini API su GCP — spesa dall'export di fatturazione
 * in BigQuery (Cloud Billing non ha un'API di interrogazione semplice).
 *
 * Credenziali (dalla UI, cifrate): JSON di un service account con
 * "BigQuery Data Viewer" sul dataset dell'export e "BigQuery Job User" sul
 * progetto in cui gira la query, più il nome completo della tabella
 * (progetto.dataset.gcp_billing_export_v1_…). Token: JWT firmato con
 * node:crypto (stesso firmatario dello storico email) scambiato con OAuth.
 *
 * Query: costo + crediti per giorno, servizio e SKU, solo servizi AI
 * (Vertex AI, Gemini API e modelli partner "Claude …" del Model Garden).
 */
import { decryptJson } from "@/lib/crypto";
import { googleJwtAssertion, type ServiceAccount } from "./email-history";
import type { Connector, ConnectorSyncResult } from "./types";
import { TIME_BUDGET_MS, buildCloudResult, fetchWithBackoff, runWindows, type CloudCostRow, type CloudCursor, type PlatformInfo } from "./cloud-ai";

export interface GcpCreds {
  serviceAccount: ServiceAccount & { project_id?: string };
  /** progetto.dataset.tabella dell'export standard o dettagliato. */
  table: string;
  /** Località del dataset (EU, US, europe-west1…), facoltativa. */
  location?: string;
  cursor?: CloudCursor;
}

const BQ = "https://bigquery.googleapis.com/bigquery/v2";
const SCOPE = "https://www.googleapis.com/auth/bigquery";
export const TABLE_RE = /^[a-z][a-z0-9-]{4,61}[a-z0-9]\.[A-Za-z0-9_]{1,1024}\.[A-Za-z0-9_$-]{1,1024}$/;

export const VERTEX_INFO: PlatformInfo = {
  provider: "GOOGLE_VERTEX",
  platform: "Vertex AI",
  prefix: "gcp",
  billingName: "Google Cloud billing export",
  services: {
    "vertex-ai": { name: "Vertex AI", vendor: "Google" },
    "gemini-api": { name: "Gemini API", vendor: "Google" },
  },
};

/** Legge e controlla il JSON del service account incollato. */
export function parseServiceAccount(raw: string): (ServiceAccount & { project_id?: string }) | string {
  try {
    const sa = JSON.parse(raw);
    if (sa?.type && sa.type !== "service_account") return "That JSON isn't a service account key.";
    if (!sa?.client_email || !sa?.private_key) return "The JSON needs client_email and private_key — download a new key from IAM → Service accounts → Keys.";
    return { client_email: String(sa.client_email), private_key: String(sa.private_key).replace(/\\n/g, "\n"), client_id: sa.client_id, project_id: sa.project_id };
  } catch {
    return "Paste the whole service account key file (JSON).";
  }
}

export function validateGcp(c: Partial<GcpCreds>): string | null {
  if (!c.serviceAccount?.client_email || !c.serviceAccount.private_key) return "Service account key missing.";
  if (!c.table || !TABLE_RE.test(c.table)) return "Table should look like my-project.billing_export.gcp_billing_export_v1_XXXXXX_XXXXXX_XXXXXX.";
  if (c.location && !/^[A-Za-z0-9-]{2,30}$/.test(c.location)) return "Location should look like EU, US or europe-west1.";
  return null;
}

export async function googleToken(sa: ServiceAccount, deadline: number) {
  const res = await fetchWithBackoff(
    "https://oauth2.googleapis.com/token",
    () => ({
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: googleJwtAssertion(sa, SCOPE) }),
    }),
    deadline
  );
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}): ${/"error_description":\s*"([^"]+)"/.exec(res.bodyText)?.[1] ?? "check the service account key"}.`);
  return (JSON.parse(res.bodyText) as { access_token: string }).access_token;
}

/**
 * SQL della spesa AI. La tabella è validata da TABLE_RE prima di entrare tra
 * backtick (non si può passare come parametro); le date sono parametri.
 */
export function vertexSql(table: string) {
  if (!TABLE_RE.test(table)) throw new Error("Invalid table name.");
  return `SELECT
  FORMAT_DATE('%Y-%m-%d', DATE(usage_start_time)) AS day,
  service.description AS service,
  sku.description AS sku,
  sku.id AS sku_id,
  currency,
  SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS cost,
  SUM(usage.amount_in_pricing_units) AS quantity,
  ANY_VALUE(usage.pricing_unit) AS unit
FROM \`${table}\`
WHERE usage_start_time >= TIMESTAMP(@start) AND usage_start_time < TIMESTAMP(@end)
  AND (service.description IN ('Vertex AI', 'Gemini API', 'Generative Language API')
    OR LOWER(service.description) LIKE '%vertex ai%'
    OR LOWER(service.description) LIKE 'claude%')
GROUP BY day, service, sku, sku_id, currency`;
}

/** Il servizio del catalogo per un servizio di fatturazione GCP. */
export const gcpServiceId = (service: string) => (/gemini api|generative language/i.test(service) ? "gemini-api" : "vertex-ai");

/** Risposta di jobs.query / getQueryResults → righe. */
export function parseBigQuery(j: any): CloudCostRow[] {
  const names: string[] = (j?.schema?.fields ?? []).map((f: any) => String(f.name));
  const out: CloudCostRow[] = [];
  for (const r of j?.rows ?? []) {
    const o: Record<string, string | null> = {};
    (r.f ?? []).forEach((c: any, i: number) => (o[names[i]] = c?.v ?? null));
    const day = String(o.day ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const service = String(o.service ?? "");
    const sku = String(o.sku ?? "");
    out.push({
      day,
      key: `${service}|${o.sku_id ?? sku}`,
      label: /claude/i.test(service) && !/claude/i.test(sku) ? `${service}, ${sku}` : sku || service,
      serviceId: gcpServiceId(service),
      amount: Number(o.cost ?? 0),
      currency: String(o.currency ?? "USD"),
      quantity: Number(o.quantity ?? 0) || 0,
      unit: o.unit ?? undefined,
    });
  }
  return out;
}

async function queryWindow(c: GcpCreds, token: string, start: string, end: string, deadline: number) {
  const project = c.table.split(".")[0];
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const check = (res: { ok: boolean; status: number; bodyText: string }) => {
    if (res.status === 403 || res.status === 401) throw new Error(`Google denied the query (${res.status}): the service account needs "BigQuery Data Viewer" on the export dataset and "BigQuery Job User" on project ${project}.`);
    if (res.status === 404) throw new Error(`Table ${c.table} not found${c.location ? ` in ${c.location}` : ""}: check the name in BigQuery → Billing export.`);
    if (!res.ok) throw new Error(`BigQuery → ${res.status} ${res.bodyText.slice(0, 200)}`);
  };
  const first = await fetchWithBackoff(
    `${BQ}/projects/${encodeURIComponent(project)}/queries`,
    () => ({
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        query: vertexSql(c.table),
        useLegacySql: false,
        parameterMode: "NAMED",
        queryParameters: [
          { name: "start", parameterType: { type: "STRING" }, parameterValue: { value: start } },
          { name: "end", parameterType: { type: "STRING" }, parameterValue: { value: end } },
        ],
        timeoutMs: 20_000,
        maxResults: 5000,
        ...(c.location ? { location: c.location } : {}),
      }),
    }),
    deadline
  );
  check(first);
  let j = JSON.parse(first.bodyText);
  const job = j.jobReference ?? {};
  const out: CloudCostRow[] = [];
  // Job non finito entro timeoutMs, o risultati su più pagine: getQueryResults.
  for (let i = 0; i < 60; i++) {
    if (j.jobComplete !== false) out.push(...parseBigQuery(j));
    const pageToken: string | undefined = j.jobComplete === false ? undefined : j.pageToken;
    if (j.jobComplete !== false && !pageToken) break;
    if (Date.now() > deadline) throw new Error("BigQuery query took too long.");
    const q = new URLSearchParams({ timeoutMs: "10000", maxResults: "5000", ...(pageToken ? { pageToken } : {}), ...(job.location ? { location: job.location } : {}) });
    const res = await fetchWithBackoff(`${BQ}/projects/${encodeURIComponent(job.projectId ?? project)}/queries/${encodeURIComponent(job.jobId)}?${q}`, () => ({ headers: auth }), deadline);
    check(res);
    j = JSON.parse(res.bodyText);
  }
  return out;
}

export const googleVertexConnector: Connector = {
  provider: "GOOGLE_VERTEX",
  async sync(row): Promise<ConnectorSyncResult> {
    const creds = decryptJson<GcpCreds>(row.credentialsEncrypted);
    if (!creds || validateGcp(creds)) throw new Error("Google Cloud: credentials missing or incomplete — reconnect it.");
    const now = new Date();
    const deadline = Date.now() + TIME_BUDGET_MS;
    const warnings: string[] = [];
    const token = await googleToken(creds.serviceAccount, deadline);
    const { rows, cursor } = await runWindows(now, creds.cursor, deadline, (s, e) => queryWindow(creds, token, s, e, deadline), warnings);
    return buildCloudResult(VERTEX_INFO, rows, now, warnings, cursor);
  },
};

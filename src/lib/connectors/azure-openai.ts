/**
 * Azure OpenAI / Azure AI Foundry — spesa dalla Cost Management Query API.
 *
 * Credenziali (dalla UI, cifrate): tenant id, client id, client secret di un
 * service principal con ruolo "Cost Management Reader" sulla sottoscrizione,
 * più l'id della sottoscrizione. Facoltativo: "Monitoring Reader" per i token
 * elaborati (metriche Azure Monitor delle risorse OpenAI); senza, si salta.
 *
 * Query: costo effettivo giornaliero, filtrato sulle categorie dei servizi AI
 * (Cognitive Services, Foundry Models…), raggruppato per risorsa e meter.
 * Si tengono solo le righe dei modelli (OpenAI e modelli di Foundry): Speech,
 * Vision, Translator ecc. sono segnalati in un avviso, non conteggiati.
 */
import { decryptJson } from "@/lib/crypto";
import type { Connector, ConnectorSyncResult } from "./types";
import { TIME_BUDGET_MS, buildCloudResult, fetchWithBackoff, isoDay, modelOf, runWindows, type CloudCostRow, type CloudCursor, type PlatformInfo } from "./cloud-ai";

export interface AzureCreds {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
  cursor?: CloudCursor;
}

const ARM = "https://management.azure.com";
const API_VERSION = "2023-11-01";
const AI_CATEGORIES = ["Cognitive Services", "Foundry Models", "Foundry Tools", "Azure OpenAI", "Azure AI Foundry"];

export const AZURE_INFO: PlatformInfo = {
  provider: "AZURE_OPENAI",
  platform: "Azure",
  prefix: "azure",
  billingName: "Azure Cost Management",
  services: { "azure-openai": { name: "Azure OpenAI", vendor: "Microsoft" } },
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Controllo dei campi prima di qualunque chiamata: errori in linguaggio semplice. */
export function validateAzure(c: Partial<AzureCreds>): string | null {
  if (!c.tenantId || !GUID.test(c.tenantId)) return "Tenant ID should look like 00000000-0000-0000-0000-000000000000.";
  if (!c.clientId || !GUID.test(c.clientId)) return "Client ID (application ID) should look like 00000000-0000-0000-0000-000000000000.";
  if (!c.clientSecret) return "Paste the client secret value (not its ID).";
  if (!c.subscriptionId || !GUID.test(c.subscriptionId)) return "Subscription ID should look like 00000000-0000-0000-0000-000000000000.";
  return null;
}

export async function azureToken(c: AzureCreds, deadline: number) {
  const res = await fetchWithBackoff(
    `https://login.microsoftonline.com/${encodeURIComponent(c.tenantId)}/oauth2/v2.0/token`,
    () => ({
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: c.clientId, client_secret: c.clientSecret, scope: `${ARM}/.default` }),
    }),
    deadline
  );
  if (!res.ok) {
    const code = /AADSTS\d+/.exec(res.bodyText)?.[0];
    throw new Error(`Azure sign-in failed (${res.status}${code ? `, ${code}` : ""}): check tenant ID, client ID and that the secret hasn't expired.`);
  }
  return (JSON.parse(res.bodyText) as { access_token: string }).access_token;
}

/** Il meter appartiene a un modello (OpenAI o Foundry)? Il resto dei servizi AI di Azure no. */
export function isModelMeter(subCategory: string, meter: string, service = "") {
  const t = `${service} ${subCategory} ${meter}`;
  return /openai|foundry models|tokens?\b|\bgpt|\bo[134]\b|dall|whisper|embedding/i.test(t) || Boolean(modelOf(t));
}

/** Righe della Query API (colonne per nome, non per posizione). */
export function parseAzureQuery(json: any): { rows: CloudCostRow[]; skippedOther: number; nextLink?: string } {
  const props = json?.properties ?? {};
  const cols: string[] = (props.columns ?? []).map((c: any) => String(c.name));
  const idx = (...names: string[]) => cols.findIndex((c) => names.some((n) => c.toLowerCase() === n.toLowerCase()));
  const iCost = idx("Cost", "PreTaxCost", "CostInBillingCurrency", "totalCost");
  const iQty = idx("UsageQuantity", "totalQuantity");
  const iDate = idx("UsageDate");
  const iRes = idx("ResourceId");
  const iSub = idx("MeterSubCategory");
  const iMeter = idx("Meter");
  const iSvc = idx("ServiceName");
  const iCur = idx("Currency", "BillingCurrency");
  const rows: CloudCostRow[] = [];
  let skippedOther = 0;
  for (const r of props.rows ?? []) {
    const d = String(r[iDate] ?? "");
    const day = /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const sub = iSub >= 0 ? String(r[iSub] ?? "") : "";
    const meter = iMeter >= 0 ? String(r[iMeter] ?? "") : "";
    const svc = iSvc >= 0 ? String(r[iSvc] ?? "") : "";
    const amount = Number(r[iCost] ?? 0);
    if (!isModelMeter(sub, meter, svc)) {
      skippedOther += Number.isFinite(amount) ? amount : 0;
      continue;
    }
    const resource = iRes >= 0 ? String(r[iRes] ?? "").split("/").pop() ?? "" : "";
    rows.push({
      day,
      key: `${String(r[iRes] ?? "").toLowerCase()}|${sub}|${meter}`,
      label: [meter || sub, resource && `resource ${resource}`].filter(Boolean).join(", "),
      serviceId: "azure-openai",
      amount,
      currency: iCur >= 0 ? String(r[iCur] ?? "USD") : "USD",
      quantity: iQty >= 0 ? Number(r[iQty] ?? 0) || 0 : undefined,
    });
  }
  return { rows, skippedOther, nextLink: props.nextLink || undefined };
}

export function azureQueryBody(start: string, end: string) {
  // "to" è incluso dall'API: si ferma al giorno prima di `end`.
  const to = isoDay(new Date(Date.parse(`${end}T00:00:00Z`) - 1000));
  const inList = (name: string) => ({ dimensions: { name, operator: "In", values: AI_CATEGORIES } });
  return {
    type: "ActualCost",
    timeframe: "Custom",
    timePeriod: { from: `${start}T00:00:00Z`, to: `${to}T23:59:59Z` },
    dataset: {
      granularity: "Daily",
      aggregation: { totalCost: { name: "Cost", function: "Sum" }, totalQuantity: { name: "UsageQuantity", function: "Sum" } },
      grouping: [
        { type: "Dimension", name: "ResourceId" },
        { type: "Dimension", name: "MeterSubCategory" },
        { type: "Dimension", name: "Meter" },
      ],
      filter: { or: [inList("MeterCategory"), inList("ServiceName")] },
    },
  };
}

async function queryWindow(c: AzureCreds, token: string, start: string, end: string, deadline: number, other: { amount: number }) {
  const out: CloudCostRow[] = [];
  let url: string | undefined = `${ARM}/subscriptions/${encodeURIComponent(c.subscriptionId)}/providers/Microsoft.CostManagement/query?api-version=${API_VERSION}`;
  const body = JSON.stringify(azureQueryBody(start, end));
  for (let page = 0; url && page < 50; page++) {
    const res = await fetchWithBackoff(url, () => ({ method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body }), deadline);
    if (res.status === 401 || res.status === 403) throw new Error(`Azure denied access to cost data (${res.status}). Give the app the "Cost Management Reader" role on subscription ${c.subscriptionId}.`);
    if (!res.ok) throw new Error(`Azure Cost Management → ${res.status} ${res.bodyText.slice(0, 200)}`);
    const parsed = parseAzureQuery(JSON.parse(res.bodyText));
    out.push(...parsed.rows);
    other.amount += parsed.skippedOther;
    url = parsed.nextLink;
  }
  return out;
}

/** Token elaborati (ultimi 30 giorni) dalle metriche Azure Monitor: facoltativo, mai bloccante. */
async function tokenMetrics(token: string, resourceIds: string[], deadline: number, warnings: string[]) {
  const out: { resource: string; promptTokens: number; generatedTokens: number }[] = [];
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86400000);
  for (const id of resourceIds.slice(0, 10)) {
    if (Date.now() > deadline - 5000) break;
    const url = `${ARM}${id}/providers/Microsoft.Insights/metrics?api-version=2023-10-01&metricnames=ProcessedPromptTokens,GeneratedTokens&aggregation=Total&interval=P1D&timespan=${start.toISOString()}/${end.toISOString()}`;
    try {
      const res = await fetchWithBackoff(url, () => ({ headers: { Authorization: `Bearer ${token}` } }), deadline);
      if (res.status === 403) {
        warnings.push('Token counts skipped: add the "Monitoring Reader" role if you want them (optional).');
        break;
      }
      if (!res.ok) continue;
      const sum = (name: string) =>
        (JSON.parse(res.bodyText).value ?? [])
          .filter((m: any) => m?.name?.value === name)
          .flatMap((m: any) => m.timeseries ?? [])
          .flatMap((t: any) => t.data ?? [])
          .reduce((s: number, d: any) => s + (Number(d.total) || 0), 0);
      out.push({ resource: id.split("/").pop() ?? id, promptTokens: sum("ProcessedPromptTokens"), generatedTokens: sum("GeneratedTokens") });
    } catch {
      break;
    }
  }
  return out;
}

export const azureOpenAiConnector: Connector = {
  provider: "AZURE_OPENAI",
  async sync(row): Promise<ConnectorSyncResult> {
    const creds = decryptJson<AzureCreds>(row.credentialsEncrypted);
    if (!creds || validateAzure(creds)) throw new Error("Azure: credentials missing or incomplete — reconnect it.");
    const now = new Date();
    const deadline = Date.now() + TIME_BUDGET_MS;
    const warnings: string[] = [];
    const token = await azureToken(creds, deadline);
    const other = { amount: 0 };
    const { rows, cursor } = await runWindows(now, creds.cursor, deadline, (s, e) => queryWindow(creds, token, s, e, deadline, other), warnings);
    if (other.amount > 0.5) warnings.push(`Other Azure AI services (Speech, Vision, Translator…) were found but not counted as model spend.`);
    const result = buildCloudResult(AZURE_INFO, rows, now, warnings, cursor);
    // Token per risorsa, se il ruolo di lettura delle metriche c'è.
    const resources = Array.from(new Set(rows.map((r) => r.key.split("|")[0]).filter((id) => id.includes("/microsoft.cognitiveservices/accounts/"))));
    const tokens = resources.length ? await tokenMetrics(token, resources, deadline, warnings) : [];
    const usage = result.assets[0]?.activities?.[0];
    if (usage && tokens.length) usage.payload = { ...usage.payload, tokens };
    return result;
  },
};

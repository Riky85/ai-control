/**
 * Spesa AI dalle tre piattaforme cloud (Azure OpenAI / AI Foundry, AWS Bedrock,
 * Google Vertex AI / Gemini API): parti comuni ai tre connettori.
 *
 * - Finestra incrementale: il primo sync recupera fino a BACKFILL_DAYS giorni
 *   (a blocchi, dal più recente al più vecchio, entro un tempo massimo); i sync
 *   successivi rileggono solo gli ultimi giorni (la fatturazione cloud si
 *   assesta per qualche giorno) e completano lo storico mancante.
 * - Righe giornaliere → SpendRecord con impronta stabile (piattaforma|giorno|chiave,
 *   SENZA importo): rieseguire il sync aggiorna l'importo, non duplica.
 * - Valuta: convertita in EUR con spend/fx.ts; valuta e importo originali restano
 *   nella descrizione (SpendRecord non ha colonne dedicate).
 * - Modelli → catalogo: l'asset è quello della piattaforma (azure-openai, bedrock,
 *   vertex-ai, gemini-api); il modello e il suo vendor ("Claude via Bedrock")
 *   vanno in `model` e nelle descrizioni degli addebiti.
 */
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { toEur, fxNote, billingCostNote } from "@/lib/spend/fx";
import type { ConnectorProvider } from "@prisma/client";
import type { ConnectorSyncResult, ObservedAsset, ObservedSpend } from "./types";

export const DAY_MS = 86400000;
/** Storico al primo collegamento (Cost Explorer conserva 12 mesi di default). */
export const BACKFILL_DAYS = 365;
/** Giorni riletti a ogni sync: copre il mese per il costo mensile e le rettifiche tardive. */
export const RECENT_DAYS = 35;
/** Giorni prima dell'ultimo cursore riletti comunque (la fatturazione si assesta). */
export const RESTATE_DAYS = 5;
/** Dimensione dei blocchi dello storico. */
export const CHUNK_DAYS = 90;
/** Tempo massimo di un sync (gira dentro una richiesta web o nel job giornaliero). */
export const TIME_BUDGET_MS = 50_000;

export class BudgetExceeded extends Error {}

/** Una riga di costo giornaliera, già normalizzata dal connettore della piattaforma. */
export interface CloudCostRow {
  day: string; // YYYY-MM-DD (UTC)
  /** Chiave stabile della riga nel giorno: risorsa/meter, usage type, SKU. */
  key: string;
  /** Testo da cui riconoscere il modello (meter, usage type, SKU, servizio). */
  label: string;
  /** Servizio del catalogo a cui va la riga (azure-openai, bedrock, vertex-ai, gemini-api). */
  serviceId: string;
  amount: number;
  currency: string;
  quantity?: number;
  unit?: string;
}

export interface CloudCursor {
  /** Giorno più vecchio già letto (incluso). */
  from: string;
  /** Giorno più recente già letto (escluso: è "oggi" del sync precedente). */
  to: string;
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS));
const minDay = (a: string, b: string) => (a < b ? a : b);
const maxDay = (a: string, b: string) => (a > b ? a : b);

/**
 * Finestre da leggere, in ordine: prima la recente (serve al costo mensile),
 * poi lo storico mancante a blocchi dal più recente al più vecchio.
 * Ogni finestra è [start, end) in giorni UTC.
 */
export function planWindows(now: Date, cursor: CloudCursor | null | undefined, backfillDays = BACKFILL_DAYS): { start: string; end: string; backfill: boolean }[] {
  const today = isoDay(now);
  const end = addDays(today, 1); // oggi incluso (parziale)
  const target = addDays(today, -backfillDays);
  let recentStart = addDays(today, -RECENT_DAYS);
  if (cursor?.to) recentStart = minDay(recentStart, addDays(cursor.to, -RESTATE_DAYS));
  recentStart = maxDay(recentStart, target);
  const out = [{ start: recentStart, end, backfill: false }];
  // Storico: da dove arriva già il cursore (o dall'inizio della finestra recente) fino a target.
  let older = cursor?.from ? minDay(cursor.from, recentStart) : recentStart;
  while (older > target) {
    const start = maxDay(addDays(older, -CHUNK_DAYS), target);
    out.push({ start, end: older, backfill: true });
    older = start;
  }
  return out;
}

/** Nuovo cursore dopo le finestre effettivamente completate. */
export function nextCursor(done: { start: string; end: string }[], prev: CloudCursor | null | undefined): CloudCursor | undefined {
  if (!done.length) return prev ?? undefined;
  const from = done.reduce((m, w) => minDay(m, w.start), prev?.from ?? done[0].start);
  const to = done.reduce((m, w) => maxDay(m, w.end), prev?.to ?? done[0].end);
  return { from, to };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Attesa suggerita dal provider (Retry-After in secondi o data), altrimenti backoff esponenziale. */
export function retryAfterMs(headers: Headers, attempt: number) {
  for (const h of ["retry-after", "x-ms-ratelimit-microsoft.costmanagement-qpu-retry-after", "x-ms-ratelimit-microsoft.costmanagement-entity-retry-after", "x-ms-ratelimit-microsoft.costmanagement-tenant-retry-after"]) {
    const v = headers.get(h);
    if (!v) continue;
    const s = Number(v);
    if (Number.isFinite(s) && s >= 0) return Math.min(s, 60) * 1000;
    const at = Date.parse(v);
    if (Number.isFinite(at)) return Math.max(0, Math.min(at - Date.now(), 60_000));
  }
  return Math.min(2 ** attempt * 1000, 20_000);
}

/**
 * fetch con ritentativi su limiti di frequenza / errori temporanei e tempo massimo.
 * `throttled` permette ai provider di riconoscere i propri limiti (AWS: 400 ThrottlingException).
 */
export async function fetchWithBackoff(
  url: string,
  init: () => RequestInit,
  deadline: number,
  throttled: (status: number, body: string) => boolean = () => false
): Promise<Response & { bodyText: string }> {
  for (let attempt = 0; ; attempt++) {
    if (Date.now() > deadline) throw new BudgetExceeded("time budget");
    const res = await fetch(url, { ...init(), cache: "no-store" });
    const bodyText = await res.text().catch(() => "");
    const retry = res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504 || throttled(res.status, bodyText);
    if (!retry || attempt >= 4) return Object.assign(res, { bodyText });
    const wait = retryAfterMs(res.headers, attempt);
    if (Date.now() + wait > deadline) throw new BudgetExceeded("throttled past the time budget");
    await sleep(wait);
  }
}

// ── Modelli → vendor del modello (per "Claude via Bedrock", "gpt-4o via Azure") ──

const MODEL_RULES: [RegExp, string, (m: RegExpMatchArray) => string][] = [
  [/\bclaude[\s-]*((?:\d(?:[.\s-]\d)?\s*)?(?:opus|sonnet|haiku|instant)(?:[\s-]*\d(?:[.\s-]\d)?)?|\d(?:\.\d)?)/i, "Anthropic", (m) => `Claude ${m[1].replace(/[-\s]+/g, " ").trim()}`],
  [/\b(gpt[\s-]?\d(?:\.\d)?o?(?:[\s-](?:mini|nano|turbo|pro|realtime|audio|transcribe))?)/i, "OpenAI", (m) => m[1].toLowerCase().replace(/\s+/g, "-").replace(/^gpt-?/, "gpt-")],
  [/\b(o[134](?:[\s-](?:mini|pro|preview))?)\b/i, "OpenAI", (m) => m[1].toLowerCase().replace(/\s+/g, "-")],
  [/\b(dall[\s-]?e[\s-]?\d|whisper|tts(?:[\s-]hd)?|sora|text[\s-]embedding[\w\s-]*?(?=\s|$)|ada)\b/i, "OpenAI", (m) => m[1].toLowerCase().replace(/\s+/g, "-")],
  [/\b(gemini[\s-]*\d(?:\.\d)?(?:[\s-]*(?:pro|flash(?:[\s-]lite)?|ultra|nano))?)/i, "Google", (m) => m[1].replace(/[-\s]+/g, " ").replace(/^gemini/i, "Gemini")],
  [/\b(imagen[\s-]*\d?|veo[\s-]*\d?|chirp|gemma[\s-]*\d?)/i, "Google", (m) => m[1].replace(/[-\s]+/g, " ").trim()],
  [/\b(llama[\s-]*\d(?:\.\d)?)/i, "Meta", (m) => m[1].replace(/[-\s]+/g, " ").replace(/^llama/i, "Llama")],
  [/\b(mistral[\s-]*(?:large|medium|small|7b)?|mixtral|pixtral|codestral|ministral)/i, "Mistral", (m) => m[1].replace(/[-\s]+/g, " ").trim()],
  [/\b(command[\s-]?r\+?|cohere|embed[\s-]english|rerank)/i, "Cohere", (m) => m[1].replace(/[-\s]+/g, " ").trim()],
  [/\b(nova[\s-]*(?:micro|lite|pro|premier|canvas|reel|sonic)?|titan)/i, "Amazon", (m) => m[1].replace(/[-\s]+/g, " ").replace(/^nova/i, "Nova").replace(/^titan/i, "Titan").trim()],
  [/\b(jamba|jurassic)/i, "AI21", (m) => m[1]],
  [/\b(deepseek[\s-]*(?:r1|v3)?)/i, "DeepSeek", (m) => m[1].replace(/[-\s]+/g, " ").trim()],
  [/\b(grok[\s-]*\d?)/i, "xAI", (m) => m[1].replace(/[-\s]+/g, " ").trim()],
  [/\b(phi[\s-]*\d(?:\.\d)?)/i, "Microsoft", (m) => m[1].replace(/[-\s]+/g, "-")],
  [/\b(stable[\s-]?diffusion|sdxl|stability)/i, "Stability AI", (m) => m[1]],
  [/\b(writer|palmyra)/i, "Writer", (m) => m[1]],
];

/** Modello e vendor del modello da un testo di fatturazione (meter, usage type, SKU). */
export function modelOf(text: string): { model: string; vendor: string } | null {
  const t = text.replace(/_/g, " ");
  for (const [re, vendor, name] of MODEL_RULES) {
    const m = t.match(re);
    if (m) return { model: name(m), vendor };
  }
  return null;
}

// ── Da righe di costo a risultato del sync ──────────────────────────────────

export interface PlatformInfo {
  provider: ConnectorProvider;
  /** "Azure", "Bedrock", "Vertex AI": compare in "Claude via Bedrock". */
  platform: string;
  /** Prefisso dell'impronta degli addebiti e dell'externalId. */
  prefix: string;
  /** Nome della fonte nella nota del costo. */
  billingName: string;
  /** Nome e vendor dell'asset di ogni servizio del catalogo. */
  services: Record<string, { name: string; vendor: string }>;
}

export const spendFingerprint = (prefix: string, day: string, key: string) => `${prefix}:${day}:${createHash("sha1").update(key).digest("hex").slice(0, 20)}`;

/** Testo dell'addebito: modello (e chi lo fa) via piattaforma, poi la voce di fatturazione. */
export function describeRow(row: CloudCostRow, platform: string) {
  const m = modelOf(row.label);
  const head = m ? `${m.model} (${m.vendor} via ${platform})` : platform;
  return `${head} — ${row.label}`.slice(0, 180);
}

/**
 * Raggruppa le righe per servizio del catalogo: un asset per servizio, con
 * spesa degli ultimi 30 giorni in EUR, modelli principali e addebiti giornalieri.
 */
export function buildCloudResult(info: PlatformInfo, rows: CloudCostRow[], now: Date, warnings: string[], cursor?: CloudCursor): ConnectorSyncResult {
  const since30 = isoDay(new Date(now.getTime() - 30 * DAY_MS));
  // Stessa chiave nello stesso giorno (es. pagine diverse, crediti separati): si sommano.
  const merged = new Map<string, CloudCostRow>();
  for (const r of rows) {
    if (!Number.isFinite(r.amount)) continue;
    const id = `${r.serviceId}|${r.day}|${r.key}|${r.currency}`;
    const prev = merged.get(id);
    if (prev) {
      prev.amount += r.amount;
      prev.quantity = (prev.quantity ?? 0) + (r.quantity ?? 0);
    } else merged.set(id, { ...r });
  }

  const byService = new Map<string, CloudCostRow[]>();
  for (const r of Array.from(merged.values())) byService.set(r.serviceId, [...(byService.get(r.serviceId) ?? []), r]);

  const unconverted = new Set<string>();
  const assets: ObservedAsset[] = [];
  for (const [serviceId, list] of Array.from(byService.entries())) {
    const svc = info.services[serviceId] ?? { name: info.platform, vendor: info.platform };
    const spend: ObservedSpend[] = [];
    let monthEur = 0;
    const original = new Map<string, number>();
    const models = new Map<string, { eur: number; quantity: number; unit?: string; vendor: string }>();
    for (const r of list) {
      const fx = toEur(r.amount, r.currency);
      if (!fx.convertible) unconverted.add(fx.currency);
      const eur = Math.round(fx.eur * 100) / 100;
      if (r.day >= since30) {
        monthEur += fx.eur;
        original.set(fx.currency, (original.get(fx.currency) ?? 0) + r.amount);
        const m = modelOf(r.label);
        const k = m ? m.model : "Other usage";
        const cur = models.get(k) ?? { eur: 0, quantity: 0, unit: r.unit, vendor: m?.vendor ?? svc.vendor };
        cur.eur += fx.eur;
        cur.quantity += r.quantity ?? 0;
        models.set(k, cur);
      }
      // Righe a zero (crediti che pareggiano, prove gratuite): niente addebito.
      if (Math.abs(eur) < 0.005) continue;
      spend.push({
        fingerprint: spendFingerprint(info.prefix, r.day, `${serviceId}|${r.key}|${r.currency}`),
        date: new Date(`${r.day}T12:00:00Z`),
        amountEur: eur,
        description: `${describeRow(r, info.platform)}${fxNote(r.amount, fx)}`.slice(0, 200),
      });
    }
    const top = Array.from(models.entries()).filter(([k]) => k !== "Other usage").sort((a, b) => b[1].eur - a[1].eur);
    const origText = Array.from(original.entries()).filter(([c]) => c !== "EUR").map(([c, v]) => `${c} ${v.toFixed(2)}`).join(", ");
    assets.push({
      externalId: `${info.prefix}:${serviceId}`,
      type: "AI_API",
      serviceId,
      name: svc.name,
      vendor: svc.vendor,
      model: top.slice(0, 3).map(([k, v]) => (v.vendor === svc.vendor || (serviceId === "azure-openai" && v.vendor === "OpenAI") ? k : `${k} (${v.vendor})`)).join(", ") || undefined,
      monthlyCost: Math.round(monthEur * 100) / 100,
      costBasis: "billing_connector",
      costNote: billingCostNote(info.billingName, origText),
      spend,
      activities: [
        {
          eventType: "cloud.usage",
          occurredAt: now,
          payload: {
            platform: info.platform,
            days: 30,
            models: Array.from(models.entries())
              .sort((a, b) => b[1].eur - a[1].eur)
              .slice(0, 25)
              .map(([model, v]) => ({ model, vendor: v.vendor, eur: Math.round(v.eur * 100) / 100, quantity: Math.round(v.quantity * 1000) / 1000, unit: v.unit ?? null })),
          },
        },
      ],
      // Collegato da un admin sul proprio account cloud: è uso ufficiale.
      needsReview: false,
    });
  }
  if (unconverted.size) warnings.push(`Amounts in ${Array.from(unconverted).join(", ")} couldn't be converted to EUR and are shown as they are.`);
  if (!assets.length) warnings.push(`No AI spend found in ${info.billingName} for the period read.`);
  return { provider: info.provider, assets, syncedAt: now, warnings, ...(cursor ? { cursor: cursor as unknown as Record<string, unknown> } : {}) };
}

/**
 * Esegue le finestre pianificate entro il tempo massimo. La finestra recente
 * è obbligatoria (errore = sync fallito); lo storico si ferma al primo
 * problema e riprende al sync successivo.
 */
export async function runWindows(
  now: Date,
  cursor: CloudCursor | null | undefined,
  deadline: number,
  fetchWindow: (start: string, end: string) => Promise<CloudCostRow[]>,
  warnings: string[],
  backfillDays = BACKFILL_DAYS
) {
  const rows: CloudCostRow[] = [];
  const done: { start: string; end: string }[] = [];
  for (const w of planWindows(now, cursor, backfillDays)) {
    try {
      rows.push(...(await fetchWindow(w.start, w.end)));
      done.push(w);
    } catch (err) {
      if (!w.backfill) throw err;
      warnings.push(
        err instanceof BudgetExceeded
          ? `History before ${w.end} not read yet: it continues on the next sync.`
          : `History before ${w.end} not read: ${(err as Error).message.slice(0, 160)}. It is retried on the next sync.`
      );
      break;
    }
  }
  // Il cursore "from" avanza solo su blocchi contigui alla finestra recente.
  return { rows, cursor: nextCursor(done, cursor) };
}

// ── Scrittura degli addebiti (chiamata da upsert.ts) ────────────────────────

/** Cosa creare e cosa aggiornare: pura, così si prova senza database. */
export function planSpendWrites(
  existing: { id: string; fingerprint: string; amountEur: number; description: string; aiAssetId: string | null }[],
  incoming: ObservedSpend[],
  aiAssetId: string
) {
  const byFp = new Map(existing.map((e) => [e.fingerprint, e]));
  const seen = new Set<string>();
  const create: ObservedSpend[] = [];
  const update: { id: string; amountEur: number; description: string }[] = [];
  for (const s of incoming) {
    if (seen.has(s.fingerprint)) continue;
    seen.add(s.fingerprint);
    const e = byFp.get(s.fingerprint);
    if (!e) create.push(s);
    else if (Math.abs(e.amountEur - s.amountEur) >= 0.005 || e.description !== s.description || e.aiAssetId !== aiAssetId) update.push({ id: e.id, amountEur: s.amountEur, description: s.description });
  }
  return { create, update };
}

export async function saveCloudSpend(organizationId: string, aiAssetId: string, service: string, spend: ObservedSpend[]) {
  let created = 0;
  let updated = 0;
  for (let i = 0; i < spend.length; i += 1000) {
    const part = spend.slice(i, i + 1000);
    const existing = await db.spendRecord.findMany({
      where: { organizationId, fingerprint: { in: part.map((s) => s.fingerprint) } },
      select: { id: true, fingerprint: true, amountEur: true, description: true, aiAssetId: true },
    });
    const plan = planSpendWrites(existing, part, aiAssetId);
    if (plan.create.length) {
      const r = await db.spendRecord.createMany({
        data: plan.create.map((s) => ({ organizationId, aiAssetId, service, source: "cloud", date: s.date, amountEur: s.amountEur, description: s.description, fingerprint: s.fingerprint })),
        skipDuplicates: true,
      });
      created += r.count;
    }
    for (const u of plan.update) {
      await db.spendRecord.update({ where: { id: u.id }, data: { amountEur: u.amountEur, description: u.description, aiAssetId } });
      updated++;
    }
  }
  return { created, updated };
}

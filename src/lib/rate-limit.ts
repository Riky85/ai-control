/**
 * Limite di richieste in memoria (token bucket per chiave). Basta per un solo
 * processo (Railway): con più repliche ogni replica ha il suo secchio, quindi il
 * limite reale è N × limite — accettabile per frenare abusi e script.
 */
type Bucket = { tokens: number; at: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

/**
 * true = richiesta ammessa. `limit` richieste per `windowMs`, ricaricate in modo
 * continuo (60/min = una al secondo, con una raffica iniziale fino a 60).
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now, windowMs);
  const rate = limit / windowMs;
  const b = buckets.get(key) ?? { tokens: limit, at: now };
  b.tokens = Math.min(limit, b.tokens + (now - b.at) * rate);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

/** Secondi da attendere (per l'header Retry-After), almeno 1. */
export function retryAfter(limit: number, windowMs: number): number {
  return Math.max(1, Math.ceil(windowMs / limit / 1000));
}

// Ogni tanto si buttano i secchi pieni (chiavi inattive): la mappa non cresce all'infinito.
function sweep(now: number, windowMs: number) {
  if (now - lastSweep < 60_000 && buckets.size < 50_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (now - b.at > Math.max(windowMs, 3_600_000)) buckets.delete(k);
}

/**
 * IP del client dietro al proxy di Railway. Il proxy AGGIUNGE in fondo a
 * x-forwarded-for l'IP reale da cui riceve la connessione: le voci a sinistra
 * le può scrivere chiunque, quindi si prende l'ultima (mai la prima).
 */
export function clientIp(h: { get(name: string): string | null }): string {
  const xff = h.get("x-forwarded-for");
  const last = xff?.split(",").map((x) => x.trim()).filter(Boolean).pop();
  return last || h.get("x-real-ip")?.trim() || "unknown";
}

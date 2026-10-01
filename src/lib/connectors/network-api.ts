// Utilità comuni ai connettori dei log di rete via API (Cloudflare Gateway, Cisco Umbrella).
import type { ImportHit } from "@/lib/edge/log-import";

export class NetworkApiError extends Error {
  /** Credenziali rifiutate: inutile riprovare finché qualcuno non le cambia. */
  auth: boolean;
  constructor(message: string, auth = false) {
    super(message);
    this.auth = auth;
  }
}

/** Tempo massimo di un sync (timestamp in ms). */
export interface Budget {
  deadline: number;
}

export interface DayHits {
  hits: { hit: ImportHit; count: number }[];
  /** Richieste DNS totali nella finestra (tutte, non solo AI), per le statistiche. */
  lines: number;
  warnings: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429: aspetta quanto chiede Retry-After (al massimo 30 s) se il tempo del sync lo consente. */
export async function waitForRetry(res: Response, budget: Budget): Promise<boolean> {
  const h = res.headers.get("retry-after");
  const sec = h && /^\d+$/.test(h.trim()) ? Number(h) : h ? Math.max(0, (Date.parse(h) - Date.now()) / 1000) : 5;
  const ms = Math.min(Math.max(sec, 1), 30) * 1000;
  if (Date.now() + ms + 5_000 > budget.deadline) return false;
  await sleep(ms);
  return true;
}

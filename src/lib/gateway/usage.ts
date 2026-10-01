/**
 * angar Gateway — lettura dell'uso (token) dalle risposte, senza toccarle (puro).
 *
 * - Risposta JSON: campo `usage` (OpenAI: prompt_tokens / completion_tokens;
 *   Anthropic: input_tokens / output_tokens + token di cache).
 * - Streaming SSE: i blocchi passano al client così come arrivano; qui si
 *   leggono solo le righe "data:" complete. OpenAI manda l'uso nell'ultimo
 *   blocco (con stream_options.include_usage); Anthropic in message_start
 *   (ingresso) e message_delta (uscita, cumulativa).
 * Il testo generato non viene mai conservato: si guarda solo `usage` e `model`.
 */
import type { Usage } from "./cost";

export type GatewayProvider = "openai" | "anthropic";

export interface UsageResult extends Usage {
  model: string | null;
  /** true se l'uso è stato letto davvero (non stimato a zero). */
  seen: boolean;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);

function openaiUsage(u: any): Usage | null {
  if (!u || typeof u !== "object") return null;
  return { inputTokens: num(u.prompt_tokens ?? u.input_tokens), outputTokens: num(u.completion_tokens ?? u.output_tokens) };
}

function anthropicUsage(u: any): Usage | null {
  if (!u || typeof u !== "object") return null;
  return {
    inputTokens: num(u.input_tokens),
    outputTokens: num(u.output_tokens),
    cacheWriteTokens: num(u.cache_creation_input_tokens),
    cacheReadTokens: num(u.cache_read_input_tokens),
  };
}

/** Uso da una risposta JSON completa (non streaming). */
export function usageFromJson(provider: GatewayProvider, body: unknown): UsageResult {
  const b = (body ?? {}) as any;
  const u = provider === "openai" ? openaiUsage(b.usage) : anthropicUsage(b.usage);
  return { inputTokens: 0, outputTokens: 0, ...(u ?? {}), model: typeof b.model === "string" ? b.model : null, seen: Boolean(u) };
}

/**
 * Lettore incrementale di uno stream SSE: push() con i byte così come passano,
 * result() alla fine. Tiene in memoria solo l'ultima riga incompleta (al massimo
 * 1 MB: una riga più lunga viene scartata, non si accumula il corpo).
 */
export function createUsageTap(provider: GatewayProvider) {
  const decoder = new TextDecoder();
  let buf = "";
  const r: UsageResult = { inputTokens: 0, outputTokens: 0, model: null, seen: false };
  const MAX_LINE = 1_000_000;

  const onData = (data: string) => {
    if (!data || data === "[DONE]") return;
    // Solo i blocchi che possono contenere l'uso: niente parse di ogni delta di testo.
    if (provider === "openai" && !data.includes('"usage"') && r.model) return;
    if (provider === "anthropic" && !/"type"\s*:\s*"message_(start|delta)"/.test(data)) return;
    let ev: any;
    try {
      ev = JSON.parse(data);
    } catch {
      return;
    }
    if (provider === "openai") {
      if (typeof ev.model === "string" && !r.model) r.model = ev.model;
      const u = openaiUsage(ev.usage);
      if (u) {
        r.inputTokens = u.inputTokens;
        r.outputTokens = u.outputTokens;
        r.seen = true;
      }
      return;
    }
    if (ev.type === "message_start") {
      const m = ev.message ?? {};
      if (typeof m.model === "string") r.model = m.model;
      const u = anthropicUsage(m.usage);
      if (u) {
        r.inputTokens = u.inputTokens;
        r.outputTokens = u.outputTokens;
        r.cacheWriteTokens = u.cacheWriteTokens;
        r.cacheReadTokens = u.cacheReadTokens;
        r.seen = true;
      }
    } else if (ev.type === "message_delta" && ev.usage) {
      // output_tokens in message_delta è cumulativo; input può comparire di nuovo (server tools).
      if (typeof ev.usage.output_tokens === "number") r.outputTokens = num(ev.usage.output_tokens);
      if (typeof ev.usage.input_tokens === "number" && ev.usage.input_tokens > 0) r.inputTokens = num(ev.usage.input_tokens);
      r.seen = true;
    }
  };

  const lines = (text: string) => {
    buf += text;
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      if (line.startsWith("data:")) onData(line.slice(5).trim());
    }
    if (buf.length > MAX_LINE) buf = "";
  };

  return {
    push(chunk: Uint8Array) {
      lines(decoder.decode(chunk, { stream: true }));
    },
    result(): UsageResult {
      lines(decoder.decode() + "\n");
      return { ...r };
    },
  };
}

/**
 * Lettore di una risposta JSON che passa in streaming verso il client: tiene
 * solo l'inizio (per `model`) e la coda (dove i provider mettono `usage`),
 * non il corpo intero. Una risposta piccola si legge tutta.
 */
export function createJsonUsageTap(provider: GatewayProvider) {
  const HEAD = 8_192;
  const TAIL = 65_536;
  const decoder = new TextDecoder();
  let head = "";
  let tail = "";
  let total = 0;
  return {
    push(chunk: Uint8Array) {
      const s = decoder.decode(chunk, { stream: true });
      total += s.length;
      if (head.length < HEAD) head += s.slice(0, HEAD - head.length);
      tail = (tail + s).slice(-TAIL);
    },
    result(): UsageResult {
      tail = (tail + decoder.decode()).slice(-TAIL);
      if (total <= TAIL) {
        try {
          return usageFromJson(provider, JSON.parse(tail));
        } catch {
          // non JSON (es. errore HTML del provider): niente uso
        }
      }
      const model = /"model"\s*:\s*"([^"\\]{1,200})"/.exec(head)?.[1] ?? null;
      const at = tail.lastIndexOf('"usage"');
      if (at < 0) return { inputTokens: 0, outputTokens: 0, model, seen: false };
      const open = tail.indexOf("{", at);
      let depth = 0;
      for (let i = open; open >= 0 && i < tail.length; i++) {
        if (tail[i] === "{") depth++;
        else if (tail[i] === "}" && --depth === 0) {
          try {
            const r = usageFromJson(provider, { usage: JSON.parse(tail.slice(open, i + 1)), model });
            return r;
          } catch {
            break;
          }
        }
      }
      return { inputTokens: 0, outputTokens: 0, model, seen: false };
    },
  };
}

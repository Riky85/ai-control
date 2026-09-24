import { db } from "@/lib/db";

// Ultimo momento in cui abbiamo salvato ciascun messaggio: niente valanghe
// di righe identiche se lo stesso errore si ripete in loop.
const recent = new Map<string, number>();

export async function recordError(source: "server" | "client", err: unknown, extra?: { path?: string; digest?: string; organizationId?: string | null }) {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const message = (e.message || "Unknown error").slice(0, 1000);
    const key = `${source}:${message}`;
    const now = Date.now();
    if ((recent.get(key) ?? 0) > now - 60_000) return;
    recent.set(key, now);
    if (recent.size > 500) recent.clear();
    await db.errorEvent.create({
      data: {
        source,
        message,
        digest: extra?.digest ?? (e as any).digest ?? null,
        path: extra?.path?.slice(0, 500) ?? null,
        stack: e.stack?.slice(0, 4000) ?? null,
        organizationId: extra?.organizationId ?? null,
      },
    });
  } catch {
    // il registro degli errori non deve mai generare altri errori
  }
}

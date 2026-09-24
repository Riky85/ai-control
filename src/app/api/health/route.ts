import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Controllo di salute per Railway e per il monitoraggio: il servizio risponde
// e il database è raggiungibile. Nessun dato sensibile nella risposta.
export async function GET() {
  const started = Date.now();
  let database = "ok";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    database = "unreachable";
  }
  const missing = ["DATABASE_URL", "SESSION_SECRET", "CREDENTIALS_SECRET"].filter((k) => !process.env[k]);
  const healthy = database === "ok" && missing.length === 0;
  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      config: missing.length ? `missing: ${missing.join(", ")}` : "ok",
      version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
      responseMs: Date.now() - started,
    },
    { status: healthy ? 200 : 503 }
  );
}

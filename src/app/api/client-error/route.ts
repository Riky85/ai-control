import { recordError } from "@/lib/errors";
import { currentSession } from "@/lib/auth";

// Errori dal browser (dagli error boundary). Solo utenti autenticati.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { message?: string; digest?: string; path?: string; stack?: string };
    const err = new Error(String(body.message ?? "Client error").slice(0, 1000));
    if (body.stack) err.stack = String(body.stack).slice(0, 4000);
    await recordError("client", err, { digest: body.digest, path: body.path, organizationId: currentSession()?.orgId ?? null });
  } catch {
    // corpo non valido: ignorato
  }
  return new Response(null, { status: 204 });
}

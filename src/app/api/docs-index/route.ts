import { currentSession } from "@/lib/auth";
import { DOCS } from "@/lib/docs";

export const dynamic = "force-dynamic";

// Elenco delle guide (senza corpo) calcolato una volta sola: è statico, cambia solo con un deploy.
const INDEX = DOCS.map(({ slug, title, section, summary }) => ({ slug, title, section, summary }));

/**
 * Indice della documentazione per il pannello di aiuto (AskDocs), che lo chiede
 * alla prima apertura invece di riceverlo come prop a ogni navigazione.
 */
export async function GET() {
  if (!currentSession()) return Response.json({ error: "Sign in first." }, { status: 401 });
  // Cache solo nel browser dell'utente (dietro login): un'ora.
  return Response.json({ docs: INDEX }, { headers: { "Cache-Control": "private, max-age=3600" } });
}

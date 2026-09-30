import { currentSession } from "@/lib/auth";
import { clientIp, rateLimit, retryAfter } from "@/lib/rate-limit";
import { docsAnswer } from "@/lib/assistant";

const RATE = { limit: 30, windowMs: 3_600_000 };

export const dynamic = "force-dynamic";

/**
 * Assistente "Ask docs": risponde solo dalla documentazione di angar.
 * Nessun dato dei clienti viene inviato al modello: solo la domanda e il testo della documentazione.
 */
export async function POST(req: Request) {
  const who = currentSession()?.accountId ?? `ip:${clientIp(req.headers)}`;
  if (!rateLimit(`assistant:${who}`, RATE.limit, RATE.windowMs)) {
    return Response.json({ answer: "You've asked a lot of questions in the last hour — try again a bit later, or browse the Docs tab.", sources: [], mode: "limited" }, { status: 429, headers: { "Retry-After": String(retryAfter(RATE.limit, RATE.windowMs)) } });
  }
  const { question, history } = (await req.json().catch(() => ({}))) as { question?: string; history?: unknown };
  const q = String(question ?? "").trim().slice(0, 1000);
  if (!q) return Response.json({ answer: "Ask me anything about using angar.", sources: [] });
  return Response.json(await docsAnswer(q, history));
}

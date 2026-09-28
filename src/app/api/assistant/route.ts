import { DOCS, searchDocs } from "@/lib/docs";
import { currentSession } from "@/lib/auth";
import { clientIp, rateLimit, retryAfter } from "@/lib/rate-limit";

type Turn = { role: "user" | "assistant"; content: string };
const RATE = { limit: 30, windowMs: 3_600_000 };

/** Storico pulito: solo ruoli validi, ultimi 12 messaggi da max 4000 caratteri, inizia sempre con "user". */
function cleanHistory(h: unknown): Turn[] {
  const list = (Array.isArray(h) ? h : [])
    .filter((m): m is Turn => !!m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (list.length && list[0].role !== "user") list.shift();
  // Due messaggi consecutivi dello stesso ruolo: si tiene l'ultimo (l'API vuole l'alternanza).
  const out: Turn[] = [];
  for (const m of list) {
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1] = m;
    else out.push(m);
  }
  if (out.length && out[out.length - 1].role === "user") out.pop();
  return out;
}

export const dynamic = "force-dynamic";

/**
 * Assistente "Ask docs": risponde solo dalla documentazione di angar.
 * Con ANTHROPIC_API_KEY (variabile di piattaforma) usa Claude; senza,
 * restituisce gli articoli più pertinenti. Nessun dato dei clienti viene
 * inviato al modello: solo la domanda e il testo della documentazione.
 */
export async function POST(req: Request) {
  // Per sessione (o per IP senza sessione): 30 domande all'ora.
  const who = currentSession()?.accountId ?? `ip:${clientIp(req.headers)}`;
  if (!rateLimit(`assistant:${who}`, RATE.limit, RATE.windowMs)) {
    return Response.json({ answer: "You've asked a lot of questions in the last hour — try again a bit later, or browse the Docs tab.", sources: [], mode: "limited" }, { status: 429, headers: { "Retry-After": String(retryAfter(RATE.limit, RATE.windowMs)) } });
  }
  const { question, history } = (await req.json().catch(() => ({}))) as { question?: string; history?: unknown };
  const q = String(question ?? "").trim().slice(0, 1000);
  if (!q) return Response.json({ answer: "Ask me anything about using angar.", sources: [] });

  const sources = searchDocs(q, 3).map((d) => ({ slug: d.slug, title: d.title }));
  const key = process.env.ANTHROPIC_API_KEY;

  if (key) {
    try {
      const docs = DOCS.map((d) => `### ${d.title} (/docs/${d.slug})\n${d.summary}\n${d.body}`).join("\n\n");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.ASSISTANT_MODEL ?? "claude-haiku-4-5-20251001",
          max_tokens: 600,
          // La documentazione è uguale per tutte le domande: prompt caching (meno costo e latenza).
          system: [
            {
              type: "text",
              text:
                "You are the in-app help assistant of angar, an AI estate intelligence SaaS. Answer ONLY from the documentation below. " +
                "Reply in the user's language, in 2-6 short sentences or numbered steps, plainly, no markdown headings. " +
                "If the docs don't cover it, say so and suggest the closest article. Never invent features.\n\n" + docs,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [...cleanHistory(history), { role: "user", content: q }],
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const answer = (json.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n").trim();
        if (answer) return Response.json({ answer, sources, mode: "ai" });
      }
    } catch {
      // ricade sulla ricerca negli articoli
    }
  }

  const top = searchDocs(q, 3);
  if (top.length === 0) {
    return Response.json({
      answer: "I couldn't find that in the documentation. Try other words, or browse the articles in the Docs tab.",
      sources: [],
      mode: "search",
    });
  }
  return Response.json({ answer: `${top[0].summary}`, sources: top.map((d) => ({ slug: d.slug, title: d.title })), mode: "search" });
}

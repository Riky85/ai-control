import { DOCS, searchDocs } from "@/lib/docs";

export const dynamic = "force-dynamic";

/**
 * Assistente "Ask docs": risponde solo dalla documentazione di Angar.
 * Con ANTHROPIC_API_KEY (variabile di piattaforma) usa Claude; senza,
 * restituisce gli articoli più pertinenti. Nessun dato dei clienti viene
 * inviato al modello: solo la domanda e il testo della documentazione.
 */
export async function POST(req: Request) {
  const { question, history } = (await req.json().catch(() => ({}))) as { question?: string; history?: { role: "user" | "assistant"; content: string }[] };
  const q = String(question ?? "").trim().slice(0, 1000);
  if (!q) return Response.json({ answer: "Ask me anything about using Angar.", sources: [] });

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
          system:
            "You are the in-app help assistant of Angar, an AI estate intelligence SaaS. Answer ONLY from the documentation below. " +
            "Reply in the user's language, in 2-6 short sentences or numbered steps, plainly, no markdown headings. " +
            "If the docs don't cover it, say so and suggest the closest article. Never invent features.\n\n" + docs,
          messages: [...(history ?? []).slice(-6), { role: "user", content: q }],
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

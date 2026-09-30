import { DOCS, searchDocs } from "@/lib/docs";

type Turn = { role: "user" | "assistant"; content: string };

/** Storico pulito: solo ruoli validi, ultimi 12 messaggi da max 4000 caratteri, inizia sempre con "user". */
export function cleanHistory(h: unknown): Turn[] {
  const list = (Array.isArray(h) ? h : [])
    .filter((m): m is Turn => !!m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (list.length && list[0].role !== "user") list.shift();
  const out: Turn[] = [];
  for (const m of list) {
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1] = m;
    else out.push(m);
  }
  if (out.length && out[out.length - 1].role === "user") out.pop();
  return out;
}

/**
 * Risposta dalla documentazione. Con ANTHROPIC_API_KEY usa Claude; senza,
 * restituisce gli articoli più pertinenti. `brief` (facoltativo) aggiunge un
 * riassunto numerico del workspace, così l'assistente risponde anche sui dati.
 */
export async function docsAnswer(q: string, history: unknown, brief?: string): Promise<{ answer: string; sources: { slug: string; title: string }[]; mode: string }> {
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
          system: [
            {
              type: "text",
              text:
                "You are the in-app assistant of angar, an AI spend and AI usage SaaS. Answer ONLY from the documentation and the workspace data below. " +
                "Reply in the user's language, in 2-6 short sentences or numbered steps, plainly, no markdown headings. " +
                "If neither covers it, say so and suggest the closest article. Never invent features or numbers.\n\n" + docs,
              cache_control: { type: "ephemeral" },
            },
            ...(brief ? [{ type: "text", text: `Workspace data (live):\n${brief}` }] : []),
          ],
          messages: [...cleanHistory(history), { role: "user", content: q }],
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const answer = (json.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n").trim();
        if (answer) return { answer, sources, mode: "ai" };
      }
    } catch {
      // ricade sulla ricerca negli articoli
    }
  }
  const top = searchDocs(q, 3);
  if (top.length === 0) return { answer: "I couldn't find that in the documentation. Try other words, or browse the articles in the Docs tab.", sources: [], mode: "search" };
  return { answer: top[0].summary, sources: top.map((d) => ({ slug: d.slug, title: d.title })), mode: "search" };
}

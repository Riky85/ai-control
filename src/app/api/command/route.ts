import { currentSession } from "@/lib/auth";
import { rateLimit, retryAfter } from "@/lib/rate-limit";
import { runCommand, workspaceBrief } from "@/lib/command";
import { docsAnswer } from "@/lib/assistant";
import { aiAnswersAllowed } from "@/lib/eu-only";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
const RATE = { limit: 120, windowMs: 3_600_000 };

/**
 * Comandi e domande (scritti o a voce) dalla ricerca e dal pannello di aiuto.
 * Prima le regole sui dati del workspace; se non capiscono, la documentazione
 * (con Claude, se configurato, che vede anche un riassunto numerico del workspace —
 * mai sull'edizione on-premises né in modalità solo UE, del deployment o del workspace).
 */
export async function POST(req: Request) {
  const s = currentSession();
  if (!s) return Response.json({ error: "Sign in first." }, { status: 401 });
  // I comandi leggono i dati del workspace: solo membri ancora attivi.
  const member = await db.workspaceMember.findUnique({ where: { organizationId_email: { organizationId: s.orgId, email: s.email } }, select: { status: true } });
  if (!member || member.status !== "active") return Response.json({ error: "You no longer have access to this workspace." }, { status: 403 });
  if (!rateLimit(`command:${s.accountId}`, RATE.limit, RATE.windowMs)) {
    return Response.json({ handled: true, answer: "Too many questions in the last hour — try again a bit later." }, { status: 429, headers: { "Retry-After": String(retryAfter(RATE.limit, RATE.windowMs)) } });
  }
  const { text, history } = (await req.json().catch(() => ({}))) as { text?: string; history?: unknown };
  const q = String(text ?? "").trim().slice(0, 500);
  if (!q) return Response.json({ handled: false, answer: "" });

  const r = await runCommand(s.orgId, q);
  if (r.handled) return Response.json({ ...r, mode: "data" });

  // Claude solo se permesso (non on-prem, modalità solo UE spenta): altrimenti ricerca negli articoli.
  const ai = await aiAnswersAllowed(s.orgId);
  const brief = ai ? await workspaceBrief(s.orgId) : undefined;
  const d = await docsAnswer(q, history, brief, ai);
  return Response.json({ handled: true, answer: d.answer, sources: d.sources, mode: d.mode });
}

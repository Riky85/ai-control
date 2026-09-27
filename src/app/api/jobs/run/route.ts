import { timingSafeEqual } from "node:crypto";
import { runDueJobs } from "@/lib/jobs";
import { currentSession, isPlatformAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Esecuzione manuale dei lavori dovuti (sono comunque avviati ogni ora dal server).
// Consentito agli admin della piattaforma o con REPORT_TOKEN.
export async function POST(req: Request) {
  const expected = process.env.REPORT_TOKEN ?? process.env.BACKUP_TOKEN;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const tokenOk = !!expected && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  const s = currentSession();
  if (!tokenOk && !(s && (await isPlatformAdmin(s.email)))) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runDueJobs());
}

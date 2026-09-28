import { timingSafeEqual } from "node:crypto";
import { runDueJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

// Vecchio endpoint del cron mensile. Il report ora parte dallo scheduler interno
// (runDueJobs, il 1° del mese): qui si passa di lì, così un cron esterno ancora
// configurato non manda il report due volte (JobRun lo registra una volta sola).
// Protetto da REPORT_TOKEN (o BACKUP_TOKEN).
export async function POST(req: Request) {
  const expected = process.env.REPORT_TOKEN ?? process.env.BACKUP_TOKEN;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await runDueJobs());
}

import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { buildReport, reportText } from "@/lib/report";
import { sendEmail, appOrigin } from "@/lib/mail";
import { syncFattureInCloud } from "@/lib/connectors/fatture-in-cloud";

export const dynamic = "force-dynamic";

// Chiamato una volta al mese (cron): invia il report a owner e admin di ogni
// workspace che ha almeno un'AI. Protetto da REPORT_TOKEN (o BACKUP_TOKEN).
export async function POST(req: Request) {
  const expected = process.env.REPORT_TOKEN ?? process.env.BACKUP_TOKEN;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const orgs = await db.organization.findMany({ where: { aiAssets: { some: { deletedAt: null } } }, include: { members: { where: { role: { in: ["OWNER", "ADMIN"] } } } } });
  let sent = 0;
  for (const org of orgs) {
    // Prima si aggiornano le fatture automatiche, così il report è fresco.
    const fic = await db.connector.findUnique({ where: { organizationId_provider: { organizationId: org.id, provider: "FATTURE_IN_CLOUD" } } });
    if (fic?.credentialsEncrypted) await syncFattureInCloud(org.id).catch(() => {});
    const r = await buildReport(org.id);
    const text = reportText(r, appOrigin());
    for (const m of org.members) {
      const res = await sendEmail({ to: m.email, subject: `Your AI in ${r.month}: ${r.canSave > 0 ? `save ${Math.round(r.canSave)} €/month` : "all tidy"}`, text });
      if (res.sent) sent++;
    }
  }
  return Response.json({ organizations: orgs.length, sent });
}

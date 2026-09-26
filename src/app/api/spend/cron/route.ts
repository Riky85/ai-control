import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { syncBank } from "@/lib/connectors/bank";
import { syncAccounting } from "@/lib/connectors/chift";
import { syncFattureInCloud } from "@/lib/connectors/fatture-in-cloud";

export const dynamic = "force-dynamic";

// Ogni giorno: aggiorna costi da banche, contabilità e Fatture in Cloud per tutti i workspace.
// Protetto da REPORT_TOKEN (o BACKUP_TOKEN).
export async function POST(req: Request) {
  const expected = process.env.REPORT_TOKEN ?? process.env.BACKUP_TOKEN;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return new Response("Unauthorized", { status: 401 });
  const rows = await db.connector.findMany({ where: { provider: { in: ["BANK", "ACCOUNTING", "FATTURE_IN_CLOUD"] }, credentialsEncrypted: { not: null } } });
  const result = { ok: 0, failed: 0 };
  for (const r of rows) {
    const run = r.provider === "BANK" ? syncBank : r.provider === "ACCOUNTING" ? syncAccounting : syncFattureInCloud;
    try {
      await run(r.organizationId);
      result.ok++;
    } catch (err) {
      result.failed++;
      await db.connector.update({ where: { id: r.id }, data: { lastSyncError: (err as Error).message.slice(0, 500) } });
    }
  }
  return Response.json(result);
}

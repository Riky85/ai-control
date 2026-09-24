import { gzipSync } from "node:zlib";
import { db } from "@/lib/db";

/**
 * Backup logico completo: ogni tabella dello schema public esportata in
 * JSON e compressa. Si ripristina con scripts/restore-backup.ts. Contiene i
 * dati di TUTTI i workspace: va scaricato solo dall'admin di piattaforma.
 */
export async function createBackup(trigger: string) {
  const run = await db.backupRun.create({ data: { status: "running", location: trigger } });
  try {
    const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%' ORDER BY tablename`;
    const data: Record<string, unknown[]> = {};
    let rows = 0;
    for (const { tablename } of tables) {
      // Nome tabella da pg_tables, non da input utente; comunque quotato.
      const result = await db.$queryRawUnsafe<{ rows: unknown[] | null }[]>(`SELECT json_agg(t) AS rows FROM "${tablename.replace(/"/g, '""')}" t`);
      data[tablename] = result[0]?.rows ?? [];
      rows += data[tablename].length;
    }
    const payload = { format: "angar-backup/v1", createdAt: new Date().toISOString(), tables: data };
    const buffer = gzipSync(Buffer.from(JSON.stringify(payload)));
    await db.backupRun.update({
      where: { id: run.id },
      data: { status: "ok", finishedAt: new Date(), tables: tables.length, rows, bytes: buffer.length },
    });
    return { buffer, runId: run.id, tables: tables.length, rows };
  } catch (err) {
    await db.backupRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date(), error: (err as Error).message.slice(0, 500) } });
    throw err;
  }
}

export const backupFilename = () => `angar-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json.gz`;

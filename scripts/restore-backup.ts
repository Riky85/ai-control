/**
 * Ripristino di un backup Angar (angar-backup/v1) in un database Postgres.
 *
 *   DATABASE_URL=postgres://… npx tsx scripts/restore-backup.ts angar-backup-2026-09-24-02-00.json.gz
 *
 * ATTENZIONE: svuota le tabelle presenti nel backup prima di reinserirle.
 * Usarlo su un database NUOVO (lo schema va creato prima con
 * `npx prisma db push`), verificare, e solo poi puntarci l'applicazione.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npx tsx scripts/restore-backup.ts <backup.json.gz>");
  const backup = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"));
  if (backup.format !== "angar-backup/v1") throw new Error("Unknown backup format");
  const db = new PrismaClient();
  const tables = Object.keys(backup.tables);
  await db.$transaction(async (tx) => {
    // Disattiva i vincoli di chiave esterna durante il ripristino.
    await tx.$executeRawUnsafe(`SET session_replication_role = replica`);
    for (const t of tables) {
      const q = `"${t.replace(/"/g, '""')}"`;
      await tx.$executeRawUnsafe(`TRUNCATE ${q} CASCADE`);
      const rows = backup.tables[t] as unknown[];
      if (rows.length) await tx.$executeRawUnsafe(`INSERT INTO ${q} SELECT * FROM json_populate_recordset(NULL::${q}, $1::json)`, JSON.stringify(rows));
      console.log(`${t}: ${rows.length} rows`);
    }
    await tx.$executeRawUnsafe(`SET session_replication_role = DEFAULT`);
  }, { timeout: 10 * 60_000 });
  await db.$disconnect();
  console.log(`Restored ${tables.length} tables from backup created ${backup.createdAt}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

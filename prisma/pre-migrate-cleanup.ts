/**
 * Eseguito PRIMA di `prisma db push` nel preDeployCommand di Railway.
 *
 * Necessario solo per questo singolo cambio di schema: AssuranceLevel è
 * passato da 3 a 4 valori (FAILED -> RESTRICTED/BLOCKED). Postgres non
 * permette di alterare un enum rimuovendo un valore ancora referenziato da
 * righe esistenti, quindi svuotiamo AssuranceReport prima della migrazione.
 * È sicuro: sono solo snapshot ricalcolabili (stessa natura di
 * RiskAssessment), rigenerati subito dopo dal seed e da ogni sync futuro.
 * Questo script può essere rimosso una volta che il deploy è passato oltre
 * questa transizione.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  try {
    await db.$executeRawUnsafe(`DELETE FROM "AssuranceReport"`);
    console.log("Cleared AssuranceReport ahead of enum migration.");
  } catch (err) {
    // Tabella non ancora esistente (primo deploy in assoluto): non è un errore.
    console.log("AssuranceReport cleanup skipped (table likely doesn't exist yet):", (err as Error).message);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

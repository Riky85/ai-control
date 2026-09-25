import { PrismaClient } from "@prisma/client";
import { seedDemoData } from "../src/lib/demo-data";

const db = new PrismaClient();

// Gira a ogni deploy, ma carica i dati demo SOLO su un database vuoto:
// così un reset fatto dall'app non viene annullato dal deploy successivo.
async function main() {
  if ((await db.organization.count()) > 0) {
    console.log("Seed skipped: database already has workspaces.");
    return;
  }
  const org = await db.organization.create({
    data: { id: "demo-org", name: "Demo Manufacturing SpA", country: "IT", onboardingCompletedAt: new Date() },
  });
  await seedDemoData(db, org.id);
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

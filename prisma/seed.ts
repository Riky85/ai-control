import { PrismaClient } from "@prisma/client";
import { seedDemoData } from "../src/lib/demo-data";
import { syncPricingCatalog } from "../src/lib/pricing/catalog-sync";

const db = new PrismaClient();

// Gira a ogni deploy, ma carica i dati demo SOLO su un database vuoto:
// così un reset fatto dall'app non viene annullato dal deploy successivo.
async function main() {
  // Catalogo prezzi AI globale: a ogni deploy (idempotente, non tocca i dati delle aziende).
  try {
    const r = await syncPricingCatalog(db);
    console.log(`Pricing catalog ${r.version}: ${r.models} models, ${r.seatTypes} seat types, ${r.componentsCreated} prices added, ${r.componentsUpdated} updated.`);
  } catch (e) {
    // Mai bloccare il deploy per il catalogo: lo riprova il job periodico.
    console.error("Pricing catalog sync failed:", e);
  }
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
